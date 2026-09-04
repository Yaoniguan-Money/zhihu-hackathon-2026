import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery } from "./_generated/server";
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
export const resetQuotaState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("creation_usage").collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
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
