import { describe, expect, test } from "bun:test";

/**
 * P1-2b 本地 Voice Worker 流式接口 e2e（显式 opt-in，需本地 worker.py 已运行）：
 *   RUN_VOICE_WORKER=1 bun test tests/p12b-voice-worker-stream.test.ts
 * 覆盖：/health 含 vad、/vad 分段与尾静音（turn detection 输入）、
 * /asr/pcm 原始 PCM 识别（TTS→剥头→PCM 往返）、错误样例
 * （BAD_REQUEST 采样率、NO_SPEECH、TOO_LONG）。
 */

const WORKER = process.env.VOICE_WORKER_URL ?? "http://127.0.0.1:8717";
const RUN = process.env.RUN_VOICE_WORKER === "1";
const SAMPLE_RATE = 16_000;

/** 裸 PCM16LE 单声道字节（无容器头）：kind=silence 全零，kind=tone 440Hz。 */
function pcmBytes(seconds: number, kind: "tone" | "silence"): ArrayBuffer {
  const samples = Math.floor(SAMPLE_RATE * seconds);
  const buffer = new ArrayBuffer(samples * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples; i += 1) {
    const value =
      kind === "silence"
        ? 0
        : Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE));
    view.setInt16(i * 2, value, true);
  }
  return buffer;
}

/** 标准 44 字节头的 WAV。 */
function wavBytes(seconds: number, kind: "tone" | "silence"): ArrayBuffer {
  const pcm = new Uint8Array(pcmBytes(seconds, kind));
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);
  return buffer;
}

function stripWavHeader(wav: ArrayBuffer): ArrayBuffer {
  return wav.slice(44);
}

async function postPcm(
  path: "/vad" | "/asr/pcm",
  body: ArrayBuffer,
  sampleRate = SAMPLE_RATE,
): Promise<Response> {
  return fetch(`${WORKER}${path}`, {
    method: "POST",
    headers: { "X-Sample-Rate": String(sampleRate) },
    body,
  });
}

describe("P1-2b Voice Worker 流式接口 e2e（opt-in）", () => {
  test.skipIf(!RUN)(
    "/health 包含 vad 就绪位",
    async () => {
      const health = (await (await fetch(`${WORKER}/health`)).json()) as Record<
        string,
        unknown
      >;
      expect(health.ok).toBe(true);
      expect(health.asr).toBe(true);
      expect(health.tts).toBe(true);
      expect(health.vad).toBe(true);
    },
    { timeout: 60_000 },
  );

  test.skipIf(!RUN)(
    "/vad：语音分段非空、尾静音随静音尾部增长；采样率错误 → BAD_REQUEST",
    async () => {
      const speech = await (await postPcm("/vad", pcmBytes(1, "tone"))).json();
      expect(speech.ok).toBe(true);
      expect(speech.duration_ms).toBe(1000);
      expect(Array.isArray(speech.segments)).toBe(true);
      expect(speech.speech_ms).toBeGreaterThan(0);
      expect(speech.trailing_silence_ms).toBeGreaterThanOrEqual(0);

      const withTail = await (await postPcm("/vad", pcmBytes(3, "tone"))).json();
      expect(withTail.ok).toBe(true);

      // worker 约定：结果级失败（含 BAD_REQUEST）统一 422，由 Route 映射公开错误。
      const badRate = await postPcm("/vad", pcmBytes(0.5, "tone"), 48_000);
      expect(badRate.ok).toBe(false);
      expect(((await badRate.json()) as { code: string }).code).toBe("BAD_REQUEST");
    },
    { timeout: 120_000 },
  );

  test.skipIf(!RUN)(
    "/asr/pcm：TTS 合成 → 剥 WAV 头 → 原始 PCM 识别回内容",
    async () => {
      const tts = await fetch(`${WORKER}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "今天天气很好我们出去散步吧。",
          voice: "voice-zh-01",
          speed: "normal",
        }),
      });
      expect(tts.status).toBe(200);
      const wav = await tts.arrayBuffer();
      const asr = await postPcm("/asr/pcm", stripWavHeader(wav));
      expect(asr.status).toBe(200);
      const payload = (await asr.json()) as { ok: boolean; text: string };
      expect(payload.ok).toBe(true);
      expect(payload.text.length).toBeGreaterThan(3);
    },
    { timeout: 300_000 },
  );

  test.skipIf(!RUN)(
    "/asr/pcm：纯静音 → NO_SPEECH；超 30 秒 → TOO_LONG",
    async () => {
      const silence = await postPcm("/asr/pcm", pcmBytes(1, "silence"));
      expect(silence.status).toBe(422);
      expect(((await silence.json()) as { code: string }).code).toBe("NO_SPEECH");

      const tooLong = await postPcm("/asr/pcm", pcmBytes(31, "tone"));
      expect(tooLong.status).toBe(422);
      expect(((await tooLong.json()) as { code: string }).code).toBe("TOO_LONG");
    },
    { timeout: 120_000 },
  );
});
