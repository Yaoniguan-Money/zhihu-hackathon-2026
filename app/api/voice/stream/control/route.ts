import {
  errorResponse,
  PublicHttpError,
  requireBearer,
} from "@/lib/voice";
import { voiceStreamControlSchema } from "@contracts/public/index";
import { deleteStream, getStream } from "@server/voice-stream/registry";

/**
 * P1-2b：流式语音管线上行控制（同源 Route，ADR 0006）。
 * speak：按服务端 Approved Speech Envelope 流式合成并经事件流下发
 * （不接受客户端 text/voice/pace）；stop_speak：停止当前播报；
 * abort：终止整条流。speak 的异步失败经事件流以 typed failure 呈现，
 * 不让控制请求本身悬挂在模型耗时上。
 */

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const bearer = requireBearer(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const parsed = voiceStreamControlSchema.safeParse(body);
    if (!parsed.success) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const control = parsed.data;
    const handle = getStream(control.stream_id);
    if (!handle) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "语音流不存在或已结束" },
        404,
      );
    }
    if (control.action === "speak") {
      if (handle.sessionId !== control.session_id) {
        throw new PublicHttpError(
          { code: "SESSION_NOT_FOUND", message: "对局不存在或不可访问" },
          404,
        );
      }
      void handle.pipeline.speak(control.session_id, control.message_id, bearer);
    } else if (control.action === "stop_speak") {
      handle.pipeline.stopSpeak();
    } else {
      deleteStream(control.stream_id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
