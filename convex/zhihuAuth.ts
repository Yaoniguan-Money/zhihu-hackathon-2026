import { v } from "convex/values";
import {
  httpAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { zhihuProfilePublicSchema } from "@contracts/public/index.js";
import { throwPublicError } from "./publicErrors.js";
import {
  ZHIHU_STATE_TTL_MS,
  ZHIHU_TOKEN_ENDPOINT,
  ZHIHU_USER_ENDPOINT,
  buildZhihuAuthorizeUrl,
  buildZhihuCallbackRedirect,
  buildZhihuTokenExchangeForm,
  generateZhihuState,
  parseZhihuProfileResponse,
  parseZhihuTokenResponse,
  zhihuAppOrigin,
  type ZhihuCallbackStage,
  type ZhihuOAuthConfig,
} from "@server/zhihu/oauth.js";

/**
 * AUTH1：知乎 OAuth 登录（docs/auth1-design-draft.md）。
 * 协议细节在 server/zhihu/oauth.ts（纯函数）；本文件只做身份、持久化与网络编排。
 * access_token / app_key 只存在于服务端；公开查询仅回 ZhihuProfilePublic。
 * 部署环境要求：ZHIHU_OAUTH_APP_ID、ZHIHU_OAUTH_APP_KEY、ZHIHU_OAUTH_REDIRECT_URI
 * （与赛事页面登记的回调逐字符一致）；缺任一即 SERVICE_NOT_CONFIGURED，不猜测。
 */

function requireOAuthConfig(): ZhihuOAuthConfig {
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY;
  const redirectUri = process.env.ZHIHU_OAUTH_REDIRECT_URI;
  if (!appId || !appKey || !redirectUri) {
    throwPublicError(
      "SERVICE_NOT_CONFIGURED",
      "知乎登录未配置（ZHIHU_OAUTH_APP_ID / ZHIHU_OAUTH_APP_KEY / ZHIHU_OAUTH_REDIRECT_URI）",
    );
  }
  return { app_id: appId, app_key: appKey, redirect_uri: redirectUri };
}

async function requireIdentityToken(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
  }
  return identity.tokenIdentifier;
}

/** 发起授权：生成一次性 state（绑定当前身份、5 分钟 TTL），返回授权页 URL。 */
export const zhihuAuthorize = mutation({
  args: {},
  handler: async (ctx) => {
    const identityToken = await requireIdentityToken(ctx);
    const config = requireOAuthConfig();
    const state = await generateZhihuState();
    const nowMs = Date.now();
    // 同一身份重复发起：旧 state 置换（每身份同时至多一个进行中的授权）。
    const existing = await ctx.db
      .query("zhihu_oauth_states")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();
    if (existing) {
      // 128-bit 随机碰撞在实际中不可达；命中即内部不变量违规，显式失败。
      throwPublicError("INTERNAL_INCIDENT", "state 生成冲突，请重试");
    }
    // 清理该身份的旧 state（低频操作，直接扫描该表足够）。
    const stale = await ctx.db.query("zhihu_oauth_states").collect();
    for (const row of stale) {
      if (row.identity_token === identityToken || row.expires_at_ms <= nowMs) {
        await ctx.db.delete(row._id);
      }
    }
    await ctx.db.insert("zhihu_oauth_states", {
      state,
      identity_token: identityToken,
      created_at_ms: nowMs,
      expires_at_ms: nowMs + ZHIHU_STATE_TTL_MS,
    });
    return buildZhihuAuthorizeUrl({
      app_id: config.app_id,
      redirect_uri: config.redirect_uri,
      state,
    });
  },
});

/** 当前身份的知乎绑定资料；未绑定为 null。token 等服务端字段不在此投影。 */
export const zhihuMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const binding = await ctx.db
      .query("zhihu_bindings")
      .withIndex("by_identity", (q) =>
        q.eq("identity_token", identity.tokenIdentifier),
      )
      .first();
    if (!binding) return null;
    return zhihuProfilePublicSchema.parse({
      stable_id: binding.stable_id,
      fullname: binding.fullname,
      headline: binding.headline,
      avatar_url: binding.avatar_url,
      profile_url: binding.profile_url,
      bound_at: new Date(binding.bound_at_ms).toISOString(),
      expires_at:
        binding.token_expires_at_ms > 0
          ? new Date(binding.token_expires_at_ms).toISOString()
          : null,
    });
  },
});

/** 退出/解绑：删除服务端绑定与 token；匿名游玩数据不受影响（身份并存）。 */
export const zhihuUnbind = mutation({
  args: {},
  handler: async (ctx) => {
    const identityToken = await requireIdentityToken(ctx);
    const binding = await ctx.db
      .query("zhihu_bindings")
      .withIndex("by_identity", (q) =>
        q.eq("identity_token", identityToken),
      )
      .first();
    if (binding) await ctx.db.delete(binding._id);
    return null;
  },
});

/** 回调侧单次消费 state：取到即删（事务内），过期/不存在返回 null。 */
export const consumeZhihuOAuthState = internalMutation({
  args: { state: v.string(), now_ms: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("zhihu_oauth_states")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expires_at_ms <= args.now_ms) return null;
    return { identity_token: row.identity_token };
  },
});

/** 回调侧写入绑定：同身份覆盖旧绑定（重新授权 = 覆盖，不产生多行）。 */
export const saveZhihuBinding = internalMutation({
  args: {
    identity_token: v.string(),
    stable_id: v.string(),
    fullname: v.string(),
    headline: v.string(),
    avatar_url: v.string(),
    profile_url: v.string(),
    access_token: v.string(),
    token_expires_at_ms: v.number(),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("zhihu_bindings")
      .withIndex("by_identity", (q) =>
        q.eq("identity_token", args.identity_token),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updated_at_ms: nowMs,
      });
    } else {
      await ctx.db.insert("zhihu_bindings", {
        ...args,
        bound_at_ms: nowMs,
        updated_at_ms: nowMs,
      });
    }
  },
});

function failRedirect(
  appOrigin: string,
  stage: ZhihuCallbackStage,
): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildZhihuCallbackRedirect({
        app_origin: appOrigin,
        outcome: { ok: false, stage },
      }),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * OAuth 回调完成端点（Convex httpAction，由 Next Route 透传）。
 * state 是本端点的唯一能力凭证（单次消费、5 分钟 TTL）；成功以响应含
 * access_token 判定，随后必须拿到有效用户标识才建立绑定。
 * 失败一律 302 回产品页并携带 stage 枚举；不重试、不暴露供应商原文。
 */
export const zhihuCallback = httpAction(async (ctx: ActionCtx, request: Request) => {
  const config = requireOAuthConfigSafe();
  if (!config) {
    // 未配置时无法构造回跳 origin，只能返回显式 503 JSON（含 stage 枚举）。
    return jsonStageError("service_not_configured");
  }
  let appOrigin: string;
  try {
    appOrigin = zhihuAppOrigin(config.redirect_uri);
  } catch {
    return jsonStageError("service_not_configured");
  }
  const url = new URL(request.url);
  // 官方实测主参数为 authorization_code，兼容 code。
  const code =
    url.searchParams.get("authorization_code") ?? url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return failRedirect(appOrigin, "code_missing");
  if (!state) return failRedirect(appOrigin, "state_missing");

  const consumed = await ctx.runMutation(
    internal.zhihuAuth.consumeZhihuOAuthState,
    { state, now_ms: Date.now() },
  );
  if (!consumed) return failRedirect(appOrigin, "state_invalid");

  let token;
  try {
    const exchangeResponse = await fetch(ZHIHU_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildZhihuTokenExchangeForm({
        config,
        authorization_code: code,
      }).toString(),
    });
    const exchangeRaw = await exchangeResponse.text();
    token = parseZhihuTokenResponse(exchangeRaw);
  } catch {
    return failRedirect(appOrigin, "token_exchange_failed");
  }

  let profile;
  try {
    const profileResponse = await fetch(ZHIHU_USER_ENDPOINT, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profileRaw = await profileResponse.text();
    profile = parseZhihuProfileResponse(profileRaw);
  } catch {
    return failRedirect(appOrigin, "profile_invalid");
  }

  const expiresAtMs =
    token.expires_in !== null
      ? Date.now() + token.expires_in * 1000
      : 0;
  await ctx.runMutation(internal.zhihuAuth.saveZhihuBinding, {
    identity_token: consumed.identity_token,
    stable_id: profile.stable_id,
    fullname: profile.fullname,
    headline: profile.headline,
    avatar_url: profile.avatar_url,
    profile_url: profile.profile_url,
    access_token: token.access_token,
    token_expires_at_ms: expiresAtMs,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: buildZhihuCallbackRedirect({
        app_origin: appOrigin,
        outcome: { ok: true },
      }),
      "Cache-Control": "no-store",
    },
  });
});

function requireOAuthConfigSafe(): ZhihuOAuthConfig | null {
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY;
  const redirectUri = process.env.ZHIHU_OAUTH_REDIRECT_URI;
  if (!appId || !appKey || !redirectUri) return null;
  return { app_id: appId, app_key: appKey, redirect_uri: redirectUri };
}

function jsonStageError(stage: ZhihuCallbackStage): Response {
  return new Response(
    JSON.stringify({ zhihu_auth: "failed", stage }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
