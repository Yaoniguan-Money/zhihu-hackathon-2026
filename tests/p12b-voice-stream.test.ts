import { describe, expect, test } from "bun:test";
import { voiceStreamFrameSchema, type VoiceStreamFrame } from "@contracts/public/index";
import { VoiceStreamPipeline } from "../server/voice-stream/pipeline.js";
import type { ApprovedEnvelope } from "../server/voice-stream/pipeline.js";
import {
  VoiceWorkerError,
  type TtsResult,
  type VadResult,
  type VoiceModelClient,
} from "../server/voice-stream/worker-client.js";
import { deleteStream } from "../server/voice-stream/registry.js";
import { sha256HexOf } from "../lib/voice.js";

/**
 * P1-2b 流式语音管线（无本地 Worker）：以 Scripted VoiceModelClient 覆盖
 * 管线核心行为——句段级 partial、端点提交与恢复窗口、失败隔离（单句段 ASR
 * 失败 / 单段 TTS 失败 / 超长）、barge-in 打断——以及同源 Route 的鉴权、
 * 参数校验与流绑定。事件形状以 contracts/public voiceStreamFrameSchema 为准。
 * 需要 Convex 本地后端的 envelope 幂等全链见 p12-voice-worker.test.ts（opt-in）。
 */

const SAMPLES_PER_MS = 16;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pcmOf(ms: number): Int16Array {
  return new Int16Array(ms * SAMPLES_PER_MS);
}

class ScriptedVoiceClient implements VoiceModelClient {
  vadScript: VadResult[] = [];
  asrScript: Array<{ text?: string; fail?: boolean }> = [];
  ttsScript: Array<{
    fail?: boolean;
    deferred?: (resolve: (result: TtsResult) => void) => void;
  }> = [];
  vadCalls = 0;
  asrCalls = 0;
  ttsCalls = 0;

  async vad(pcm: Int16Array): Promise<VadResult> {
    const scripted = this.vadScript[this.vadCalls];
    this.vadCalls += 1;
    if (scripted) return scripted;
    const durationMs = Math.round(pcm.length / SAMPLES_PER_MS);
    return {
      segments: [],
      speech_ms: 0,
      trailing_silence_ms: durationMs,
      duration_ms: durationMs,
    };
  }

  async asrPcm(_pcm: Int16Array): Promise<{ text: string }> {
    const entry = this.asrScript[this.asrCalls] ?? { text: "" };
    this.asrCalls += 1;
    if (entry.fail) throw new VoiceWorkerError("ASR_FAILED");
    return { text: entry.text ?? "" };
  }

  async tts(_text: string, _voiceId: string, _pace: string): Promise<TtsResult> {
    const entry = this.ttsScript[this.ttsCalls] ?? {};
    this.ttsCalls += 1;
    if (entry.deferred) {
      return await new Promise<TtsResult>((resolve) => entry.deferred!(resolve));
    }
    if (entry.fail) throw new VoiceWorkerError("TTS_FAILED");
    return { wav: new ArrayBuffer(8), sample_rate: 24_000, duration_ms: 100 };
  }

  async health(): Promise<{ asr: boolean; tts: boolean; vad: boolean }> {
    return { asr: true, tts: true, vad: true };
  }
}

class Collector {
  frames: VoiceStreamFrame[] = [];
  private readonly unsubscribe: () => void;

  constructor(pipeline: VoiceStreamPipeline) {
    this.unsubscribe = pipeline.subscribe(-1, (frame) => this.frames.push(frame));
  }

  stop(): void {
    this.unsubscribe();
  }

  types(): string[] {
    return this.frames.map((frame) => frame.event.type);
  }

  ofType(type: string): VoiceStreamFrame[] {
    return this.frames.filter((frame) => frame.event.type === type);
  }

  async waitFor(type: string, timeoutMs = 9_000): Promise<VoiceStreamFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.frames.find((frame) => frame.event.type === type);
      if (hit) return hit;
      if (Date.now() > deadline) {
        throw new Error(`等待事件超时: ${type}；已有: ${this.types().join(",")}`);
      }
      await sleep(40);
    }
  }
}

function build() {
  const client = new ScriptedVoiceClient();
  const envelopes = new Map<string, ApprovedEnvelope>();
  const pipeline = new VoiceStreamPipeline({
    streamId: crypto.randomUUID(),
    client,
    loadEnvelope: async (_sessionId, messageId) => envelopes.get(messageId) ?? null,
    loadSessionView: async () => ({
      phase: "investigation",
      allowed_actions: ["ask"],
    }),
  });
  const collector = new Collector(pipeline);
  return { pipeline, client, collector, envelopes };
}

function envelopeOf(exactText: string): ApprovedEnvelope {
  return {
    exact_text: exactText,
    exact_text_sha256: `sha256:${sha256HexOf(exactText)}`,
    voice_id: "zf_xiaoxiao",
    prosody: { pace: "normal" },
  };
}

// ---------------------------------------------------------------------------
// 管线：Streaming ASR + turn detection

describe("P1-2b 管线：Streaming ASR 与 turn detection", () => {
  test(
    "句段闭合即时 partial → 端点静音 → asr_final 拼接（degraded=false）",
    async () => {
      const { pipeline, client, collector } = build();
      client.vadScript = [
        { segments: [{ start_ms: 0, end_ms: 300 }], speech_ms: 300, trailing_silence_ms: 100, duration_ms: 400 },
        { segments: [{ start_ms: 0, end_ms: 300 }, { start_ms: 380, end_ms: 700 }], speech_ms: 620, trailing_silence_ms: 100, duration_ms: 800 },
        { segments: [{ start_ms: 0, end_ms: 300 }, { start_ms: 380, end_ms: 700 }], speech_ms: 620, trailing_silence_ms: 500, duration_ms: 1200 },
        { segments: [{ start_ms: 0, end_ms: 300 }, { start_ms: 380, end_ms: 700 }], speech_ms: 620, trailing_silence_ms: 1700, duration_ms: 2400 },
      ];
      client.asrScript = [{ text: "你好" }, { text: "我在听" }];

      let seq = 0;
      const feed = (ms: number) => pipeline.ingestAudio(pcmOf(ms), "bearer-a", seq++);

      feed(400);
      await sleep(400);
      feed(400);
      await sleep(400);
      const partials = collector.ofType("asr_partial");
      expect(partials.length).toBe(1);
      expect(partials[0]!.event).toMatchObject({ text: "你好", segment_index: 0 });

      feed(400);
      await sleep(400);
      expect(collector.ofType("asr_partial").length).toBe(2);
      expect(collector.ofType("asr_partial")[1]!.event).toMatchObject({
        text: "你好我在听",
        segment_index: 1,
      });

      feed(400);
      feed(400);
      feed(400);
      await collector.waitFor("asr_final");
      expect(collector.types()).toContain("turn_committed");
      expect(collector.ofType("asr_final")[0]!.event).toMatchObject({
        text: "你好我在听",
        segments: ["你好", "我在听"],
        degraded: false,
      });
      for (const frame of collector.frames) {
        expect(voiceStreamFrameSchema.safeParse(frame).success).toBe(true);
      }
      collector.stop();
      pipeline.dispose();
    },
    20_000,
  );

  test(
    "单句段 ASR 失败：显式上报后继续后续句段，asr_final.degraded=true",
    async () => {
      const { pipeline, client, collector } = build();
      client.vadScript = [
        { segments: [{ start_ms: 0, end_ms: 300 }], speech_ms: 300, trailing_silence_ms: 100, duration_ms: 400 },
        { segments: [{ start_ms: 0, end_ms: 300 }, { start_ms: 380, end_ms: 700 }], speech_ms: 620, trailing_silence_ms: 100, duration_ms: 800 },
        { segments: [{ start_ms: 0, end_ms: 300 }, { start_ms: 380, end_ms: 700 }], speech_ms: 620, trailing_silence_ms: 1700, duration_ms: 2400 },
      ];
      client.asrScript = [{ fail: true }, { text: "我在听" }];

      let seq = 0;
      pipeline.ingestAudio(pcmOf(400), "bearer-a", seq++);
      await sleep(400);
      pipeline.ingestAudio(pcmOf(400), "bearer-a", seq++);
      await sleep(400);
      pipeline.ingestAudio(pcmOf(800), "bearer-a", seq++);
      pipeline.ingestAudio(pcmOf(800), "bearer-a", seq++);

      await collector.waitFor("asr_final");
      const error = collector.ofType("voice_stream_error")[0]!;
      expect(error.event).toMatchObject({
        stage: "asr",
        error: { code: "VOICE_ASR_FAILED" },
      });
      const partials = collector.ofType("asr_partial");
      expect(partials.length).toBe(1);
      expect(partials[0]!.event).toMatchObject({ text: "我在听", segment_index: 0 });
      expect(collector.ofType("asr_final")[0]!.event).toMatchObject({
        text: "我在听",
        degraded: true,
      });
      collector.stop();
      pipeline.dispose();
    },
    20_000,
  );

  test(
    "恢复窗口：提交后继续说话 → turn_resumed，同一回合继续并最终提交",
    async () => {
      const { pipeline, client, collector } = build();
      client.vadScript = [
        { segments: [{ start_ms: 0, end_ms: 700 }], speech_ms: 700, trailing_silence_ms: 0, duration_ms: 800 },
        { segments: [{ start_ms: 0, end_ms: 700 }], speech_ms: 700, trailing_silence_ms: 1200, duration_ms: 2000 },
        { segments: [{ start_ms: 0, end_ms: 700 }, { start_ms: 2100, end_ms: 2600 }], speech_ms: 1200, trailing_silence_ms: 0, duration_ms: 2600 },
        { segments: [{ start_ms: 0, end_ms: 700 }, { start_ms: 2100, end_ms: 2600 }], speech_ms: 1200, trailing_silence_ms: 600, duration_ms: 3200 },
        { segments: [{ start_ms: 0, end_ms: 700 }, { start_ms: 2100, end_ms: 2600 }], speech_ms: 1200, trailing_silence_ms: 1800, duration_ms: 4400 },
      ];
      client.asrScript = [{ text: "开始" }, { text: "继续" }];

      let seq = 0;
      const feed = (ms: number) => pipeline.ingestAudio(pcmOf(ms), "bearer-a", seq++);

      feed(800);
      await sleep(400);
      feed(1200);
      await sleep(400);
      await collector.waitFor("turn_committed");

      // 恢复窗口内继续说话。
      feed(400);
      feed(400);
      await collector.waitFor("turn_resumed");

      feed(1200);
      await sleep(400);
      feed(1200);
      const final = await collector.waitFor("asr_final");
      const types = collector.types();
      expect(types.indexOf("turn_resumed")).toBeGreaterThan(
        types.indexOf("turn_committed"),
      );
      expect(final.event).toMatchObject({ text: "开始继续", degraded: false });
      collector.stop();
      pipeline.dispose();
    },
    25_000,
  );

  test(
    "30 秒上限：TOO_LONG 显式上报并就地收束（degraded=true，无恢复窗口）",
    async () => {
      const { pipeline, client, collector } = build();
      client.vadScript = [
        { segments: [{ start_ms: 0, end_ms: 2000 }], speech_ms: 2000, trailing_silence_ms: 0, duration_ms: 30_500 },
      ];
      client.asrScript = [{ text: "长句" }];

      pipeline.ingestAudio(pcmOf(16_000), "bearer-a", 0);
      pipeline.ingestAudio(pcmOf(16_000), "bearer-a", 1);

      await collector.waitFor("voice_stream_error");
      await collector.waitFor("asr_final");
      expect(collector.ofType("voice_stream_error")[0]!.event).toMatchObject({
        stage: "asr",
        error: { code: "VOICE_AUDIO_TOO_LONG" },
      });
      expect(collector.ofType("asr_final")[0]!.event).toMatchObject({
        text: "长句",
        degraded: true,
      });
      expect(collector.types()).not.toContain("turn_resumed");
      collector.stop();
      pipeline.dispose();
    },
    15_000,
  );

  test(
    "纯静音缓冲静默回收：不产生任何回合事件",
    async () => {
      const { pipeline, client, collector } = build();
      // vadScript 空 → 默认返回全静音；3 帧 × 2s = 6s ≥ SILENT_FLUSH_MS。
      pipeline.ingestAudio(pcmOf(2_000), "bearer-a", 0);
      pipeline.ingestAudio(pcmOf(2_000), "bearer-a", 1);
      pipeline.ingestAudio(pcmOf(2_000), "bearer-a", 2);
      await sleep(1_200);
      expect(collector.types()).toEqual(["stream_ready"]);
      collector.stop();
      pipeline.dispose();
    },
    15_000,
  );
});

// ---------------------------------------------------------------------------
// 管线：流式 TTS 与打断

describe("P1-2b 管线：流式 TTS 与 barge-in", () => {
  test(
    "speak：逐段下发 tts_audio；单段失败显式跳过并继续至 tts_finished",
    async () => {
      const { pipeline, client, collector, envelopes } = build();
      envelopes.set("msg-1", envelopeOf("第一句。第二句。"));
      client.ttsScript = [{}, { fail: true }];

      await pipeline.speak("sess-1", "msg-1", "bearer-b");

      expect(collector.types()).toEqual([
        "tts_started",
        "tts_audio",
        "tts_segment_failed",
        "tts_finished",
      ]);
      const started = collector.ofType("tts_started")[0]!;
      expect(started.event).toMatchObject({ message_id: "msg-1", segment_total: 2 });
      const audio = collector.ofType("tts_audio")[0]!;
      expect(audio.event).toMatchObject({ message_id: "msg-1", index: 0 });
      if (audio.event.type !== "tts_audio") throw new Error("unreachable");
      expect(audio.event.wav_base64.length).toBeGreaterThan(0);
      const failed = collector.ofType("tts_segment_failed")[0]!;
      expect(failed.event).toMatchObject({
        message_id: "msg-1",
        index: 1,
        error: { code: "VOICE_TTS_FAILED" },
      });
      collector.stop();
      pipeline.dispose();
    },
  );

  test(
    "barge-in：播报期间检测到用户语音 → interruption + tts_aborted，不再继续合成",
    async () => {
      const { pipeline, client, collector, envelopes } = build();
      envelopes.set("msg-2", envelopeOf("很长的一段话。"));
      let resolveTts: ((result: TtsResult) => void) | null = null;
      client.ttsScript = [
        {
          deferred: (resolve) => {
            resolveTts = resolve;
          },
        },
      ];

      const speaking = pipeline.speak("sess-1", "msg-2", "bearer-c");
      await collector.waitFor("tts_started");

      pipeline.ingestAudio(pcmOf(400), "bearer-c", 0);
      pipeline.ingestAudio(pcmOf(400), "bearer-c", 1);
      // 分析窗口的 VAD 脚本：检测到 600ms 语音 ≥ 320ms 阈值。
      client.vadScript = [
        { segments: [{ start_ms: 0, end_ms: 600 }], speech_ms: 600, trailing_silence_ms: 0, duration_ms: 800 },
      ];
      await collector.waitFor("interruption");
      await collector.waitFor("tts_aborted");

      resolveTts!({ wav: new ArrayBuffer(8), sample_rate: 24_000, duration_ms: 100 });
      await speaking;
      expect(collector.types()).not.toContain("tts_finished");
      collector.stop();
      pipeline.dispose();
    },
    15_000,
  );

  test("speak envelope 缺失：voice_stream_error(tts)，不产生 tts_started", async () => {
    const { pipeline, collector } = build();
    await pipeline.speak("sess-1", "missing", "bearer-b");
    expect(collector.types()).toEqual(["voice_stream_error"]);
    expect(collector.ofType("voice_stream_error")[0]!.event).toMatchObject({
      stage: "tts",
      error: { code: "VOICE_TTS_FAILED" },
    });
    collector.stop();
    pipeline.dispose();
  });
});

// ---------------------------------------------------------------------------
// 同源 Route：鉴权、参数校验与流绑定（无需本地 Worker / Convex）

const DEAD_CONVEX = "http://127.0.0.1:59990";

function uuid(): string {
  return crypto.randomUUID();
}

function audioRequest(
  bearer: string | null,
  streamId: string,
  sessionId: string,
  seq: number,
  body: ArrayBuffer,
): Request {
  const headers = new Headers({
    "X-Stream-Id": streamId,
    "X-Session-Id": sessionId,
    "X-Seq": String(seq),
    "Content-Type": "application/octet-stream",
  });
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  return new Request("http://local/api/voice/stream/audio", {
    method: "POST",
    headers,
    body,
  });
}

describe("P1-2b 同源 Route", () => {
  test("audio：缺 Bearer → 401；非法 stream id / 奇数字节帧 → 400", async () => {
    process.env.VOICE_WORKER_URL = "http://127.0.0.1:59989";
    process.env.NEXT_PUBLIC_CONVEX_URL = DEAD_CONVEX;
    const { POST } = await import("../app/api/voice/stream/audio/route.js");

    const unauthorized = await POST(
      audioRequest(null, uuid(), "sess-x", 0, new ArrayBuffer(64)),
    );
    expect(unauthorized.status).toBe(401);

    const badStream = await POST(
      audioRequest("tok", "not-a-uuid", "sess-x", 0, new ArrayBuffer(64)),
    );
    expect(badStream.status).toBe(400);

    const oddBytes = await POST(
      audioRequest("tok", uuid(), "sess-x", 0, new ArrayBuffer(63)),
    );
    expect(oddBytes.status).toBe(400);
  });

  test("audio：合法帧创建流并返回 ok；重复 seq 被忽略", async () => {
    process.env.VOICE_WORKER_URL = "http://127.0.0.1:59989";
    process.env.NEXT_PUBLIC_CONVEX_URL = DEAD_CONVEX;
    const { POST } = await import("../app/api/voice/stream/audio/route.js");

    const streamId = uuid();
    const first = await POST(
      audioRequest("tok", streamId, "sess-route", 0, new ArrayBuffer(128)),
    );
    expect(first.status).toBe(200);
    expect(((await first.json()) as { ok: boolean }).ok).toBe(true);

    const duplicate = await POST(
      audioRequest("tok", streamId, "sess-route", 0, new ArrayBuffer(128)),
    );
    expect(duplicate.status).toBe(200);

    const mismatch = await POST(
      audioRequest("tok", streamId, "sess-other", 1, new ArrayBuffer(128)),
    );
    expect(mismatch.status).toBe(400);

    deleteStream(streamId);
  });

  test("events：未知流 → 404；control：未知流 → 404、非法 body → 400、会话不匹配 → SESSION_NOT_FOUND", async () => {
    process.env.VOICE_WORKER_URL = "http://127.0.0.1:59989";
    process.env.NEXT_PUBLIC_CONVEX_URL = DEAD_CONVEX;
    const { GET } = await import("../app/api/voice/stream/events/route.js");
    const { POST: controlPost } = await import(
      "../app/api/voice/stream/control/route.js"
    );
    const { POST: audioPost } = await import(
      "../app/api/voice/stream/audio/route.js"
    );

    const missingEvents = await GET(
      new Request(
        `http://local/api/voice/stream/events?stream_id=${uuid()}&after_seq=-1`,
        { headers: { Authorization: "Bearer tok" } },
      ),
    );
    expect(missingEvents.status).toBe(404);

    const badControl = await controlPost(
      new Request("http://local/api/voice/stream/control", {
        method: "POST",
        headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nonsense" }),
      }),
    );
    expect(badControl.status).toBe(400);

    const unknownControl = await controlPost(
      new Request("http://local/api/voice/stream/control", {
        method: "POST",
        headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop_speak", stream_id: uuid() }),
      }),
    );
    expect(unknownControl.status).toBe(404);

    const streamId = uuid();
    await audioPost(audioRequest("tok", streamId, "sess-a", 0, new ArrayBuffer(64)));
    const mismatch = await controlPost(
      new Request("http://local/api/voice/stream/control", {
        method: "POST",
        headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "speak",
          stream_id: streamId,
          session_id: "sess-b",
          message_id: uuid(),
        }),
      }),
    );
    expect(mismatch.status).toBe(404);
    expect(((await mismatch.json()) as { code: string }).code).toBe(
      "SESSION_NOT_FOUND",
    );
    deleteStream(streamId);
  });
});
