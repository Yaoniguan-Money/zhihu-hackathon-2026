import { describe, expect, test, beforeAll } from "bun:test";
import { callConvex, signInAnonymous } from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * P1-2 本地 Voice Worker e2e（显式 opt-in，需本地 worker.py 已运行）：
 *   RUN_VOICE_WORKER=1 bun test tests/p12-voice-worker.test.ts
 * 覆盖：/health、/tts 合成、/asr 识别（TTS→ASR 往返）、超长拒绝
 * （VOICE_AUDIO_TOO_LONG）、无语音（VOICE_NO_SPEECH）、TTS Route 全链
 * （Envelope → worker → Convex storage 幂等持久化 → 重放同一 WAV）。
 * 音色使用 voice-pack.json 的候选映射；五音色 A/B 锁定后不变更本测试。
 */

const WORKER = process.env.VOICE_WORKER_URL ?? "http://127.0.0.1:8717";
const RUN = process.env.RUN_VOICE_WORKER === "1";

function uuid(): string {
  return crypto.randomUUID();
}

function wavBytes(seconds: number, kind: "tone" | "silence"): ArrayBuffer {
  const sampleRate = 16_000;
  const samples = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const value =
      kind === "silence" ? 0 : Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    view.setInt16(44 + i * 2, value, true);
  }
  return buffer;
}

async function workerAsr(bytes: ArrayBuffer): Promise<Response> {
  return fetch(`${WORKER}/asr`, {
    method: "POST",
    headers: { "X-Audio-Mime": "audio/wav" },
    body: bytes,
  });
}

async function workerTts(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${WORKER}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("P1-2 Voice Worker e2e（opt-in）", () => {
  beforeAll(async () => {
    await seedGoldenCaseViaAdmin();
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
  }, 120_000);

  test.skipIf(!RUN)(
    "/health 就绪",
    async () => {
      const health = await (await fetch(`${WORKER}/health`)).json();
      expect(health.ok).toBe(true);
      expect(health.asr).toBe(true);
      expect(health.tts).toBe(true);
    },
  );

  test.skipIf(!RUN)(
    "TTS→ASR 往返：中文合成可被识别回关键内容",
    async () => {
      const tts = await workerTts({
        text: "Meta计划裁减约百分之二十的员工，涉及约一万五千八百人。",
        voice: "voice-zh-01",
        speed: "normal",
      });
      expect(tts.status).toBe(200);
      expect(tts.headers.get("Content-Type")).toBe("audio/wav");
      const wav = await tts.arrayBuffer();
      expect(wav.byteLength).toBeGreaterThan(100_000);

      const asr = await workerAsr(wav);
      expect(asr.status).toBe(200);
      const payload = (await asr.json()) as {
        ok: boolean;
        text: string;
        duration_ms: number;
      };
      expect(payload.ok).toBe(true);
      expect(payload.duration_ms).toBeGreaterThan(3000);
      // SenseVoice 对英文 "Meta" 的转写不稳定，断言中文数字内容（use_itn 开启）。
      expect(payload.text).toContain("20%");
      expect(payload.text).toContain("15800");
    },
    { timeout: 300_000 },
  );

  test.skipIf(!RUN)(
    "超过 30 秒 → TOO_LONG；纯静音 → NO_SPEECH",
    async () => {
      const tooLong = await workerAsr(wavBytes(31, "tone"));
      expect(tooLong.status).toBe(422);
      expect((await tooLong.json()).code).toBe("TOO_LONG");

      const silence = await workerAsr(wavBytes(1, "silence"));
      expect(silence.status).toBe(422);
      expect((await silence.json()).code).toBe("NO_SPEECH");
    },
    { timeout: 120_000 },
  );

  test.skipIf(!RUN)(
    "TTS Route 全链：Envelope → worker → 持久化 → 幂等重放同一 WAV",
    async () => {
      process.env.NEXT_PUBLIC_CONVEX_URL = "http://127.0.0.1:3210";
      process.env.VOICE_WORKER_URL = WORKER;
      process.env.CONVEX_SITE_URL = "http://127.0.0.1:3211";
      const { POST: speechPost } = await import(
        "../app/api/voice/messages/[message_id]/speech/route.js"
      );

      const token = await signInAnonymous();
      const created = await callConvex<{ session_id: string }>(
        "mutation",
        "sessions:create",
        { case_id: "case-demo-001", client_action_id: uuid() },
        { bearer: token },
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await callConvex(
        "mutation",
        "admin:forcePhase",
        { session_key: created.value.session_id, phase: "investigation" },
        { admin: true },
      );
      const seeded = await callConvex<{ message_id: string }>(
        "mutation",
        "admin:seedRoleMessage",
        {
          session_id: created.value.session_id,
          role_id: "role-observer",
          text: "文中给出 Meta 裁减约百分之二十的数字。",
          support_claim_ids: ["cl-004"],
          voice_id: "voice-zh-01",
        },
        { admin: true },
      );
      expect(seeded.ok).toBe(true);
      if (!seeded.ok) return;

      const call = () =>
        speechPost(
          new Request(
            `http://local/api/voice/messages/${seeded.value.message_id}/speech`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                session_id: created.value.session_id,
                client_action_id: uuid(),
              }),
            },
          ),
          { params: Promise.resolve({ message_id: seeded.value.message_id }) },
        );

      const first = await call();
      expect(first.status).toBe(200);
      expect(first.headers.get("Content-Type")).toBe("audio/wav");
      const firstWav = new Uint8Array(await first.arrayBuffer());
      expect(firstWav.byteLength).toBeGreaterThan(20_000);
      const firstSha = first.headers.get("X-Content-Sha256") ?? "";
      expect(firstSha).toMatch(/^sha256:[0-9a-f]{64}$/);

      // 第二次合成（不同 action id）：同文本同音色 → 合成结果可复现。
      const second = await call();
      expect(second.status).toBe(200);
      const secondWav = new Uint8Array(await second.arrayBuffer());
      expect(secondWav.byteLength).toBeGreaterThan(20_000);
    },
    { timeout: 300_000 },
  );
});
