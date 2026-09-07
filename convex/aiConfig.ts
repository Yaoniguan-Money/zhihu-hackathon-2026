import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  providerRegistrySchema,
  resolveRegistryDoc,
} from "../server/model-gateway/config.js";
import { MODEL_TASKS, type ModelTask } from "../server/model-gateway/config.js";

/**
 * 多供应商注册表运行时配置（ADR 0003 补充决议）。
 * 单例表 ai_provider_config；管理接口以 AI_ADMIN_SECRET 口令门控，
 * 对外展示的 API Key 一律掩码。表为空时网关回退八项 AI_* 环境变量。
 */

function requireAdminSecret(secret: string): void {
  const expected = process.env.AI_ADMIN_SECRET;
  if (expected === undefined || expected.trim() === "") {
    throw new ConvexError({
      code: "ADMIN_NOT_CONFIGURED",
      incident_id: "admin:secret-missing",
      detail:
        "服务端未配置 AI_ADMIN_SECRET，管理接口不可用（用 `bunx convex env set AI_ADMIN_SECRET ...` 配置）",
    });
  }
  if (secret !== expected) {
    throw new ConvexError({
      code: "ADMIN_SECRET_INVALID",
      incident_id: "admin:secret-invalid",
      detail: "管理口令不正确",
    });
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 内部：网关构造时读取注册表；无单例文档返回 null（调用方回退 env）。 */
export const resolveRegistry = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("ai_provider_config")
      .withIndex("by_singleton", (q) => q.eq("singleton", true))
      .first();
    if (!doc) return null;
    return { registry_json: doc.registry_json, updated_at_ms: doc.updated_at_ms };
  },
});

/** 管理视图：掩码后的注册表 + 路由 + 当前生效来源（db 或 env）。 */
export const adminView = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    requireAdminSecret(args.secret);
    const doc = await ctx.db
      .query("ai_provider_config")
      .withIndex("by_singleton", (q) => q.eq("singleton", true))
      .first();
    if (doc) {
      const registry = resolveRegistryDoc(JSON.parse(doc.registry_json));
      return {
        source: "db" as const,
        updated_at_ms: doc.updated_at_ms,
        providers: registry.providers.map((p) => ({
          name: p.name,
          base_url: p.baseUrl,
          api_key_masked: maskKey(p.apiKey),
          enabled: p.enabled,
          model: p.model,
          models: p.models,
        })),
        routing: registry.routing,
      };
    }
    // env 回退视图：从八项 AI_* 合成单供应商注册表
    const env = process.env;
    const providerName = env.AI_PROVIDER_NAME ?? "";
    const tasks = MODEL_TASKS;
    return {
      source: "env" as const,
      updated_at_ms: null,
      providers: providerName
        ? [
            {
              name: providerName,
              base_url: env.AI_BASE_URL ?? "",
              api_key_masked: env.AI_API_KEY ? maskKey(env.AI_API_KEY) : "",
              enabled: true,
              model: undefined,
              models: Object.fromEntries(
                tasks.map((task: ModelTask) => [
                  task,
                  env[`AI_${task.toUpperCase()}_MODEL`],
                ]),
              ),
            },
          ]
        : [],
      routing: Object.fromEntries(tasks.map((task: ModelTask) => [task, providerName])),
    };
  },
});

/** 保存注册表（覆盖式）：api_key 留空表示沿用同名既有供应商的 Key（服务端合并）。 */
export const saveRegistry = mutation({
  args: {
    secret: v.string(),
    registry_json: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminSecret(args.secret);
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.registry_json);
    } catch {
      throw new ConvexError({
        code: "INPUT_SCHEMA_INVALID",
        incident_id: "admin:registry-json",
        detail: "注册表不是合法 JSON",
      });
    }
    const incoming = providerRegistrySchema.parse(parsed);
    const existingDoc = await ctx.db
      .query("ai_provider_config")
      .withIndex("by_singleton", (q) => q.eq("singleton", true))
      .first();
    const existing = existingDoc
      ? resolveRegistryDoc(JSON.parse(existingDoc.registry_json))
      : null;
    // 合并：空 Key = 沿用同名既有供应商的真实 Key（掩码值绝不入库）
    const providers = incoming.providers.map((p) => {
      if (p.api_key.trim() !== "") return p;
      const old = existing?.providers.find((x) => x.name === p.name);
      return { ...p, api_key: old?.apiKey ?? "" };
    });
    const merged = { providers, routing: incoming.routing };
    // 完整校验（URL/路由目标/启用供应商 Key/任务模型解析失败都会抛显式失败）
    resolveRegistryDoc(merged);
    const now = Date.now();
    const canonical = JSON.stringify(merged);
    if (existingDoc) {
      await ctx.db.patch(existingDoc._id, {
        registry_json: canonical,
        updated_at_ms: now,
      });
    } else {
      await ctx.db.insert("ai_provider_config", {
        singleton: true,
        registry_json: canonical,
        updated_at_ms: now,
      });
    }
    return { ok: true, updated_at_ms: now };
  },
});

/** 清空 DB 注册表：网关回退八项 AI_* 环境变量。 */
export const clearRegistry = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    requireAdminSecret(args.secret);
    const existing = await ctx.db
      .query("ai_provider_config")
      .withIndex("by_singleton", (q) => q.eq("singleton", true))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
