import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { sha256Hex } from "@server/cases/hash.js";

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
