import type { PublicError } from "@contracts/public/index";
import { workerError } from "@/lib/voice";

/**
 * P1-2b：流式管线对本地 Worker 的模型调用客户端（内部 Seam，非公开契约）。
 * 生产实现走 HTTP（127.0.0.1 worker）；测试注入 Scripted 客户端。
 * worker 级错误码沿用 lib/voice.ts 的既有映射，不在管线里改写语义。
 */

export interface VadSegment {
  start_ms: number;
  end_ms: number;
}

export interface VadResult {
  segments: VadSegment[];
  speech_ms: number;
  trailing_silence_ms: number;
  duration_ms: number;
}

export interface AsrResult {
  text: string;
}

export interface TtsResult {
  wav: ArrayBuffer;
  sample_rate: number;
  duration_ms: number;
}

export interface VoiceModelClient {
  vad(pcm: Int16Array): Promise<VadResult>;
  asrPcm(pcm: Int16Array): Promise<AsrResult>;
  tts(text: string, voiceId: string, pace: string): Promise<TtsResult>;
  health(): Promise<{ asr: boolean; tts: boolean; vad: boolean }>;
}

/** worker 返回 ok:false 或网络失败；code 供管线映射 Public Error。 */
export class VoiceWorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function publicErrorForWorkerCode(code: string): PublicError {
  return workerError(code).publicError;
}

const SAMPLE_RATE = 16_000;

async function postPcm(
  baseUrl: string,
  path: "/vad" | "/asr/pcm",
  pcm: Int16Array,
): Promise<Record<string, unknown>> {
  const bytes = new ArrayBuffer(pcm.byteLength);
  new Uint8Array(bytes).set(
    new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  );
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "X-Sample-Rate": String(SAMPLE_RATE) },
      body: bytes,
    });
  } catch {
    throw new VoiceWorkerError("ASR_FAILED");
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.ok !== true) {
    throw new VoiceWorkerError(typeof body.code === "string" ? body.code : "ASR_FAILED");
  }
  return body;
}

/** 生产实现：调用本地 worker 的 /vad、/asr/pcm、/tts、/health。 */
export class HttpVoiceModelClient implements VoiceModelClient {
  constructor(private readonly baseUrl: string) {}

  async vad(pcm: Int16Array): Promise<VadResult> {
    const body = await postPcm(this.baseUrl, "/vad", pcm);
    const raw = Array.isArray(body.segments) ? body.segments : [];
    return {
      segments: raw
        .filter(
          (entry): entry is { start_ms: number; end_ms: number } =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { start_ms?: unknown }).start_ms === "number" &&
            typeof (entry as { end_ms?: unknown }).end_ms === "number",
        )
        .map((entry) => ({ start_ms: entry.start_ms, end_ms: entry.end_ms })),
      speech_ms: typeof body.speech_ms === "number" ? body.speech_ms : 0,
      trailing_silence_ms:
        typeof body.trailing_silence_ms === "number" ? body.trailing_silence_ms : 0,
      duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : 0,
    };
  }

  async asrPcm(pcm: Int16Array): Promise<AsrResult> {
    const body = await postPcm(this.baseUrl, "/asr/pcm", pcm);
    return { text: typeof body.text === "string" ? body.text : "" };
  }

  async tts(text: string, voiceId: string, pace: string): Promise<TtsResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceId, speed: pace }),
      });
    } catch {
      throw new VoiceWorkerError("TTS_FAILED");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      throw new VoiceWorkerError(body.code ?? "TTS_FAILED");
    }
    const wav = await response.arrayBuffer();
    const sampleRate = Number(response.headers.get("X-Sample-Rate") ?? "24000");
    const durationMs = Number(response.headers.get("X-Duration-Ms") ?? "0");
    return { wav, sample_rate: sampleRate, duration_ms: durationMs };
  }

  async health(): Promise<{ asr: boolean; tts: boolean; vad: boolean }> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/health`);
    } catch {
      throw new VoiceWorkerError("ASR_FAILED");
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      asr: body.asr === true,
      tts: body.tts === true,
      vad: body.vad === true,
    };
  }
}
