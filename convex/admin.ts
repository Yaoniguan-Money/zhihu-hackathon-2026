import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { sha256Hex } from "@server/cases/hash.js";
import {
  assertPlayableCaseInvariants,
  canonicalParagraphPrivateSchema,
  casePrivateSchema,
  evidenceCatalogItemPrivateSchema,
  evidenceGraphPrivateSchema,
  evidenceUnlockRulePrivateSchema,
  goldenAnswerPrivateSchema,
  rolePrivatePolicySchema,
} from "@contracts/private/index.js";
import { casePublicSchema } from "@contracts/public/index.js";

/**
 * 内部管理与运维工具：仅 admin 路径（bunx convex run / 本地后端 HTTP 管理键）
 * 可调用，不通过任何公开 Interface 暴露。邀请码创建是真实运维需求；
 * 其余 seed 函数供集成测试构造额度/并发状态，绝不进入生产调用链。
 */

export const createInviteCode = internalMutation({
  args: {
    code: v.string(),
    max_uses: v.number(),
    expires_at_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.code.trim() === "") {
      throw new Error("邀请码明文不能为空");
    }
    const codeHash = await sha256Hex(args.code);
    const existing = await ctx.db
      .query("invite_codes")
      .withIndex("by_code_hash", (q) => q.eq("code_hash", codeHash))
      .unique();
    if (existing) {
      return { code_hash: codeHash, created: false };
    }
    await ctx.db.insert("invite_codes", {
      code_hash: codeHash,
      revoked: false,
      max_uses: args.max_uses,
      used_count: 0,
      ...(args.expires_at_ms !== undefined && {
        expires_at_ms: args.expires_at_ms,
      }),
      created_at_ms: Date.now(),
    });
    return { code_hash: codeHash, created: true };
  },
});

export const caseOwnerInternal = internalQuery({
  args: { case_key: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!doc) return null;
    return {
      owner_identity: doc.owner_identity ?? null,
      status: doc.status,
      visibility: doc.visibility,
    };
  },
});

export const compiledArtifactsInternal = internalQuery({
  args: { case_key: v.string() },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("source_documents")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!source || !privateDoc) return null;
    return {
      source_url: source.source_url,
      canonical_text: source.canonical_text,
      content_sha256: source.content_sha256,
      paragraphs_json: source.paragraphs_json,
      graph_json: privateDoc.graph_json,
      compiler_version: privateDoc.compiler_version,
    };
  },
});

/** 运维诊断工具：最近 N 条私有审计事件（只含事件名/ID/错误码/耗时，不含文本体）。 */
export const recentAuditInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    const rows = await ctx.db.query("private_audit").collect();
    rows.sort((a, b) => b.created_at_ms - a.created_at_ms);
    return rows.slice(0, limit).map((row) => ({
      event: row.event,
      case_id: row.case_id ?? null,
      session_id: row.session_id ?? null,
      task: row.task ?? null,
      attempt_index: row.attempt_index ?? null,
      duration_ms: row.duration_ms ?? null,
      detail_code: row.detail_code ?? null,
      created_at_ms: row.created_at_ms,
    }));
  },
});

/** 运维诊断工具：读取案件完整私有工件（TB2b 编译器端到端断言用）。 */
export const caseArtifactsInternal = internalQuery({
  args: { case_key: v.string() },
  handler: async (ctx, args) => {
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!privateDoc || !caseDoc) return null;
    return {
      status: caseDoc.status,
      visibility: caseDoc.visibility,
      title: caseDoc.title ?? null,
      summary: caseDoc.summary ?? null,
      theme: caseDoc.theme ?? null,
      public_json: caseDoc.public_json ?? null,
      policies_json: privateDoc.policies_json ?? null,
      golden_answer_json: privateDoc.golden_answer_json ?? null,
      catalog_json: privateDoc.catalog_json ?? null,
      rules_json: privateDoc.rules_json ?? null,
      rubric_json: privateDoc.rubric_json ?? null,
    };
  },
});

export const seedCreationUsage = internalMutation({
  args: {
    identity_token: v.string(),
    count: v.number(),
    utc_day: v.optional(v.string()),
    created_at_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.created_at_ms ?? Date.now();
    const day =
      args.utc_day ?? new Date(nowMs).toISOString().slice(0, 10);
    for (let i = 0; i < args.count; i += 1) {
      await ctx.db.insert("creation_usage", {
        identity_token: args.identity_token,
        utc_day: day,
        created_at_ms: nowMs - i,
      });
    }
    return { inserted: args.count };
  },
});

export const seedCompilingCase = internalMutation({
  args: { identity_token: v.string() },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const caseKey = `seed-${crypto.randomUUID()}`;
    await ctx.db.insert("cases", {
      case_key: caseKey,
      visibility: "user",
      owner_identity: args.identity_token,
      status: "compiling",
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    await ctx.db.insert("compilation_tickets", {
      case_key: caseKey,
      status: "accepted",
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    return { case_key: caseKey };
  },
});

/** 运维/测试工具：清空建案额度记账（不动案件、消息等业务数据）。 */
export const resetQuotaState = internalMutation({  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("creation_usage").collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
  },
});

/** 测试工具：把 Session 置于任意阶段（生产路径只能经 game.start 等契约入口变更）。 */
export const forcePhase = internalMutation({
  args: {
    session_key: v.string(),
    phase: v.union(
      v.literal("briefing"),
      v.literal("opening_statements"),
      v.literal("investigation"),
      v.literal("judging"),
      v.literal("revealed"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_key))
      .unique();
    if (!session) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    await ctx.db.patch(session._id, {
      phase: args.phase,
      updated_at_ms: Date.now(),
    });
    return { session_key: args.session_key, phase: args.phase };
  },
});

/** 测试工具：直接写入 Session 已解锁 Evidence（生产路径只能由服务器 Unlock Rule 计算）。 */
export const seedUnlockedEvidence = internalMutation({
  args: { session_id: v.string(), evidence_ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    let inserted = 0;
    for (const evidenceId of args.evidence_ids) {
      const existing = await ctx.db
        .query("session_evidence_unlocked")
        .withIndex("by_session", (q) =>
          q
            .eq("session_id", args.session_id)
            .eq("evidence_id", evidenceId),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("session_evidence_unlocked", {
        session_id: args.session_id,
        evidence_id: evidenceId,
        via_kind: "ask",
        unlocked_at_ms: nowMs,
      });
      inserted += 1;
    }
    return { inserted };
  },
});

/** 测试工具：构造一个处于 compiling 的孤儿案件 + 可带过期 lease 的编译票据。 */
export const seedStaleCompilation = internalMutation({
  args: {
    identity_token: v.string(),
    case_key: v.string(),
    lease_expires_at_ms: v.optional(v.number()),
    ticket_status: v.optional(
      v.union(v.literal("accepted"), v.literal("working")),
    ),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
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
      status: args.ticket_status ?? "working",
      ...(args.lease_expires_at_ms !== undefined && {
        lease_expires_at_ms: args.lease_expires_at_ms,
      }),
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    return { case_key: args.case_key };
  },
});

/** 测试工具：插入一个 accepted 的活动 Ticket 以制造排他锁占用（可带已过期 lease）。 */
export const seedActiveTicket = internalMutation({
  args: {
    session_id: v.string(),
    lease_expires_at_ms: v.optional(v.number()),
    // P1-1：可种子对质 Ticket 以验证对质与 ask 共用排他锁。
    kind: v.optional(
      v.union(
        v.literal("ask"),
        v.literal("present_recording"),
        v.literal("opening_statement"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const requestId = `seed-req-${crypto.randomUUID()}`;
    await ctx.db.insert("role_turn_tickets", {
      request_id: requestId,
      session_id: args.session_id,
      role_id: "role-observer",
      kind: args.kind ?? "ask",
      status: "accepted",
      ...(args.lease_expires_at_ms !== undefined && {
        lease_expires_at_ms: args.lease_expires_at_ms,
      }),
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    return { request_id: requestId };
  },
});

/**
 * 测试工具（P1-1/P1-2）：插入一条已批准角色消息及其 succeeded Ticket，
 * 复刻 finalizeTurnSuccess 的持久化形状（message_json + validation_json
 * 含 support_claim_ids + envelope_json），供 saveRecording / TTS Route
 * 无模型构造来源消息。绝不进入生产调用链：生产唯一路径是回合 worker。
 */
export const seedRoleMessage = internalMutation({
  args: {
    session_id: v.string(),
    role_id: v.string(),
    text: v.string(),
    support_claim_ids: v.array(v.string()),
    voice_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const messageId = `msg-${crypto.randomUUID()}`;
    const request_id = `seed-req-${crypto.randomUUID()}`;
    const roleMessage = {
      message_id: messageId,
      session_id: args.session_id,
      speaker_type: "role",
      speaker_id: args.role_id,
      exact_text: args.text,
      stance: "answer",
      emotion: "calm",
      created_at: new Date(nowMs).toISOString(),
    };
    await ctx.db.insert("messages", {
      session_id: args.session_id,
      message_id: messageId,
      payload_json: JSON.stringify(roleMessage),
      created_at_ms: nowMs,
    });
    const digest = await sha256Hex(args.text);
    const envelope = {
      request_id,
      message_id: messageId,
      role_id: args.role_id,
      exact_text: args.text,
      exact_text_sha256: `sha256:${digest}`,
      support_claim_ids: args.support_claim_ids,
      validation_id: `val-${crypto.randomUUID()}`,
      voice_id: args.voice_id ?? "voice-zh-01",
    };
    await ctx.db.insert("role_turn_tickets", {
      request_id,
      session_id: args.session_id,
      role_id: args.role_id,
      kind: "ask",
      status: "succeeded",
      message_json: JSON.stringify(roleMessage),
      validation_json: JSON.stringify({
        status: "entailed",
        detected_distortion_types: [],
        unsupported_spans: [],
        referenced_claim_ids: args.support_claim_ids,
        support_claim_ids: args.support_claim_ids,
      }),
      envelope_json: JSON.stringify(envelope),
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    return { message_id: messageId };
  },
});

/**
 * 内部操作：以冻结的 Golden 标注直接落库系统案件（不走模型，ADR 0004
 * 「进入系统目录只能由内部操作完成并经 A/B Golden 审批」）。
 * 写入边界经 contracts zod 复验 + 可玩案件不变量 + 跨字段一致性检查。
 * 幂等：case_key 已存在时返回 created:false。
 */
export const seedSystemCase = internalMutation({
  args: {
    case_key: v.string(),
    title: v.string(),
    summary: v.string(),
    theme: v.string(),
    source_url: v.string(),
    canonical_text: v.string(),
    content_sha256: v.string(),
    paragraphs_json: v.string(),
    public_json: v.string(),
    graph_json: v.string(),
    policies_json: v.string(),
    golden_answer_json: v.string(),
    catalog_json: v.string(),
    rules_json: v.string(),
    rubric_json: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (existing) {
      return { case_key: args.case_key, created: false };
    }

    // 写入边界复验（单一校验层）+ 跨字段一致性。
    const casePublic = casePublicSchema.parse(JSON.parse(args.public_json));
    const paragraphs = z
      .array(canonicalParagraphPrivateSchema)
      .parse(JSON.parse(args.paragraphs_json));
    const casePrivate = casePrivateSchema.parse({
      case_id: args.case_key,
      graph: evidenceGraphPrivateSchema.parse(JSON.parse(args.graph_json)),
      role_policies: z
        .array(rolePrivatePolicySchema)
        .parse(JSON.parse(args.policies_json)),
      golden_answer: goldenAnswerPrivateSchema.parse(
        JSON.parse(args.golden_answer_json),
      ),
      evidence_catalog: z
        .array(evidenceCatalogItemPrivateSchema)
        .parse(JSON.parse(args.catalog_json)),
      evidence_unlock_rules: z
        .array(evidenceUnlockRulePrivateSchema)
        .parse(JSON.parse(args.rules_json)),
    });
    assertPlayableCaseInvariants(casePrivate);
    const rubric = JSON.parse(args.rubric_json) as {
      case_id: string;
      criteria: { weight: number }[];
    };
    const rubricSum = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (rubric.case_id !== args.case_key || rubricSum !== 100) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    if (
      casePublic.case_id !== args.case_key ||
      casePrivate.case_id !== args.case_key ||
      casePrivate.graph.case_id !== args.case_key ||
      casePrivate.graph.source_id !== `src-${args.case_key}` ||
      casePublic.roles.length !== 5
    ) {
      throw new ConvexError({
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误",
      });
    }
    void paragraphs;

    const nowMs = Date.now();
    await ctx.db.insert("cases", {
      case_key: args.case_key,
      visibility: "system",
      status: "ready",
      title: args.title,
      summary: args.summary,
      theme: args.theme,
      source_url: args.source_url,
      public_json: JSON.stringify(casePublic),
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
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
      graph_json: JSON.stringify(casePrivate.graph),
      policies_json: JSON.stringify(casePrivate.role_policies),
      golden_answer_json: JSON.stringify(casePrivate.golden_answer),
      catalog_json: JSON.stringify(casePrivate.evidence_catalog),
      rules_json: JSON.stringify(casePrivate.evidence_unlock_rules),
      rubric_json: args.rubric_json,
      compiler_version: "golden-frozen@gc0",
      created_at_ms: nowMs,
    });
    return { case_key: args.case_key, created: true };
  },
});

/**
 * 运维诊断工具：在 action 运行时内执行一次最小结构化模型调用，
 * 返回 provider 层错误（含 cause），用于排查 AI_* 配置与供应商可用性。
 * 只返回错误文本，不记录任何 Secret。
 */
export const debugModelProbe = internalAction({
  args: {},
  handler: async (ctx) => {
    const { modelGatewayFor } = await import("./aiRuntime");
    const { z: zod } = await import("zod");
    try {
      const gateway = await modelGatewayFor(ctx);
      const result = await gateway.generateStructured({
        task: "role",
        schemaName: "probe",
        system: "只输出 JSON。",
        prompt: '输出 {"speech":"测试"}',
        schema: zod.object({ speech: zod.string() }),
      });
      return { ok: true as const, speech: result.speech };
    } catch (error) {
      const err = error as Error & { cause?: unknown; failure?: unknown };
      const failure = err.failure as { code?: string } | undefined;
      const cause = err.cause as Error | undefined;
      return {
        ok: false as const,
        name: err.name,
        message: err.message.slice(0, 300),
        failure_code: failure?.code ?? null,
        cause_name: cause?.name ?? null,
        cause_message: cause?.message?.slice(0, 500) ?? null,
      };
    }
  },
});
