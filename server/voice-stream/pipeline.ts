import {
  voiceStreamEventSchema,
  type AllowedSessionAction,
  type PublicError,
  type SessionPhase,
  type VoicePreflight,
  type VoiceStreamEvent,
  type VoiceStreamFrame,
} from "@contracts/public/index";
import { PublicHttpError, segmentApprovedText, sha256HexOf } from "@/lib/voice";
import {
  publicErrorForWorkerCode,
  VoiceWorkerError,
  type VadResult,
  type VoiceModelClient,
} from "./worker-client";

/**
 * P1-2b：流式语音管线编排器（ADR 0006，Pipecat 式 frame 流的本地映射）。
 *
 * 职责：把浏览器持续推来的 PCM 帧变成「边说边转写（句段级 asr_partial）→
 * turn detection（尾静音端点 + 恢复窗口）→ asr_final」的下行事件流；回合
 * 播报期做 barge-in 打断检测；对已批准消息做流式 TTS（逐段合成逐段下发）。
 *
 * 边界（不变量）：
 * - partial 转写只存在于本流内存；只有 asr_final 文本由客户端经
 *   roleTurns.ask 进入权威数据，本模块不写 Convex。
 * - TTS 只从服务端 Approved Speech Envelope 合成（服务器唯一合法来源），
 *   客户端不得传 text/voice/pace。
 * - 失败隔离（用户决定 2026-09-09：不要一条失败就全失败）：单句段 ASR 失败、
 *   单段 TTS 失败、单次 VAD 失败都以显式 voice_stream_error / tts_segment_failed
 *   上报后继续后续工作，不终止流；键盘路径始终不受影响。
 *
 * 模型调用经可注入 VoiceModelClient（生产 = HttpVoiceModelClient，测试 =
 * Scripted），事件形状以 contracts/public 的 voiceStreamEventSchema 为准。
 */

const TUNING = {
  /** VAD/turn 分析的最小间隔。 */
  ANALYSIS_INTERVAL_MS: 280,
  /** 句段末端离缓冲末尾不足该值时视为仍在说话（未闭合）。 */
  CLOSED_SEGMENT_MARGIN_MS: 220,
  /** 闭合句段的最短语音量，低于此当噪声丢弃。 */
  MIN_SEGMENT_MS: 240,
  /** 有效回合的最少语音量（防误触发）。 */
  MIN_SPEECH_MS: 500,
  /** turn detection：尾静音端点阈值。 */
  END_SILENCE_MS: 1100,
  /** 提交恢复窗口：每次检查间隔与最大检查次数。 */
  COMMIT_CHECK_MS: 260,
  COMMIT_MAX_CHECKS: 3,
  /** 回合上限，与批式 30 秒一致；到达即强制提交。 */
  MAX_TURN_MS: 30_000,
  /** 纯静音缓冲回收阈值。 */
  SILENT_FLUSH_MS: 4_000,
  /** barge-in：播报期间窗口内语音量阈值。 */
  BARGE_IN_SPEECH_MS: 320,
  /** 16k 采样下每毫秒样本数。 */
  SAMPLES_PER_MS: 16,
  /** 单流事件环形缓冲上限。 */
  MAX_BUFFERED_FRAMES: 600,
} as const;

/** 乱序帧暂存上限；超出视为持续丢帧，显式降质并跳到最新帧。 */
const MAX_STASHED_FRAMES = 8;

export type SessionViewLoader = (
  bearer: string,
) => Promise<{ phase: SessionPhase; allowed_actions: AllowedSessionAction[] }>;

export interface ApprovedEnvelope {
  exact_text: string;
  exact_text_sha256: string;
  voice_id: string;
  prosody: { pace: string } | null;
}

export type EnvelopeLoader = (
  sessionId: string,
  messageId: string,
  bearer: string,
) => Promise<ApprovedEnvelope | null>;

type TurnState = "listening" | "committing";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class VoiceStreamPipeline {
  readonly streamId: string;

  private readonly client: VoiceModelClient;
  private readonly loadEnvelope: EnvelopeLoader;
  private readonly loadSessionView: SessionViewLoader;

  // --- 事件总线（JSON lines 下行）
  private seq = 0;
  private frames: VoiceStreamFrame[] = [];
  private subscribers = new Set<(frame: VoiceStreamFrame) => void>();

  // --- 回合音频缓冲
  private chunks: Int16Array[] = [];
  private turnSamples = 0;

  // --- 回合状态
  private state: TurnState = "listening";
  private confirmed: string[] = [];
  private processedSegments = 0;
  private turnDegraded = false;
  private turnGeneration = 0;
  private lastVadSpeechMs = 0;
  private dirty = false;
  private analyzing = false;
  private analysisTimer: ReturnType<typeof setTimeout> | null = null;
  private asrChain: Promise<void> = Promise.resolve();

  // --- TTS
  private ttsGeneration = 0;
  private ttsActive = false;
  private ttsMessageId: string | null = null;

  // --- 预检与会话
  private preflightStarted = false;
  private lastBearer: string | null = null;
  private lastActivityAt = Date.now();
  private disposed = false;

  constructor(input: {
    streamId: string;
    client: VoiceModelClient;
    loadEnvelope: EnvelopeLoader;
    loadSessionView: SessionViewLoader;
  }) {
    this.streamId = input.streamId;
    this.client = input.client;
    this.loadEnvelope = input.loadEnvelope;
    this.loadSessionView = input.loadSessionView;
  }

  // ------------------------------------------------------------------ 上行

  /** 音频帧入口（Route 的 audio POST）。 bearer 用于预检与 TTS envelope 读取。 */
  ingestAudio(chunk: Int16Array, bearer: string, seq: number): void {
    if (this.disposed) return;
    this.lastBearer = bearer;
    this.lastActivityAt = Date.now();
    this.ensureStreamReady(bearer);
    if (seq < this.expectedSeq) return; // 重复帧：忽略
    if (seq !== this.expectedSeq) {
      // 乱序：先暂存，等缺口帧补齐（本机回环下仅罕见并发连接会乱序）。
      this.stash.set(seq, chunk);
      if (this.stash.size > MAX_STASHED_FRAMES) {
        const highest = Math.max(...this.stash.keys());
        this.stash.clear();
        this.expectedSeq = highest + 1;
        this.turnDegraded = true;
        this.emitVoiceError("pipeline", {
          code: "SERVICE_UNAVAILABLE",
          message: "音频帧丢失，本段识别可能不完整",
        });
      }
      return;
    }
    this.appendChunk(chunk);
    this.expectedSeq += 1;
    while (this.stash.has(this.expectedSeq)) {
      const next = this.stash.get(this.expectedSeq)!;
      this.stash.delete(this.expectedSeq);
      this.appendChunk(next);
      this.expectedSeq += 1;
    }
  }

  private expectedSeq = 0;
  private stash = new Map<number, Int16Array>();

  private appendChunk(chunk: Int16Array): void {
    const capSamples = (TUNING.MAX_TURN_MS + 2_000) * TUNING.SAMPLES_PER_MS;
    if (this.turnSamples >= capSamples) {
      // VAD 长期失败时的内存兜底：就地强制收束，不无限堆积。
      if (this.state === "listening") {
        this.emitVoiceError("asr", {
          code: "VOICE_AUDIO_TOO_LONG",
          message: "语音超过 30 秒，本段已就地收束",
        });
        this.turnDegraded = true;
        void this.commitTurn(false);
      }
      return;
    }
    this.chunks.push(chunk);
    this.turnSamples += chunk.length;
    this.dirty = true;
    this.scheduleAnalysis();
  }

  // ------------------------------------------------------------------ 控制

  /** 播报一条已批准消息（control: speak）。逐段合成、逐段下发。 */
  async speak(sessionId: string, messageId: string, bearer: string): Promise<void> {
    if (this.disposed) return;
    this.lastBearer = bearer;
    this.lastActivityAt = Date.now();
    if (this.ttsActive) this.stopSpeak();
    const generation = ++this.ttsGeneration;

    let envelope: ApprovedEnvelope | null;
    try {
      envelope = await this.loadEnvelope(sessionId, messageId, bearer);
    } catch (error) {
      this.emitVoiceError("tts", this.toPublicError(error, "VOICE_TTS_FAILED"));
      return;
    }
    if (this.ttsGeneration !== generation || this.disposed) return;
    if (
      envelope === null ||
      `sha256:${sha256HexOf(envelope.exact_text)}` !== envelope.exact_text_sha256
    ) {
      this.emitVoiceError("tts", {
        code: "VOICE_TTS_FAILED",
        message: "语音合成失败，文字内容不受影响",
      });
      return;
    }
    const segments = segmentApprovedText(envelope.exact_text);
    if (segments.length === 0) {
      this.emitVoiceError("tts", {
        code: "VOICE_TTS_FAILED",
        message: "语音合成失败，文字内容不受影响",
      });
      return;
    }
    const pace = envelope.prosody?.pace ?? "normal";

    // 播报期间麦克风音频不进入回合缓冲（防回声污染），直到被打断。
    this.ttsActive = true;
    this.ttsMessageId = messageId;
    this.resetTurn();
    this.emit({
      type: "tts_started",
      message_id: messageId,
      segment_total: segments.length,
    });

    for (let index = 0; index < segments.length; index += 1) {
      if (this.ttsGeneration !== generation || this.disposed) break;
      try {
        const audio = await this.client.tts(segments[index]!, envelope.voice_id, pace);
        if (this.ttsGeneration !== generation || this.disposed) break;
        this.emit({
          type: "tts_audio",
          message_id: messageId,
          index,
          wav_base64: Buffer.from(audio.wav).toString("base64"),
          sample_rate: audio.sample_rate,
          duration_ms: audio.duration_ms,
        });
      } catch (error) {
        // 单段失败：显式上报后跳过该段继续后续段（ADR 0006 失败隔离）。
        this.emit({
          type: "tts_segment_failed",
          message_id: messageId,
          index,
          error: this.toPublicError(error, "VOICE_TTS_FAILED"),
        });
      }
    }
    // 被 stop_speak / barge-in 接管时由 stopSpeak 发 tts_aborted，这里直接让位。
    if (this.ttsGeneration !== generation || this.disposed) return;
    this.ttsActive = false;
    this.ttsMessageId = null;
    this.emit({ type: "tts_finished", message_id: messageId });
  }

  /** 停止当前播报（control: stop_speak 或打断接管）。 */
  stopSpeak(): void {
    if (!this.ttsActive) return;
    this.ttsGeneration += 1;
    const messageId = this.ttsMessageId;
    this.ttsActive = false;
    this.ttsMessageId = null;
    if (messageId !== null) {
      this.emit({ type: "tts_aborted", message_id: messageId });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ttsGeneration += 1;
    if (this.analysisTimer !== null) {
      clearTimeout(this.analysisTimer);
      this.analysisTimer = null;
    }
    this.subscribers.clear();
    this.frames = [];
    this.chunks = [];
    this.turnSamples = 0;
  }

  get idleAt(): number {
    return this.lastActivityAt;
  }

  // ------------------------------------------------------------------ 事件

  subscribe(afterSeq: number, onFrame: (frame: VoiceStreamFrame) => void): () => void {
    for (const frame of this.frames) {
      if (frame.seq > afterSeq) onFrame(frame);
    }
    const live = onFrame;
    this.subscribers.add(live);
    return () => this.subscribers.delete(live);
  }

  private emit(raw: VoiceStreamEvent): void {
    if (this.disposed) return;
    let event: VoiceStreamEvent;
    try {
      event = voiceStreamEventSchema.parse(raw);
    } catch (error) {
      // 契约 bug 必须暴露，但不允许拖垮整条流。
      console.error("[voice-stream] 事件不符合 voiceStreamEventSchema", raw, error);
      return;
    }
    const frame: VoiceStreamFrame = {
      seq: this.seq,
      at: new Date().toISOString(),
      event,
    };
    this.seq += 1;
    this.frames.push(frame);
    if (this.frames.length > TUNING.MAX_BUFFERED_FRAMES) {
      this.frames.splice(0, this.frames.length - TUNING.MAX_BUFFERED_FRAMES);
    }
    for (const subscriber of this.subscribers) {
      try {
        subscriber(frame);
      } catch {
        // 单个订阅者异常不传染其他订阅者。
      }
    }
  }

  private emitVoiceError(stage: "asr" | "vad" | "tts" | "pipeline", error: PublicError): void {
    this.emit({ type: "voice_stream_error", stage, error });
  }

  private toPublicError(error: unknown, fallbackCode: string): PublicError {
    if (error instanceof PublicHttpError) {
      return error.publicError;
    }
    if (error instanceof VoiceWorkerError) {
      return publicErrorForWorkerCode(error.code);
    }
    return publicErrorForWorkerCode(fallbackCode);
  }

  // ------------------------------------------------------------------ 预检

  private ensureStreamReady(bearer: string): void {
    if (this.preflightStarted) return;
    this.preflightStarted = true;
    void this.refreshPreflight(bearer, true);
  }

  /** 预分析：会话阶段/允许动作 + worker 就绪度（ADR 0006「边说边分析」的服务端部分）。 */
  private async refreshPreflight(bearer: string, isStreamReady: boolean): Promise<void> {
    let phase: SessionPhase;
    let askAllowed: boolean;
    try {
      const view = await this.loadSessionView(bearer);
      phase = view.phase;
      askAllowed = view.allowed_actions.includes("ask");
    } catch {
      this.emitVoiceError("pipeline", {
        code: "SERVICE_UNAVAILABLE",
        message: "服务暂不可用",
      });
      return;
    }
    let workerReady = false;
    try {
      const health = await this.client.health();
      workerReady = health.asr && health.tts && health.vad;
    } catch {
      workerReady = false;
    }
    const preflight: VoicePreflight = {
      phase,
      ask_allowed: askAllowed,
      worker_ready: workerReady,
    };
    this.emit(
      isStreamReady
        ? { type: "stream_ready", stream_id: this.streamId, preflight }
        : { type: "session_preflight", preflight },
    );
  }

  // ------------------------------------------------------------------ 分析循环

  private scheduleAnalysis(): void {
    if (this.analysisTimer !== null || this.disposed) return;
    this.analysisTimer = setTimeout(() => {
      this.analysisTimer = null;
      void this.analyze();
    }, TUNING.ANALYSIS_INTERVAL_MS);
  }

  private async analyze(): Promise<void> {
    if (this.analyzing || this.disposed) return;
    this.analyzing = true;
    try {
      while (!this.disposed && this.dirty) {
        this.dirty = false;
        if (this.turnSamples === 0 || this.state === "committing") continue;
        const generation = this.turnGeneration;
        const pcm = this.turnPcm();
        let vad: VadResult;
        try {
          vad = await this.client.vad(pcm);
        } catch (error) {
          // 单次 VAD 失败不终止流：显式上报后等下一窗口（ADR 0006 失败隔离）。
          this.emitVoiceError("vad", this.toPublicError(error, "VOICE_ASR_FAILED"));
          continue;
        }
        if (this.turnGeneration !== generation || this.disposed) break;

        if (this.ttsActive) {
          this.detectBargeIn(vad);
          continue;
        }
        this.lastVadSpeechMs = vad.speech_ms;
        await this.consumeClosedSegments(pcm, vad);
        if (this.turnGeneration !== generation || this.disposed) break;

        if (
          vad.speech_ms >= TUNING.MIN_SPEECH_MS &&
          vad.trailing_silence_ms >= TUNING.END_SILENCE_MS
        ) {
          void this.commitTurn(true);
        } else if (vad.speech_ms === 0 && vad.duration_ms >= TUNING.SILENT_FLUSH_MS) {
          this.resetTurn();
        } else if (vad.duration_ms >= TUNING.MAX_TURN_MS) {
          this.emitVoiceError("asr", {
            code: "VOICE_AUDIO_TOO_LONG",
            message: "语音超过 30 秒，本段已就地收束",
          });
          this.turnDegraded = true;
          void this.commitTurn(false);
        }
      }
    } finally {
      this.analyzing = false;
    }
    if (this.dirty && !this.disposed) this.scheduleAnalysis();
  }

  /** 闭合句段即时转写：句子级「边说边出字」，partial 前缀单调追加。 */
  private async consumeClosedSegments(pcm: Int16Array, vad: VadResult): Promise<void> {
    const closedBoundaryMs = vad.duration_ms - TUNING.CLOSED_SEGMENT_MARGIN_MS;
    const segments = vad.segments;
    while (this.processedSegments < segments.length) {
      const segment = segments[this.processedSegments]!;
      if (segment.end_ms > closedBoundaryMs) break;
      this.processedSegments += 1;
      const lengthMs = segment.end_ms - segment.start_ms;
      if (lengthMs < TUNING.MIN_SEGMENT_MS) continue;
      const startSample = segment.start_ms * TUNING.SAMPLES_PER_MS;
      const endSample = segment.end_ms * TUNING.SAMPLES_PER_MS;
      const slice = pcm.slice(
        Math.min(startSample, pcm.length),
        Math.min(endSample, pcm.length),
      );
      const generation = this.turnGeneration;
      const speechMs = vad.speech_ms;
      const index = this.confirmed.length;
      // 句段转写串行化：保证 partial 顺序与 confirmed 一致。
      this.asrChain = this.asrChain.then(async () => {
        if (this.disposed || this.turnGeneration !== generation) return;
        try {
          const result = await this.client.asrPcm(slice);
          if (this.turnGeneration !== generation || this.disposed) return;
          this.confirmed.push(result.text);
          this.emit({
            type: "asr_partial",
            text: this.confirmed.filter((part) => part !== "").join(""),
            segment_index: index,
            speech_ms: speechMs,
          });
        } catch (error) {
          if (this.turnGeneration !== generation || this.disposed) return;
          // 单句段失败：显式上报，继续后续句段（该句文本缺失，degraded 由
          // turn 级最终确认时标记）。
          this.turnDegraded = true;
          this.emitVoiceError("asr", this.toPublicError(error, "VOICE_ASR_FAILED"));
        }
      });
      await this.asrChain;
    }
  }

  /** barge-in：播报期间检测到用户重新说话 → 打断并丢弃回声污染的音频。 */
  private detectBargeIn(vad: VadResult): void {
    if (vad.speech_ms < TUNING.BARGE_IN_SPEECH_MS) return;
    this.emit({ type: "interruption" });
    this.stopSpeak();
    this.resetTurn();
  }

  /**
   * turn detection 端点命中：先进入提交态并给恢复窗口（继续说话则回滚），
   * 之后以已闭合句段的缓存文本即时完成最终确认（不重跑整段 ASR）。
   */
  private async commitTurn(allowResume: boolean): Promise<void> {
    this.state = "committing";
    this.emit({ type: "turn_committed" });
    if (this.lastBearer !== null) {
      void this.refreshPreflight(this.lastBearer, false);
    }

    if (allowResume) {
      const baselineSpeechMs = this.lastVadSpeechMs;
      for (let check = 0; check < TUNING.COMMIT_MAX_CHECKS; check += 1) {
        await sleep(TUNING.COMMIT_CHECK_MS);
        if (this.disposed) return;
        if (!this.dirty) continue;
        this.dirty = false;
        const generation = this.turnGeneration;
        let vad: VadResult;
        try {
          vad = await this.client.vad(this.turnPcm());
        } catch {
          continue;
        }
        if (this.turnGeneration !== generation || this.disposed) return;
        if (vad.speech_ms >= baselineSpeechMs + 150) {
          // 用户继续说了：回滚到聆听态，同一回合继续。
          this.emit({ type: "turn_resumed" });
          this.state = "listening";
          this.dirty = true;
          this.scheduleAnalysis();
          return;
        }
      }
    }

    const text = this.confirmed.filter((part) => part !== "").join("").trim();
    const durationMs = Math.round(this.turnSamples / TUNING.SAMPLES_PER_MS);
    const segments = this.confirmed.filter((part) => part !== "");
    const degraded = this.turnDegraded;
    this.resetTurn();
    if (text === "") {
      this.emitVoiceError("asr", {
        code: "VOICE_NO_SPEECH",
        message: "未检测到语音内容",
      });
      return;
    }
    this.emit({
      type: "asr_final",
      text,
      segments,
      duration_ms: durationMs,
      degraded,
    });
  }

  // ------------------------------------------------------------------ 缓冲

  private resetTurn(): void {
    this.chunks = [];
    this.turnSamples = 0;
    this.confirmed = [];
    this.processedSegments = 0;
    this.turnDegraded = false;
    this.state = "listening";
    this.lastVadSpeechMs = 0;
    this.turnGeneration += 1;
  }

  /** 合并缓冲（幂等：合并后缓存为单块）。 */
  private turnPcm(): Int16Array {
    if (this.chunks.length === 1) return this.chunks[0]!;
    const merged = new Int16Array(this.turnSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [merged];
    return merged;
  }
}
