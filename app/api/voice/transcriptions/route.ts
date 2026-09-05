import { z } from "zod";
import {
  PublicHttpError,
  convexCall,
  errorResponse,
  requireBearer,
  sha256HexOf,
  workerCall,
  workerError,
} from "@/lib/voice";
import {
  transcriptResultPublicSchema,
  type TranscriptResultPublic,
} from "@contracts/public/index";

/**
 * P1-2：同源 ASR Route（CONTRACTS 14）。
 * multipart/form-data，字段 audio 与 client_action_id；成功返回
 * TranscriptResultPublic，失败返回 Public Error。只回填输入框：
 * 玩家确认后仍走 roleTurns.ask 并显式 source="asr"。
 * 超过 30 秒直接 VOICE_AUDIO_TOO_LONG，不截断；无语音 VOICE_NO_SPEECH。
 * 原始音频仅在请求内存中存在，响应后即丢弃（不入库、不落盘）。
 */

const SUPPORTED_MIME = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
]);

/** 浏览器/运行时会用历史别名（x-wav 等）；归一化到 CONTRACTS 14 的四个类型。 */
const MIME_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
  "audio/mp3": "audio/mpeg",
  "audio/mp4": "audio/mpeg",
};

function normalizeMime(raw: string): string {
  return MIME_ALIASES[raw.trim().toLowerCase()] ?? raw.trim().toLowerCase();
}

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const bearer = requireBearer(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "请求参数不合法" },
        400,
      );
    }
    const clientActionId = form.get("client_action_id");
    const audio = form.get("audio");
    if (
      typeof clientActionId !== "string" ||
      !z.uuid().safeParse(clientActionId).success
    ) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "client_action_id 必须是 UUID" },
        400,
      );
    }
    if (!(audio instanceof File)) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "缺少音频字段" },
        400,
      );
    }
    const audioBytes = new Uint8Array(await audio.arrayBuffer());
    const normalizedMime = normalizeMime(audio.type);
    if (!SUPPORTED_MIME.has(normalizedMime)) {
      throw new PublicHttpError(
        { code: "INVALID_ARGUMENT", message: "不支持的音频格式" },
        400,
      );
    }
    const audioSha = sha256HexOf(audioBytes.buffer);

    // 幂等命中先于模型调用（CONTRACTS 12）：重放返回首次转写。
    const replay = (await convexCall(
      "query",
      "voice:asrResult",
      { client_action_id: clientActionId, audio_sha256: audioSha },
      bearer,
    )) as TranscriptResultPublic | null;
    if (replay !== null) {
      return Response.json(replay);
    }

    const workerResponse = await workerCall("/asr", {
      method: "POST",
      headers: { "X-Audio-Mime": normalizedMime },
      body: audioBytes.buffer as ArrayBuffer,
    });
    if (!workerResponse.ok) {
      const detail = (await workerResponse.json().catch(() => ({}))) as {
        code?: string;
      };
      throw workerError(detail.code ?? "ASR_FAILED");
    }
    const payload = (await workerResponse.json()) as {
      ok: boolean;
      text: string;
      duration_ms: number;
    };
    if (!payload.ok || payload.text.trim() === "") {
      throw new PublicHttpError(
        { code: "VOICE_NO_SPEECH", message: "未检测到语音内容" },
        422,
      );
    }

    const transcript = transcriptResultPublicSchema.parse({
      text: payload.text,
      is_final: true,
      language: "zh",
      duration_ms: payload.duration_ms,
    });
    await convexCall(
      "mutation",
      "voice:recordAsr",
      {
        client_action_id: clientActionId,
        audio_sha256: audioSha,
        text: transcript.text,
        duration_ms: transcript.duration_ms,
      },
      bearer,
    );
    return Response.json(transcript);
  } catch (error) {
    return errorResponse(error);
  }
}
