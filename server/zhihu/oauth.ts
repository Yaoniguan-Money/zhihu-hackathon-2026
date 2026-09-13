import { z } from "zod";
import {
  zhihuAuthorizeReceiptSchema,
  type ZhihuAuthorizeReceipt,
} from "@contracts/public/index.js";

/**
 * AUTH1：知乎黑客松 OAuth 协议纯函数层（docs/auth1-design-draft.md；
 * 官方事实源 .codex/skills/zhihu/references/hackathon-oauth.md、
 * hackathon-user-profile-api.md）。
 * 只做 URL 构造与响应解析，不做网络 IO、不读环境变量、不落库；
 * 网络与持久化由 convex/zhihuAuth.ts 编排，边界处按 typed failure 透出。
 */

/** 授权端点：用户在此页亲自完成知乎最终确认。 */
export const ZHIHU_AUTHORIZE_ENDPOINT = "https://openapi.zhihu.com/authorize";

/** Token 交换端点：application/x-www-form-urlencoded 表单。 */
export const ZHIHU_TOKEN_ENDPOINT = "https://openapi.zhihu.com/access_token";

/** 授权用户基础信息端点：仅需 OAuth token（Bearer），无需开放平台 Access Secret。 */
export const ZHIHU_USER_ENDPOINT = "https://openapi.zhihu.com/user";

/** state 有效期：5 分钟（草案 2 节）。 */
export const ZHIHU_STATE_TTL_MS = 5 * 60 * 1000;

/**
 * 回调完成后的跳转结果标识。stage 为闭环枚举，不含供应商原文与任何凭证；
 * 浏览器据此展示明确失败原因，不猜测、不静默重试。
 */
export const ZHIHU_CALLBACK_STAGES = [
  "code_missing",
  "state_missing",
  "state_invalid",
  "service_not_configured",
  "token_exchange_failed",
  "profile_invalid",
] as const;

export type ZhihuCallbackStage = (typeof ZHIHU_CALLBACK_STAGES)[number];

export type ZhihuOAuthConfig = {
  app_id: string;
  app_key: string;
  redirect_uri: string;
};

/** 构造授权页 URL（response_type=code 固定；state 一次性）。 */
export function buildZhihuAuthorizeUrl(input: {
  app_id: string;
  redirect_uri: string;
  state: string;
}): ZhihuAuthorizeReceipt {
  const url = new URL(ZHIHU_AUTHORIZE_ENDPOINT);
  url.searchParams.set("redirect_uri", input.redirect_uri);
  url.searchParams.set("app_id", input.app_id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return zhihuAuthorizeReceiptSchema.parse({ authorize_url: url.toString() });
}

/**
 * 生成 128-bit 随机 state（base64url）。草案要求服务端生成；
 * 使用 Web Crypto（与 server/cases/hash.ts 同一运行时假设），编码用
 * 字母表手写映射，不依赖 btoa（Convex 运行时不可靠）。
 */
export async function generateZhihuState(): Promise<string> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += alphabet[(b0 >> 2) & 0x3f]!;
    out += alphabet[((b0 << 4) | (b1 >> 4)) & 0x3f]!;
    if (i + 1 < bytes.length) out += alphabet[((b1 << 2) | (b2 >> 6)) & 0x3f]!;
    if (i + 2 < bytes.length) out += alphabet[b2 & 0x3f]!;
  }
  return out;
}

/**
 * 构造 /access_token 交换表单（官方实测字段名）：
 * grant_type 是固定枚举值；code 字段承载回调的 authorization_code。
 */
export function buildZhihuTokenExchangeForm(input: {
  config: ZhihuOAuthConfig;
  authorization_code: string;
}): URLSearchParams {
  return new URLSearchParams({
    app_id: input.config.app_id,
    app_key: input.config.app_key,
    grant_type: "authorization_code",
    redirect_uri: input.config.redirect_uri,
    code: input.authorization_code,
  });
}

const tokenPayloadSchema = z.object({
  access_token: z.string().min(1).optional(),
  expires_in: z.number().optional(),
  // 业务信封（code: 20000 表示成功，不能仅凭非零 code 判失败）。
  code: z.union([z.number(), z.string()]).optional(),
  message: z.unknown().optional(),
  data: z
    .object({
      access_token: z.string().min(1).optional(),
      expires_in: z.number().optional(),
    })
    .optional(),
});

export type ZhihuTokenExchange = {
  access_token: string;
  /** expires_in 缺失时为 null（有效期未知，由调用方按未过期处理并如实记录）。 */
  expires_in: number | null;
};

/**
 * 解析 Token 交换响应：以响应中是否存在 access_token 判定成功，
 * 兼容根字段与 data 信封两种形态；不做任何重试或猜测修复。
 */
export function parseZhihuTokenResponse(raw: string): ZhihuTokenExchange {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("token_response_unparseable");
  }
  const payload = tokenPayloadSchema.parse(json);
  const token = payload.access_token ?? payload.data?.access_token;
  if (!token) throw new Error("access_token_missing");
  const expiresIn = payload.expires_in ?? payload.data?.expires_in;
  return {
    access_token: token,
    expires_in: typeof expiresIn === "number" ? expiresIn : null,
  };
}

/**
 * 从 /user 原始响应文本无损提取 uid。uid 是 int64（示例 969570047710216200 已超
 * Number.MAX_SAFE_INTEGER），先 JSON.parse 再转字符串必然丢精度，因此在原始文本上
 * 用受限正则提取十进制数字串（官方 hackathon-user-profile-api.md 的硬性要求）。
 */
export function extractZhihuUidLossless(raw: string): string | null {
  const match = raw.match(/"uid"\s*:\s*(\d{1,20})(?=[,}\s]|$)/);
  return match ? match[1] : null;
}

const profilePayloadSchema = z.object({
  uid: z.union([z.number(), z.string()]).optional(),
  hash_id: z.string().optional(),
  fullname: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
  avatar_path: z.string().optional(),
  url: z.string().optional(),
});

export type ZhihuProfileFields = {
  /** 稳定标识：hash_id 优先，缺省时为无损提取的 uid 字符串。 */
  stable_id: string;
  fullname: string;
  headline: string;
  avatar_url: string;
  profile_url: string;
};

/**
 * 解析 /user 响应。必须拿到有效用户标识才建立绑定（鉴权失败/无标识不得用空对象
 * 建立登录态）；缺省字段归一为空字符串，额外扩展字段容忍。
 */
export function parseZhihuProfileResponse(raw: string): ZhihuProfileFields {
  const uidString = extractZhihuUidLossless(raw);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("profile_response_unparseable");
  }
  const payload = profilePayloadSchema.parse(json);
  const hashId = payload.hash_id?.trim();
  const stableId = hashId && hashId.length > 0 ? hashId : uidString;
  if (!stableId) throw new Error("profile_identifier_missing");
  return {
    stable_id: stableId,
    fullname: payload.fullname ?? "",
    headline: payload.headline ?? "",
    avatar_url: payload.avatar_path ?? "",
    profile_url: payload.url ?? "",
  };
}

/** 回调结束后的产品页跳转 URL（成功只带 success 标识，失败带 stage 枚举）。 */
export function buildZhihuCallbackRedirect(input: {
  app_origin: string;
  outcome: { ok: true } | { ok: false; stage: ZhihuCallbackStage };
}): string {
  const url = new URL(input.app_origin);
  url.searchParams.set("zhihu_auth", input.outcome.ok ? "success" : "failed");
  if (!input.outcome.ok) url.searchParams.set("stage", input.outcome.stage);
  return url.toString();
}

/** 校验登记回调地址并提取产品页 origin（回调完成后 302 回大厅）。 */
export function zhihuAppOrigin(redirect_uri: string): string {
  const url = new URL(redirect_uri);
  if (url.protocol !== "https:") {
    throw new Error("redirect_uri_not_https");
  }
  return url.origin;
}
