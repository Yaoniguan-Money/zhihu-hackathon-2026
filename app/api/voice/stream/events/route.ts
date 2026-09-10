import { z } from "zod";
import { PublicHttpError, errorResponse, requireBearer } from "@/lib/voice";
import { getStream } from "@server/voice-stream/registry";

/**
 * P1-2b：流式语音管线下行事件流（同源 Route，ADR 0006）。
 * JSON lines：每行一个 voiceStreamFrameSchema（contracts/public 14.5）。
 * 客户端用 fetch + ReadableStream 读取（可带 Authorization 头），
 * 断线后带 after_seq 重连续传（事件环形缓冲内）。
 * 流不存在/已回收返回 404，客户端据此重新发起。
 */

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    requireBearer(request);
    const url = new URL(request.url);
    const streamId = url.searchParams.get("stream_id") ?? "";
    const afterSeqRaw = url.searchParams.get("after_seq") ?? "-1";
    const afterSeq = Number(afterSeqRaw);
    if (!z.uuid().safeParse(streamId).success || !Number.isInteger(afterSeq)) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const handle = getStream(streamId);
    if (!handle) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "语音流不存在或已结束" },
        404,
      );
    }
    const pipeline = handle.pipeline;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (frame: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
          } catch {
            closed = true;
          }
        };
        const unsubscribe = pipeline.subscribe(afterSeq, write);
        const cleanup = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          try {
            controller.close();
          } catch {
            // 已被下游关闭。
          }
        };
        request.signal.addEventListener("abort", cleanup);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
