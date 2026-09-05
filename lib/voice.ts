import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublicError } from "@contracts/public/index";

/**
 * P1-2：本地 Voice 同源 Route 的服务端辅助（CONTRACTS 14 / SPEC 5.6）。
 * Route 是 Browser 唯一入口；本地 Worker 只绑 127.0.0.1，Browser 不直连。
 * 显式配置：NEXT_PUBLIC_CONVEX_URL（Convex）与 VOICE_WORKER_URL（本地
 * Worker）缺失一律 SERVICE_NOT_CONFIGURED，不做任何默认值兜底。
 */

export type VoiceConfigError = { code: "SERVICE_NOT_CONFIGURED"; message: string };

export class PublicHttpError extends Error {
  constructor(
    readonly publicError: PublicError,
    readonly httpStatus: number,
  ) {
    super(publicError.code);
  }
}

export function requireBearer(request: Request): string {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    throw new PublicHttpError(
      { code: "AUTH_REQUIRED", message: "需要先建立会话身份" },
      401,
    );
  }
  return match[1]!;
}

export function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new PublicHttpError(
      { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，语音功能不可用" },
      503,
    );
  }
  return url;
}

/**
 * Convex HTTP action 基址（site URL）：本地为 :3211 端口、生产为
 * *.convex.site。与 API 端（.convex.cloud）不同源，必须显式配置。
 */
export function requireConvexSiteUrl(): string {
  const url = process.env.CONVEX_SITE_URL;
  if (!url) {
    throw new PublicHttpError(
      { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，语音功能不可用" },
      503,
    );
  }
  return url;
}

export function requireWorkerUrl(): string {
  const url = process.env.VOICE_WORKER_URL;
  if (!url) {
    throw new PublicHttpError(
      { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，语音功能不可用" },
      503,
    );
  }
  return url;
}

export async function convexCall(
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
  bearer: string,
): Promise<unknown> {
  const response = await fetch(`${requireConvexUrl()}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const bodyText = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  const payload =
    typeof body === "object" && body !== null
      ? (body as { status?: string; value?: unknown })
      : null;
  if (response.status === 200 && payload?.status === "success") {
    return payload.value;
  }
  throw convexError(body);
}

function convexError(body: unknown): PublicHttpError {
  const codeMessage = extractCodeMessage(body);
  return new PublicHttpError(
    codeMessage ?? { code: "SERVICE_UNAVAILABLE", message: "服务暂不可用" },
    httpStatusFor(codeMessage?.code),
  );
}

/** Convex HTTP 错误体：{status:"error", errorMessage:"<json payload 或文本>"}。 */
function extractCodeMessage(body: unknown): PublicError | null {
  if (typeof body !== "object" || body === null) return null;
  const errorMessage = (body as { errorMessage?: unknown }).errorMessage;
  if (typeof errorMessage !== "string") return null;
  try {
    const parsed = JSON.parse(errorMessage) as { code?: unknown; message?: unknown };
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.code === "string" &&
      typeof parsed.message === "string"
    ) {
      return { code: parsed.code as PublicError["code"], message: parsed.message };
    }
  } catch {
    // errorMessage 非 JSON：走关键字推断。
  }
  const knownCodes = [
    "AUTH_REQUIRED",
    "INVALID_ARGUMENT",
    "SESSION_NOT_FOUND",
    "SESSION_PHASE_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
  ];
  const hit = knownCodes.find((code) => errorMessage.includes(code));
  if (hit === "AUTH_REQUIRED") {
    return { code: "AUTH_REQUIRED", message: "需要先建立会话身份" };
  }
  if (hit === "INVALID_ARGUMENT") return { code: hit, message: "请求参数不合法" };
  if (hit === "SESSION_NOT_FOUND") return { code: hit, message: "对局不存在或不可访问" };
  if (hit === "SESSION_PHASE_CONFLICT") {
    return { code: hit, message: "当前阶段不能合成语音" };
  }
  if (hit === "IDEMPOTENCY_CONFLICT") {
    return { code: hit, message: "同一操作 ID 已被不同内容使用" };
  }
  return null;
}

export function httpStatusFor(code: string | undefined): number {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "INVALID_ARGUMENT":
      return 400;
    case "SESSION_NOT_FOUND":
      return 404;
    case "SESSION_PHASE_CONFLICT":
      return 409;
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "SERVICE_NOT_CONFIGURED":
      return 503;
    case "INTERNAL_INCIDENT":
      return 500;
    default:
      return 422;
  }
}

/** 统一错误出口：PublicHttpError → Public Error 响应；其余为 SERVICE_UNAVAILABLE。 */
export function errorResponse(error: unknown): Response {
  if (error instanceof PublicHttpError) {
    return Response.json(error.publicError, { status: error.httpStatus });
  }
  return Response.json(
    { code: "SERVICE_UNAVAILABLE", message: "服务暂不可用" },
    { status: 503 },
  );
}

/** 本地 Worker 调用；不可达按 provider 失败处理（VOICE_ASR/TTS_FAILED）。 */
export async function workerCall(
  path: "/asr" | "/tts",
  init: RequestInit,
): Promise<Response> {
  // 配置解析在 try 之外：SERVICE_NOT_CONFIGURED 不得被 provider 失败吞掉。
  const workerUrl = requireWorkerUrl();
  try {
    return await fetch(`${workerUrl}${path}`, init);
  } catch {
    const code = path === "/asr" ? "VOICE_ASR_FAILED" : "VOICE_TTS_FAILED";
    throw new PublicHttpError(
      {
        code,
        message:
          path === "/asr"
            ? "语音识别失败，请改用键盘输入"
            : "语音合成失败，文字内容不受影响",
      },
      502,
    );
  }
}

/** worker 内部错误码 → Public Error（CONTRACTS 13.3 Voice 列）。 */
export function workerError(code: string): PublicHttpError {
  switch (code) {
    case "TOO_LONG":
      return new PublicHttpError(
        { code: "VOICE_AUDIO_TOO_LONG", message: "录音超过 30 秒，请重新录制" },
        422,
      );
    case "NO_SPEECH":
      return new PublicHttpError(
        { code: "VOICE_NO_SPEECH", message: "未检测到语音内容" },
        422,
      );
    case "VOICE_NOT_IN_PACK":
      return new PublicHttpError(
        { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，语音功能不可用" },
        503,
      );
    case "BAD_REQUEST":
      return new PublicHttpError({ code: "INVALID_ARGUMENT", message: "请求参数不合法" }, 400);
    case "DECODE_FAILED":
    case "ASR_FAILED":
      return new PublicHttpError(
        { code: "VOICE_ASR_FAILED", message: "语音识别失败，请改用键盘输入" },
        502,
      );
    default:
      return new PublicHttpError(
        { code: "VOICE_TTS_FAILED", message: "语音合成失败，文字内容不受影响" },
        502,
      );
  }
}

export function sha256HexOf(data: ArrayBuffer | string): string {
  return createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data))
    .digest("hex");
}

export interface VoicePack {
  locked: boolean;
  voices: Record<string, { kokoro_voice: string; candidate?: boolean }>;
  pace_speed: Record<string, number>;
}

/** 显式音色包配置；缺失即 SERVICE_NOT_CONFIGURED（不做默认音色兜底）。 */
export function loadVoicePack(): VoicePack {
  try {
    const raw = readFileSync(
      join(process.cwd(), "voice-worker", "voice-pack.json"),
      "utf8",
    );
    return JSON.parse(raw) as VoicePack;
  } catch {
    throw new PublicHttpError(
      { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，语音功能不可用" },
      503,
    );
  }
}
