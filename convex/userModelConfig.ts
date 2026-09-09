import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  resolveRegistryDoc,
  type ResolvedGatewayConfig,
} from "@server/model-gateway/config.js";
import {
  OpenAICompatibleModelGateway,
  type ModelGateway,
} from "@server/model-gateway/openai-compatible-gateway.js";
import { validateAndProbeUserConfig } from "@server/model-gateway/user-config.js";
import { throwPublicError } from "./publicErrors.js";

/**
 * BYOK 用户级模型配置（ADR 0005）：模型调用的唯一运行时来源，无系统回退。
 * 保存 = schema 校验 → 真实连通性探针 → 成功才落库；API Key 只存服务端，
 * 任何读取只回掩码。网关每次模型调用实时解析，保存后下一跳即生效。
 */

function maskKey(key: string): string {
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

async function ownerIdentityOf(ctx: {
  auth: { getUserIdentity(): Promise<{ tokenIdentifier: string } | null> };
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throwPublicError("AUTH_REQUIRED", "请先进入对局建立身份后再配置模型服务");
  }
  return identity.tokenIdentifier;
}

function userConfigGatewayFor(config: ResolvedGatewayConfig): ModelGateway {
  return new OpenAICompatibleModelGateway(config);
}

/** 当前用户的模型配置视图；API Key 只回掩码，绝不回显明文。 */
export const myModelConfig = query({
  args: {},
  handler: async (ctx) => {
    const owner = await ownerIdentityOf(ctx);
    const doc = await ctx.db
      .query("ai_user_provider_config")
      .withIndex("by_owner", (q) => q.eq("owner_identity", owner))
      .first();
    if (!doc) {
      return { configured: false as const };
    }
    const registry = resolveRegistryDoc(JSON.parse(doc.registry_json));
    const provider = registry.providers[0];
    return {
      configured: true as const,
      provider_name: provider.name,
      base_url: provider.baseUrl,
      api_key_masked: maskKey(provider.apiKey),
      model: provider.model ?? "",
      models: provider.models,
      updated_at_ms: doc.updated_at_ms,
    };
  },
});

/** 测试并保存：探针成功才写入；任何失败都是 typed failure 且不落库。 */
interface SaveUserModelConfigResult {
  ok: true;
  updated_at_ms: number;
  api_key_masked: string;
}

export const saveUserModelConfig = action({
  args: {
    name: v.optional(v.string()),
    base_url: v.string(),
    api_key: v.string(),
    model: v.string(),
    models: v.optional(
      v.object({
        claim: v.optional(v.string()),
        case: v.optional(v.string()),
        role: v.optional(v.string()),
        validator: v.optional(v.string()),
        reveal: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<SaveUserModelConfigResult> => {
    const owner = await ownerIdentityOf(ctx);
    // api_key 留空 = 沿用已存配置的 Key（掩码值绝不入库）；无已存配置则为非法输入。
    let apiKey = args.api_key;
    if (apiKey.trim() === "") {
      const current = await ctx.runQuery(
        internal.userModelConfig.resolveUserRegistry,
        { owner_identity: owner },
      );
      if (!current) {
        throwPublicError("INVALID_ARGUMENT", "请填写 API Key");
      }
      apiKey = resolveRegistryDoc(JSON.parse(current.registry_json))
        .providers[0]!.apiKey;
    }
    const result = await validateAndProbeUserConfig(
      { ...args, api_key: apiKey },
      userConfigGatewayFor,
    );
    if (!result.ok) {
      if (result.reason === "invalid_input") {
        throwPublicError("INVALID_ARGUMENT", result.detail);
      }
      throwPublicError(
        "SERVICE_UNAVAILABLE",
        "无法连接到你配置的模型服务，请检查 Base URL、API Key 与模型名称后重试",
      );
    }
    // 探针成功才落库（action 无 db，写入经 internal mutation）。
    const written = await ctx.runMutation(
      internal.userModelConfig.writeUserConfig,
      {
        owner_identity: owner,
        registry_json: JSON.stringify(result.registry),
      },
    );
    return {
      ok: true as const,
      updated_at_ms: written.updated_at_ms,
      api_key_masked: maskKey(apiKey),
    };
  },
});

/** 清除我的配置：删除后模型调用回到显式失败（SERVICE_NOT_CONFIGURED）。 */
export const clearUserModelConfig = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await ownerIdentityOf(ctx);
    const existing = await ctx.db
      .query("ai_user_provider_config")
      .withIndex("by_owner", (q) => q.eq("owner_identity", owner))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true as const };
  },
});

/** 内部：探针成功后的 upsert 落库（action 无 db，写入收口在此）。 */
export const writeUserConfig = internalMutation({
  args: {
    owner_identity: v.string(),
    registry_json: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ai_user_provider_config")
      .withIndex("by_owner", (q) => q.eq("owner_identity", args.owner_identity))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        registry_json: args.registry_json,
        updated_at_ms: now,
      });
    } else {
      await ctx.db.insert("ai_user_provider_config", {
        owner_identity: args.owner_identity,
        registry_json: args.registry_json,
        updated_at_ms: now,
      });
    }
    return { updated_at_ms: now };
  },
});

/** 内部：网关构造时按 owner 实时读取；无行返回 null（调用方抛显式失败）。 */
export const resolveUserRegistry = internalQuery({
  args: { owner_identity: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("ai_user_provider_config")
      .withIndex("by_owner", (q) => q.eq("owner_identity", args.owner_identity))
      .first();
    if (!doc) return null;
    return {
      registry_json: doc.registry_json,
      updated_at_ms: doc.updated_at_ms,
    };
  },
});
