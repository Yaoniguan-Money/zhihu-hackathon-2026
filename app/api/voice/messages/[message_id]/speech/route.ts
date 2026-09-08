import { z } from "zod";
import {
  PublicHttpError,
  convexCall,
  loadVoicePack,
  requireBearer,
  requireConvexSiteUrl,
  segmentApprovedText,
  sha256HexOf,
  workerCall,
  workerError,
  errorResponse,
} from "@/lib/voice";

/**
 * P1-2：同源 TTS Route（CONTRACTS 14，含分段 transport）。
 * 只接受 Message ID（不接受客户端 text / voice_id / prosody）；服务器读取
 * 对应 Approved Speech Envelope 并验证文本哈希，使用该 Role 的 voice 与
 * pace 调用本地 Worker。
 * - 无 segment：合成文本逐字等于 exact_text（整段，手动播放路径）。
 * - 有 segment：exact_text 由服务器确定性按句切分，仅合成该分段
 *   （逐字为 exact_text 的连续子串）；响应带 X-Segment-Index / X-Segment-Total。
 * 幂等：重放返回首次合成的同一 WAV（Convex storage 持久化）；分段请求的
 * 幂等键纳入 segment 值，客户端应对每个分段使用独立 client_action_id。
 */

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ message_id: string }> },
): Promise<Response> {
  try {
    const bearer = requireBearer(request);
    const { message_id } = await context.params;
    if (message_id.trim() === "") {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const parsed = z
      .strictObject({
        session_id: z.string().min(1),
        client_action_id: z.uuid(),
        segment: z.number().int().min(0).optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const { session_id, client_action_id } = parsed.data;
    const segmentIndex = parsed.data.segment;

    // 读取 Approved Speech Envelope（服务器唯一合法来源）。
    // 分段路径需先取得 exact_text 才能确定性切分与校验越界，故先于幂等查询
    //（Envelope 读取是纯读动作，不违反 CONTRACTS 12 的"幂等先于模型/存储动作"）。
    const envelope = (await convexCall(
      "query",
      "voice:approvedEnvelope",
      { session_id, message_id },
      bearer,
    )) as {
      exact_text: string;
      exact_text_sha256: string;
      voice_id: string;
      prosody: { pace: string } | null;
    } | null;
    if (envelope === null) {
      throw new PublicHttpError(
        { code: "VOICE_TTS_FAILED", message: "语音合成失败，文字内容不受影响" },
        422,
      );
    }
    // 文本哈希验证（CONTRACTS 14）：信封内容必须自洽。
    if (`sha256:${sha256HexOf(envelope.exact_text)}` !== envelope.exact_text_sha256) {
      throw new PublicHttpError(
        { code: "INTERNAL_INCIDENT", message: "服务内部错误，本次合成未生效" },
        500,
      );
    }

    const segments = segmentApprovedText(envelope.exact_text);
    const hasSegment = segmentIndex !== undefined;
    if (hasSegment && (segments.length === 0 || segmentIndex >= segments.length)) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "分段不存在" },
        400,
      );
    }
    const synthesisText = hasSegment ? segments[segmentIndex]! : envelope.exact_text;
    const messageSha = `sha256:${sha256HexOf(
      JSON.stringify(hasSegment ? { session_id, message_id, segment: segmentIndex } : { session_id, message_id }),
    )}`;
    const segmentHeaders: Record<string, string> = hasSegment
      ? {
          "X-Segment-Index": String(segmentIndex),
          "X-Segment-Total": String(segments.length),
        }
      : {};

    // 幂等命中先于一切模型/存储动作（CONTRACTS 12）。
    const replay = (await convexCall(
      "query",
      "voice:speechResult",
      { session_id, client_action_id, message_sha256: messageSha },
      bearer,
    )) as { storage_id: string; content_sha256: string; duration_ms: number } | null;
    if (replay !== null) {
      const stored = await fetchStoredSpeech(bearer, session_id, client_action_id);
      return new Response(stored.bytes, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-Content-Sha256": stored.contentSha,
          "X-Duration-Ms": String(stored.durationMs),
          ...segmentHeaders,
        },
      });
    }

    // voice 与 pace 均来自显式配置的音色包；不做任何代码级默认音色。
    const pack = loadVoicePack();
    const packEntry = pack.voices[envelope.voice_id];
    if (!packEntry) {
      throw new PublicHttpError(
        { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，语音功能不可用" },
        503,
      );
    }
    const pace = envelope.prosody?.pace ?? "normal";
    const speed = pack.pace_speed[pace];
    if (typeof speed !== "number") {
      throw new PublicHttpError(
        { code: "INTERNAL_INCIDENT", message: "服务内部错误，本次合成未生效" },
        500,
      );
    }

    const workerResponse = await workerCall("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: synthesisText,
        voice: envelope.voice_id,
        speed: pace,
      }),
    });
    if (!workerResponse.ok) {
      const detail = (await workerResponse.json().catch(() => ({}))) as {
        code?: string;
      };
      throw workerError(detail.code ?? "TTS_FAILED");
    }
    const wav = new Uint8Array(await workerResponse.arrayBuffer());
    const contentSha = workerResponse.headers.get("X-Content-Sha256") ?? "";
    const durationMs = Number(workerResponse.headers.get("X-Duration-Ms") ?? "-1");
    if (contentSha === "" || !Number.isInteger(durationMs) || durationMs < 0) {
      throw new PublicHttpError(
        { code: "VOICE_TTS_FAILED", message: "语音合成失败，文字内容不受影响" },
        502,
      );
    }
    if (contentSha !== `sha256:${sha256HexOf(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength))}`) {
      throw new PublicHttpError(
        { code: "VOICE_TTS_FAILED", message: "语音合成失败，文字内容不受影响" },
        502,
      );
    }

    // 幂等持久化（Convex storage + idempotency_records）。
    const storeResponse = await fetch(
      `${requireConvexSiteUrl()}/api/voice/stored-speech`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Session-Id": session_id,
          "X-Client-Action-Id": client_action_id,
          "X-Payload-Hash": messageSha,
          "X-Content-Sha256": contentSha,
          "X-Duration-Ms": String(durationMs),
          "Content-Type": "application/octet-stream",
        },
        body: wav.buffer as ArrayBuffer,
      },
    );
    if (!storeResponse.ok) {
      const errorBody = await storeResponse.text();
      if (errorBody.includes("IDEMPOTENCY_CONFLICT")) {
        throw new PublicHttpError(
          { code: "IDEMPOTENCY_CONFLICT", message: "同一操作 ID 已被不同内容使用" },
          409,
        );
      }
      throw new PublicHttpError(
        { code: "VOICE_TTS_FAILED", message: "语音合成失败，文字内容不受影响" },
        502,
      );
    }

    return new Response(wav.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "X-Content-Sha256": contentSha,
        "X-Duration-Ms": String(durationMs),
        ...segmentHeaders,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function fetchStoredSpeech(
  bearer: string,
  sessionId: string,
  clientActionId: string,
): Promise<{ bytes: ArrayBuffer; contentSha: string; durationMs: number }> {
  const url = new URL(
    `${requireConvexSiteUrl()}/api/voice/stored-speech?session_id=${encodeURIComponent(sessionId)}&client_action_id=${encodeURIComponent(clientActionId)}`,
  );
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!response.ok) {
    throw new PublicHttpError(
      { code: "INTERNAL_INCIDENT", message: "服务内部错误，本次读取未生效" },
      500,
    );
  }
  return {
    bytes: await response.arrayBuffer(),
    contentSha: response.headers.get("X-Content-Sha256") ?? "",
    durationMs: Number(response.headers.get("X-Duration-Ms") ?? "0"),
  };
}
