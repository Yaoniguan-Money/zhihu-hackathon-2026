import { v } from "convex/values";
import { z } from "zod";
import {
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  approvedSpeechEnvelopePrivateSchema,
} from "@contracts/private/index.js";
import {
  transcriptResultPublicSchema,
} from "@contracts/public/index.js";
import { clientActionIdSchema } from "@contracts/shared/index.js";
import { canonicalJson, sha256Hex } from "@server/cases/idempotency.js";
import { throwPublicError } from "./publicErrors.js";

/**
 * P1-2：本地 Voice 的 Convex 侧（CONTRACTS 14 / SPEC 5.6）。
 * - 同源 Route（Next）是 Browser 唯一入口；本文件只为其提供
 *   身份校验、Approved Speech Envelope 读取与幂等结果持久化。
 * - ASR/TTS 结果幂等持久化（CONTRACTS 14）；TTS WAV 存 Convex storage，
 *   idempotency_records.result_json 只存 storage_id 与元数据。
 * - 原始音频不入库：ASR 音频仅在请求内存中存在，处理后即丢弃。
 */

const OPERATION_ASR = "voice.transcriptions";
const OPERATION_TTS = "voice.speech";

const uuidSchema = z.uuid();

async function requireIdentityToken(
  ctx: { auth: import("./_generated/server").QueryCtx["auth"] },
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
  }
  return identity.tokenIdentifier;
}

/** Envelope 读取（TTS Route 调用，带用户 Bearer）。Owner 隔离与安全查找。 */
export const approvedEnvelope = query({
  args: { session_id: v.string(), message_id: v.string() },
  handler: async (ctx, args) => {
    const identityToken = await requireIdentityToken(ctx);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== identityToken) {
      throwPublicError("SESSION_NOT_FOUND", "对局不存在或不可访问");
    }
    if (session.phase !== "investigation") {
      throwPublicError("SESSION_PHASE_CONFLICT", "当前阶段不能合成语音");
    }
    const tickets = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "succeeded"),
      )
      .collect();
    for (const ticket of tickets) {
      if (!ticket.envelope_json) continue;
      const envelope = approvedSpeechEnvelopePrivateSchema.parse(
        JSON.parse(ticket.envelope_json),
      );
      if (envelope.message_id === args.message_id) {
        return {
          request_id: envelope.request_id,
          message_id: envelope.message_id,
          role_id: envelope.role_id,
          exact_text: envelope.exact_text,
          exact_text_sha256: envelope.exact_text_sha256,
          voice_id: envelope.voice_id,
          prosody: envelope.prosody ?? null,
        };
      }
    }
    return null;
  },
});

/** ASR 幂等查询：同 (identity, client_action_id, payload_hash) 返回首次结果。 */
export const asrResult = query({
  args: {
    client_action_id: v.string(),
    audio_sha256: v.string(),
  },
  handler: async (ctx, args) => {
    const identityToken = await requireIdentityToken(ctx);
    const payloadHash = await sha256Hex(
      canonicalJson({ mime_sha256: args.audio_sha256 }),
    );
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", identityToken)
          .eq("operation_name", OPERATION_ASR)
          .eq("scope_id", "")
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (!existing) return null;
    if (existing.payload_hash !== payloadHash) {
      throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
    }
    return transcriptResultPublicSchema.parse(JSON.parse(existing.result_json));
  },
});

/** ASR 结果持久化（Route 在 worker 成功后调用）。 */
export const recordAsr = mutation({
  args: {
    client_action_id: v.string(),
    audio_sha256: v.string(),
    text: v.string(),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    const identityToken = await requireIdentityToken(ctx);
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    const payloadHash = await sha256Hex(
      canonicalJson({ mime_sha256: args.audio_sha256 }),
    );
    const transcript = transcriptResultPublicSchema.parse({
      text: args.text,
      is_final: true,
      language: "zh",
      duration_ms: args.duration_ms,
    });
    await ctx.db.insert("idempotency_records", {
      identity_token: identityToken,
      operation_name: OPERATION_ASR,
      scope_id: "",
      client_action_id: args.client_action_id,
      payload_hash: payloadHash,
      result_json: JSON.stringify(transcript),
      created_at_ms: Date.now(),
    });
    return transcript;
  },
});

/** TTS 幂等查询：返回 storage_id 与元数据；未命中返回 null。 */
export const speechResult = query({
  args: {
    session_id: v.string(),
    client_action_id: v.string(),
    message_sha256: v.string(),
  },
  handler: async (ctx, args) => {
    const identityToken = await requireIdentityToken(ctx);
    const payloadHash = await sha256Hex(
      canonicalJson({ message_sha256: args.message_sha256 }),
    );
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", identityToken)
          .eq("operation_name", OPERATION_TTS)
          .eq("scope_id", args.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (!existing) return null;
    if (existing.payload_hash !== payloadHash) {
      throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
    }
    return JSON.parse(existing.result_json) as {
      storage_id: string;
      content_sha256: string;
      duration_ms: number;
    };
  },
});

// ---------------------------------------------------------------------------
// 语音文件存取（HTTP action：Next Route 以用户 Bearer 调用）

type AuthLike = {
  auth: {
    getUserIdentity: () => Promise<{ tokenIdentifier: string } | null>;
  };
};

async function identityFromRequest(
  ctx: AuthLike,
  request: Request,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  void request;
  if (!identity) {
    throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
  }
  return identity.tokenIdentifier;
}

/**
 * TTS 结果入库：body=WAV 字节；头 X-Session-Id / X-Client-Action-Id /
 * X-Payload-Hash / X-Content-Sha256 / X-Duration-Ms。
 * 幂等：记录已存在时不重复存储（同一 storage_id 原样返回）。
 */
export const storeSpeech = httpAction(async (ctx, request) => {
  const identityToken = await identityFromRequest(ctx, request);
  const sessionId = request.headers.get("X-Session-Id") ?? "";
  const clientActionId = request.headers.get("X-Client-Action-Id") ?? "";
  const payloadHash = request.headers.get("X-Payload-Hash") ?? "";
  const contentSha = request.headers.get("X-Content-Sha256") ?? "";
  const durationMs = Number(request.headers.get("X-Duration-Ms") ?? "-1");
  if (
    sessionId === "" ||
    !uuidSchema.safeParse(clientActionId).success ||
    payloadHash === "" ||
    !/^sha256:[0-9a-f]{64}$/.test(contentSha) ||
    !Number.isInteger(durationMs) ||
    durationMs < 0
  ) {
    throwPublicError("INVALID_ARGUMENT", "语音存储请求不合法");
  }
  const existing = await ctx.runQuery(internal.voice.speechRecordInternal, {
    identity_token: identityToken,
    session_id: sessionId,
    client_action_id: clientActionId,
  });
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
    }
    return new Response(JSON.stringify(existing.result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const storageId = await ctx.storage.store(new Blob([bytes.buffer as ArrayBuffer]));
  const result = {
    storage_id: storageId,
    content_sha256: contentSha,
    duration_ms: durationMs,
  };
  await ctx.runMutation(internal.voice.recordSpeechInternal, {
    identity_token: identityToken,
    session_id: sessionId,
    client_action_id: clientActionId,
    payload_hash: payloadHash,
    result,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/** TTS 结果读取（幂等重放）：同请求返回首次合成的同一 WAV。 */
export const getSpeech = httpAction(async (ctx, request) => {
  const identityToken = await identityFromRequest(ctx, request);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const clientActionId = url.searchParams.get("client_action_id") ?? "";
  if (sessionId === "" || !uuidSchema.safeParse(clientActionId).success) {
    throwPublicError("INVALID_ARGUMENT", "语音读取请求不合法");
  }
  const record = await ctx.runQuery(internal.voice.speechRecordInternal, {
    identity_token: identityToken,
    session_id: sessionId,
    client_action_id: clientActionId,
  });
  if (!record) {
    return new Response(null, { status: 404 });
  }
  const blob = await ctx.storage.get(record.result.storage_id);
  if (!blob) {
    throwPublicError("INTERNAL_INCIDENT", "服务内部错误，本次读取未生效");
  }
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "X-Content-Sha256": record.result.content_sha256,
      "X-Duration-Ms": String(record.result.duration_ms),
    },
  });
});

export const speechRecordInternal = internalQuery({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    client_action_id: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", args.identity_token)
          .eq("operation_name", OPERATION_TTS)
          .eq("scope_id", args.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (!existing) return null;
    return {
      payload_hash: existing.payload_hash,
      result: JSON.parse(existing.result_json) as {
        storage_id: string;
        content_sha256: string;
        duration_ms: number;
      },
    };
  },
});

export const recordSpeechInternal = internalMutation({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    client_action_id: v.string(),
    payload_hash: v.string(),
    result: v.object({
      storage_id: v.string(),
      content_sha256: v.string(),
      duration_ms: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("idempotency_records", {
      identity_token: args.identity_token,
      operation_name: OPERATION_TTS,
      scope_id: args.session_id,
      client_action_id: args.client_action_id,
      payload_hash: args.payload_hash,
      result_json: JSON.stringify(args.result),
      created_at_ms: Date.now(),
    });
  },
});
