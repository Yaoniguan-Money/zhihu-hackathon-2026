import { z } from "zod";
import { PublicHttpError, errorResponse, requireBearer } from "@/lib/voice";
import {
  createStream,
  getStream,
  StreamCapacityError,
} from "@server/voice-stream/registry";

/**
 * P1-2b：流式语音管线上行音频帧（同源 Route，ADR 0006）。
 * 浏览器持续 POST PCM16LE 16k 单声道小帧（数百毫秒一帧）；
 * 头 X-Stream-Id（UUID）/ X-Session-Id / X-Seq（单调递增帧序）。
 * 流不存在时由首帧创建（绑定 session）。帧体只在本流内存存在。
 */

export const runtime = "nodejs";

/** 单帧上限：约 10 秒 16k PCM16；正常客户端帧远小于此。 */
const MAX_FRAME_BYTES = 320_000;

export async function POST(request: Request): Promise<Response> {
  try {
    const bearer = requireBearer(request);
    const streamId = request.headers.get("X-Stream-Id") ?? "";
    const sessionId = request.headers.get("X-Session-Id") ?? "";
    const seq = Number(request.headers.get("X-Seq") ?? "");
    if (
      !z.uuid().safeParse(streamId).success ||
      sessionId.trim() === "" ||
      !Number.isInteger(seq) ||
      seq < 0
    ) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length % 2 !== 0 || bytes.length > MAX_FRAME_BYTES) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "音频帧不合法" },
        400,
      );
    }
    const pcm = new Int16Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );

    let handle = getStream(streamId);
    if (handle && handle.sessionId !== sessionId) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "语音流与会话不匹配" },
        400,
      );
    }
    if (!handle) {
      handle = createStream(streamId, sessionId);
    }
    handle.pipeline.ingestAudio(pcm, bearer, seq);
    return Response.json({ ok: true, seq });
  } catch (error) {
    if (error instanceof StreamCapacityError) {
      return Response.json(
        { code: "RATE_LIMITED", message: "语音流数量已达上限，请稍后重试" },
        { status: 429 },
      );
    }
    return errorResponse(error);
  }
}
