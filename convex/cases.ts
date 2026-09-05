import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { z } from "zod";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  caseCatalogItemPublicSchema,
  caseCompilationStatusPublicSchema,
  casePublicSchema,
  sourceDocumentPublicSchema,
  type CaseCompileReceipt,
  type CasePublic,
} from "@contracts/public/index.js";
import {
  assertEvidenceGraphInvariants,
  assertPlayableCaseInvariants,
  canonicalParagraphPrivateSchema,
  casePrivateSchema,
  evidenceCatalogItemPrivateSchema,
  evidenceGraphPrivateSchema,
  evidenceUnlockRulePrivateSchema,
  goldenAnswerPrivateSchema,
  rolePrivatePolicySchema,
  type CasePrivate,
  type PrivateFailure,
} from "@contracts/private/index.js";
import {
  ingestSourceSnapshot,
  locateSourceSpan,
  normalizeSourceText,
  SourceIngestionError,
  SOURCE_MAX_UTF16_CODE_UNITS,
} from "@server/source/normalize.js";
import {
  evaluateCreationQuota,
  utcDayKey,
} from "@server/cases/quota.js";
import {
  evaluateInviteCode,
} from "@server/cases/invites.js";
import {
  OPERATION_CREATE_FROM_SOURCE,
  payloadHashForCreateFromSource,
} from "@server/cases/idempotency.js";
import { sha256Hex } from "@server/cases/hash.js";
import {
  ModelRequestFailedError,
  OpenAICompatibleModelGateway,
} from "@server/model-gateway/openai-compatible-gateway.js";
import { ModelConfigMissingError } from "@server/model-gateway/config.js";
import {
  candidateClaimGraphSchema,
  claimExtractionSystemPrompt,
  claimExtractionUserPrompt,
  CLAIM_EXTRACTION_SCHEMA_VERSION,
} from "@server/model/schemas/claim-extraction.js";
import {
  candidateCaseCompilationSchema,
  caseCompilationSystemPrompt,
  caseCompilationUserPrompt,
  CASE_COMPILATION_SCHEMA_VERSION,
} from "@server/model/schemas/case-compilation.js";
import {
  compileCaseFromCandidates,
  CaseInvariantFailure,
} from "@server/cases/compile-case.js";
import {
  compileContextPublicError,
  throwPublicError,
} from "./publicErrors.js";

/**
 * cases.createFromSource / observeCompilation / listPublic（TB1）。
 * 契约事实来源：CONTRACTS 4.3–4.5、12、13.3；ADR 0004。
 * 权威状态写入全部经 internalMutation 原子完成；action 只做校验、
 * 幂等/额度/邀请码判定（经 mutation）与模型调用（worker）。
 */

const uuidSchema = z.uuid();
const httpsUrlSchema = z.url({ protocol: /^https$/ });

// ---------------------------------------------------------------------------
// 公开 Interface

export const createFromSource = action({
  args: {
    source_url: v.string(),
    source_text: v.string(),
    theme: v.optional(v.string()),
    invite_code: v.string(),
    client_action_id: v.string(),
  },
  handler: async (ctx, args): Promise<CaseCompileReceipt> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    if (!httpsUrlSchema.safeParse(args.source_url).success) {
      throwPublicError("SOURCE_INVALID", "source_url 必须是绝对 HTTPS URL");
    }
    const canonical = normalizeSourceText(args.source_text);
    if (canonical.trim() === "") {
      throwPublicError("SOURCE_INVALID", "正文为空或仅空白字符");
    }
    if (canonical.length > SOURCE_MAX_UTF16_CODE_UNITS) {
      throwPublicError("SOURCE_TOO_LONG", "正文超过长度上限");
    }

    const payload_hash = await payloadHashForCreateFromSource({
      source_url: args.source_url,
      source_text: canonical,
      theme: args.theme ?? null,
      invite_code: args.invite_code,
    });

    const { receipt }: { receipt: CaseCompileReceipt } = await ctx.runMutation(
      internal.cases.initializeCreation,
      {
        identity_token: identity.tokenIdentifier,
        client_action_id: args.client_action_id,
        case_key: crypto.randomUUID(),
        payload_hash,
        source_url: args.source_url,
        canonical_text: canonical,
        theme: args.theme,
        invite_code: args.invite_code,
      },
    );
    return receipt;
  },
});

export const observeCompilation = query({
  args: { case_id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    // 不存在与不可访问返回同一安全结果（CONTRACTS 4.3）。
    if (!caseDoc) return null;
    if (
      caseDoc.visibility === "user" &&
      caseDoc.owner_identity !== identity.tokenIdentifier
    ) {
      return null;
    }
    const ticket = await ctx.db
      .query("compilation_tickets")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    if (!ticket) return null;
    const error =
      ticket.status === "failed" && ticket.error_json
        ? (JSON.parse(ticket.error_json) as { code: string; message: string })
        : undefined;
    return caseCompilationStatusPublicSchema.parse({
      case_id: args.case_id,
      status: ticket.status,
      ...(error !== undefined && { error }),
    });
  },
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => {    const docs = await ctx.db
      .query("cases")
      .withIndex("by_case_key")
      .filter((q) => q.eq(q.field("visibility"), "system"))
      .collect();
    return docs.map((doc) => {
      if (
        doc.status !== "ready" ||
        doc.title === undefined ||
        doc.summary === undefined ||
        doc.theme === undefined ||
        doc.source_url === undefined
      ) {
        throw new ConvexError({
          code: "INTERNAL_INCIDENT",
          message: "服务内部错误",
        });
      }
      return caseCatalogItemPublicSchema.parse({
        case_id: doc.case_key,
        title: doc.title,
        summary: doc.summary,
        theme: doc.theme,
        source_url: doc.source_url,
      });
    });
  },
});

export const getPublic = query({
  args: { case_id: v.string() },
  handler: async (ctx, args): Promise<CasePublic | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    // 不存在、越权与未 ready 都返回同一安全 null（CONTRACTS 4.3/4.4）。
    if (!caseDoc) return null;
    if (
      caseDoc.visibility === "user" &&
      caseDoc.owner_identity !== identity.tokenIdentifier
    ) {
      return null;
    }
    if (caseDoc.status !== "ready" || !caseDoc.public_json) return null;
    return casePublicSchema.parse(JSON.parse(caseDoc.public_json));
  },
});

export const getSource = query({
  args: { case_id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    if (!caseDoc) return null;
    if (
      caseDoc.visibility === "user" &&
      caseDoc.owner_identity !== identity.tokenIdentifier
    ) {
      return null;
    }
    if (caseDoc.status !== "ready") return null;
    const source = await ctx.db
      .query("source_documents")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    if (!source) return null;
    return sourceDocumentPublicSchema.parse({
      source_id: `src-${caseDoc.case_key}`,
      case_id: caseDoc.case_key,
      source_url: source.source_url,
      canonical_text: source.canonical_text,
      content_sha256: source.content_sha256,
    });
  },
});

// ---------------------------------------------------------------------------
// 内部：建案初始化（幂等 → 邀请码 → 额度 → 消耗与建 Ticket，单事务）

export const initializeCreation = internalMutation({
  args: {
    identity_token: v.string(),
    client_action_id: v.string(),
    case_key: v.string(),
    payload_hash: v.string(),
    source_url: v.string(),
    canonical_text: v.string(),
    theme: v.optional(v.string()),
    invite_code: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ receipt: CaseCompileReceipt }> => {
    const nowMs = Date.now();

    // 1) 幂等（先于阶段校验与额度扣减，CONTRACTS 12）
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", args.identity_token)
          .eq("operation_name", OPERATION_CREATE_FROM_SOURCE)
          .eq("scope_id", "")
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== args.payload_hash) {
        throwPublicError(
          "IDEMPOTENCY_CONFLICT",
          "同一操作 ID 已被不同内容使用",
        );
      }
      return { receipt: JSON.parse(existing.result_json) as CaseCompileReceipt };
    }

    // 2) 邀请码（只比对哈希；拒绝原因不外泄）
    const codeHash = await sha256Hex(args.invite_code);
    const invite = await ctx.db
      .query("invite_codes")
      .withIndex("by_code_hash", (q) => q.eq("code_hash", codeHash))
      .unique();
    const inviteCheck = evaluateInviteCode(
      invite
        ? {
            code_hash: invite.code_hash,
            expires_at_ms: invite.expires_at_ms ?? null,
            revoked: invite.revoked,
            max_uses: invite.max_uses,
            used_count: invite.used_count,
          }
        : undefined,
      codeHash,
      nowMs,
    );
    if (!inviteCheck.ok) {
      throwPublicError("CASE_CREATION_NOT_ALLOWED", "邀请码不可用");
    }

    // 3) 额度：滚动 24h / 并发 / 全站 UTC 日
    const usageRows = await ctx.db
      .query("creation_usage")
      .withIndex("by_identity_created", (q) =>
        q.eq("identity_token", args.identity_token),
      )
      .collect();
    const concurrentCases = await ctx.db
      .query("cases")
      .withIndex("by_owner_status", (q) =>
        q.eq("owner_identity", args.identity_token).eq("status", "compiling"),
      )
      .collect();
    const day = utcDayKey(nowMs);
    const dayRows = await ctx.db
      .query("creation_usage")
      .withIndex("by_day", (q) => q.eq("utc_day", day))
      .collect();
    const quota = evaluateCreationQuota({
      sourceLengthUnits: args.canonical_text.length,
      rollingWindowTimestampsMs: usageRows.map((row) => row.created_at_ms),
      concurrentActiveCompilations: concurrentCases.length,
      globalTodayCount: dayRows.length,
    });
    if (!quota.ok) {
      if (quota.reason === "SOURCE_TOO_LONG") {
        throwPublicError("SOURCE_TOO_LONG", "正文超过长度上限");
      }
      throwPublicError("RATE_LIMITED", "建案额度已用尽，请稍后再试");
    }

    // 4) 消耗额度并原子创建 Case + Ticket + 幂等记录
    await ctx.db.insert("creation_usage", {
      identity_token: args.identity_token,
      utc_day: day,
      created_at_ms: nowMs,
    });
    if (invite) {
      await ctx.db.patch(invite._id, {
        used_count: invite.used_count + 1,
      });
    }
    await ctx.db.insert("cases", {
      case_key: args.case_key,
      visibility: "user",
      owner_identity: args.identity_token,
      status: "compiling",
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    await ctx.db.insert("compilation_tickets", {
      case_key: args.case_key,
      status: "accepted",
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    const receipt: CaseCompileReceipt = {
      case_id: args.case_key,
      status: "accepted",
    };
    await ctx.db.insert("idempotency_records", {
      identity_token: args.identity_token,
      operation_name: OPERATION_CREATE_FROM_SOURCE,
      scope_id: "",
      client_action_id: args.client_action_id,
      payload_hash: args.payload_hash,
      result_json: JSON.stringify(receipt),
      created_at_ms: nowMs,
    });

    await ctx.scheduler.runAfter(0, internal.cases.compileCaseWorker, {
      case_key: args.case_key,
      source_url: args.source_url,
      canonical_text: args.canonical_text,
      theme: args.theme,
    });

    return { receipt };
  },
});

// ---------------------------------------------------------------------------
// 内部：编译 worker（真实外部 Seam；失败是结果，不回退 fixture）

function toPrivateFailure(error: unknown): PrivateFailure {
  if (error instanceof ModelConfigMissingError) return error.failure;
  if (error instanceof ModelRequestFailedError) return error.failure;
  if (error instanceof SourceIngestionError) return error.failure;
  if (error instanceof CaseInvariantFailure) return error.failure;
  if (error instanceof z.ZodError) {
    // 模型候选未通过严格运行时 schema：协议级失败（SPEC §6），不是重写机会。
    return {
      code: "MODEL_PROTOCOL_INVALID",
      incident_id: `worker:${Date.now().toString(36)}`,
      detail: "模型输出未通过严格运行时 schema",
    };
  }
  return {
    code: "INTERNAL_INVARIANT_VIOLATION",
    incident_id: `worker:${Date.now().toString(36)}`,
    detail: error instanceof Error ? error.message : "未知编译错误",
  };
}

export const compileCaseWorker = internalAction({
  args: {
    case_key: v.string(),
    source_url: v.string(),
    canonical_text: v.string(),
    theme: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.runQuery(internal.cases.ticketStatusInternal, {
      case_key: args.case_key,
    });
    if (!ticket || ticket.status !== "accepted") {
      // 防御：Ticket 不处于待编译状态时不重复处理。
      return;
    }
    await ctx.runMutation(internal.cases.markTicketWorking, {
      case_key: args.case_key,
    });

    try {
      // 1) Source Ingestion（A1，纯转换）
      const article = await ingestSourceSnapshot({
        source_url: args.source_url,
        source_text: args.canonical_text,
      });
      const numberedParagraphs = article.paragraphs.map((p) =>
        article.canonical_text.slice(p.start, p.end),
      );

      // 2) 模型候选（真实外部 Seam；maxRetries=0，无修复无重试）
      const gateway = OpenAICompatibleModelGateway.fromEnv();
      const candidate = await gateway.generateStructured({
        task: "claim",
        schemaName: CLAIM_EXTRACTION_SCHEMA_VERSION,
        system: claimExtractionSystemPrompt(),
        prompt: claimExtractionUserPrompt({ numberedParagraphs }),
        schema: candidateClaimGraphSchema,
      });

      // 3) 服务器分配可信 ID、定位 Span、装配并校验图谱
      const claims = candidate.claims.map((claim, index) => {
        const { start, end } = locateSourceSpan(
          article.canonical_text,
          article.paragraphs,
          {
            paragraph_index: claim.paragraph_index,
            excerpt: claim.excerpt,
          },
        );
        return {
          claim_id: `cl-${index + 1}`,
          proposition: claim.proposition,
          ...(claim.subject !== undefined && { subject: claim.subject }),
          ...(claim.predicate !== undefined && { predicate: claim.predicate }),
          ...(claim.object !== undefined && { object: claim.object }),
          ...(claim.time !== undefined && { time: claim.time }),
          ...(claim.scope !== undefined && { scope: claim.scope }),
          ...(claim.condition !== undefined && { condition: claim.condition }),
          ...(claim.modality !== undefined && { modality: claim.modality }),
          source_span: {
            start,
            end,
            text: claim.excerpt,
            paragraph_index: claim.paragraph_index,
          },
          source_ref: `src-${args.case_key}`,
          confidence: 1,
        };
      });
      const relations = candidate.relations.map((relation, index) => {
        const from = claims[relation.from_claim_index];
        const to = claims[relation.to_claim_index];
        if (!from || !to) {
          throw new SourceIngestionError({
            code: "SOURCE_SPAN_INVALID",
            incident_id: "span:relation_endpoint",
            detail: "Relation 端点下标不存在",
          });
        }
        return {
          relation_id: `rel-${index + 1}`,
          from_claim_id: from.claim_id,
          to_claim_id: to.claim_id,
          type: relation.type,
        };
      });
      const graph = evidenceGraphPrivateSchema.parse({
        case_id: args.case_key,
        source_id: `src-${args.case_key}`,
        claims,
        relations,
      });
      assertEvidenceGraphInvariants(graph);

      // 5) 案件编译候选（真实外部 Seam；模型只出内容与下标引用）
      const compilationCandidate = candidateCaseCompilationSchema.parse(
        await gateway.generateStructured({
          task: "case",
          schemaName: CASE_COMPILATION_SCHEMA_VERSION,
          system: caseCompilationSystemPrompt(),
          prompt: caseCompilationUserPrompt({
            claims: claims.map((claim) => ({
              proposition: claim.proposition,
              excerpt: claim.source_span.text,
            })),
            relations: candidate.relations,
          }),
          schema: candidateCaseCompilationSchema,
        }),
      );

      // 6) 服务器完成全部决定：可信 ID、voice、4+1、答案子集、
      //    unlock rule、rubric（总和恰 100）与 Public Projection
      const artifacts = compileCaseFromCandidates({
        case_id: args.case_key,
        source_url: args.source_url,
        theme: args.theme ?? null,
        graph,
        candidate: compilationCandidate,
      });

      // 7) 原子持久化：source + 完整 Private + Public 投影，一次 ready
      await ctx.runMutation(internal.cases.finalizeCompilationSuccess, {
        case_key: args.case_key,
        source_url: args.source_url,
        canonical_text: article.canonical_text,
        content_sha256: article.content_sha256,
        paragraphs_json: JSON.stringify(article.paragraphs),
        graph_json: JSON.stringify(artifacts.case_private.graph),
        compiler_version: CASE_COMPILATION_SCHEMA_VERSION,
        title: artifacts.case_public.title,
        summary: artifacts.case_public.summary,
        theme: artifacts.case_public.theme,
        public_json: JSON.stringify(artifacts.case_public),
        policies_json: JSON.stringify(artifacts.case_private.role_policies),
        golden_answer_json: JSON.stringify(artifacts.case_private.golden_answer),
        catalog_json: JSON.stringify(artifacts.case_private.evidence_catalog),
        rules_json: JSON.stringify(artifacts.evidence_unlock_rules),
        rubric_json: JSON.stringify(artifacts.rubric),
      });
    } catch (error) {
      const failure = toPrivateFailure(error);
      await ctx.runMutation(internal.cases.finalizeCompilationFailure, {
        case_key: args.case_key,
        failure_json: JSON.stringify(failure),
      });
    }
  },
});

// ---------------------------------------------------------------------------
// 内部：状态迁移与持久化

export const ticketStatusInternal = internalQuery({
  args: { case_key: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("compilation_tickets")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!ticket) return null;
    return { status: ticket.status };
  },
});

export const markTicketWorking = internalMutation({
  args: { case_key: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("compilation_tickets")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!ticket) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    if (ticket.status !== "accepted") {
      // 幂等：重复调度下不回退已推进的状态。
      return;
    }
    await ctx.db.patch(ticket._id, {
      status: "working",
      updated_at_ms: Date.now(),
    });
  },
});

export const finalizeCompilationSuccess = internalMutation({
  args: {
    case_key: v.string(),
    source_url: v.string(),
    canonical_text: v.string(),
    content_sha256: v.string(),
    paragraphs_json: v.string(),
    graph_json: v.string(),
    compiler_version: v.string(),
    title: v.string(),
    summary: v.string(),
    theme: v.string(),
    public_json: v.string(),
    policies_json: v.string(),
    golden_answer_json: v.string(),
    catalog_json: v.string(),
    rules_json: v.string(),
    rubric_json: v.string(),
  },
  handler: async (ctx, args) => {
    // 写入边界经 contracts runtime schema 复验（单一校验层）。
    const graph = evidenceGraphPrivateSchema.parse(JSON.parse(args.graph_json));
    assertEvidenceGraphInvariants(graph);
    const paragraphs = z
      .array(canonicalParagraphPrivateSchema)
      .parse(JSON.parse(args.paragraphs_json));
    void paragraphs; // 段落索引随案件整体持久化，读取侧按需解析。
    const casePublic = casePublicSchema.parse(JSON.parse(args.public_json));
    const policies = z
      .array(rolePrivatePolicySchema)
      .parse(JSON.parse(args.policies_json));
    const goldenAnswer = goldenAnswerPrivateSchema.parse(
      JSON.parse(args.golden_answer_json),
    );
    const catalog = z
      .array(evidenceCatalogItemPrivateSchema)
      .parse(JSON.parse(args.catalog_json));
    const rules = z
      .array(evidenceUnlockRulePrivateSchema)
      .parse(JSON.parse(args.rules_json));
    const rubric = JSON.parse(args.rubric_json) as {
      case_id: string;
      criteria: { weight: number }[];
    };
    const rubricSum = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (
      rubric.case_id !== args.case_key ||
      rubricSum !== 100 ||
      !rubric.criteria.every((c) => Number.isInteger(c.weight))
    ) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    const compiledCase: CasePrivate = casePrivateSchema.parse({
      case_id: args.case_key,
      graph,
      role_policies: policies,
      golden_answer: goldenAnswer,
      evidence_catalog: catalog,
      evidence_unlock_rules: rules,
    });
    assertPlayableCaseInvariants(compiledCase);
    if (
      casePublic.case_id !== args.case_key ||
      compiledCase.case_id !== args.case_key ||
      compiledCase.graph.case_id !== args.case_key ||
      compiledCase.graph.source_id !== `src-${args.case_key}` ||
      casePublic.roles.length !== 5
    ) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }

    const nowMs = Date.now();
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    const ticket = await ctx.db
      .query("compilation_tickets")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!caseDoc || !ticket) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    if (ticket.status === "succeeded") return; // 幂等：重复 finalize 不重写

    await ctx.db.insert("source_documents", {
      case_key: args.case_key,
      source_url: args.source_url,
      canonical_text: args.canonical_text,
      content_sha256: args.content_sha256,
      paragraphs_json: args.paragraphs_json,
      created_at_ms: nowMs,
    });
    await ctx.db.insert("case_private", {
      case_key: args.case_key,
      graph_json: JSON.stringify(graph),
      policies_json: JSON.stringify(policies),
      golden_answer_json: JSON.stringify(goldenAnswer),
      catalog_json: JSON.stringify(catalog),
      rules_json: JSON.stringify(rules),
      rubric_json: args.rubric_json,
      compiler_version: args.compiler_version,
      created_at_ms: nowMs,
    });
    await ctx.db.patch(caseDoc._id, {
      status: "ready",
      title: args.title,
      summary: args.summary,
      theme: args.theme,
      public_json: JSON.stringify(casePublic),
      updated_at_ms: nowMs,
    });
    await ctx.db.patch(ticket._id, {
      status: "succeeded",
      updated_at_ms: nowMs,
    });
  },
});

export const finalizeCompilationFailure = internalMutation({
  args: { case_key: v.string(), failure_json: v.string() },
  handler: async (ctx, args) => {
    const failure = JSON.parse(args.failure_json) as PrivateFailure;
    const publicError = compileContextPublicError(failure);

    const nowMs = Date.now();
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    const ticket = await ctx.db
      .query("compilation_tickets")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!caseDoc || !ticket) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    if (ticket.status === "failed") return; // 幂等：重复 finalize 不重写

    // 编译失败不留下可玩 Case：status=failed、无 public 投影（CONTRACTS 4.4）。
    await ctx.db.patch(caseDoc._id, {
      status: "failed",
      updated_at_ms: nowMs,
    });
    await ctx.db.patch(ticket._id, {
      status: "failed",
      error_json: JSON.stringify(publicError),
      updated_at_ms: nowMs,
    });
  },
});
