"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  voiceStreamFrameSchema,
  type PublicError,
  type VoicePreflight,
} from "@/contracts/public";
import { attachVoiceElement, resetVoiceAmp } from "@/lib/voice-amp";

/**
 * P1-2b：流式语音管线浏览器客户端（ADR 0006）。
 *
 * 上行：AudioWorklet 持续采集麦克风 → 线性重采样到 16k PCM16 → 聚合为
 * ~375ms 一帧，按 seq POST /api/voice/stream/audio。
 * 下行：fetch + ReadableStream 读 /api/voice/stream/events 的 JSON lines
 * （voiceStreamFrameSchema 校验），驱动 partial 转写展示、自动提交回调、
 * 流式 TTS 播放队列（顺序播放 tts_audio，接振幅探测供口型）与打断。
 *
 * 失败隔离：单段 TTS 失败只跳过该段（tts_segment_failed）；事件流断线按
 * after_seq 重连；上行帧连续失败才显式关闭语音模式并保留键盘路径。
 * 本类不直接写 Convex：回合提交由页面在 onFinal 回调里走既有 roleTurns.ask。
 */

export type VoiceStreamState = "off" | "starting" | "listening" | "speaking";

const WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.step = this.targetRate / sampleRate;
    this.readPos = 0;
    this.buf = [];
    this.out = new Int16Array(512);
    this.outLen = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) this.buf.push(ch[i]);
      while (this.readPos < this.buf.length - 1) {
        const idx = Math.floor(this.readPos);
        const frac = this.readPos - idx;
        const value = this.buf[idx] * (1 - frac) + this.buf[idx + 1] * frac;
        const clamped = Math.max(-1, Math.min(1, value));
        this.out[this.outLen++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        if (this.outLen === this.out.length) {
          const copy = this.out.slice(0);
          this.port.postMessage(copy.buffer, [copy.buffer]);
          this.outLen = 0;
        }
        this.readPos += 1 / this.step;
      }
      const consumed = Math.floor(this.readPos);
      if (consumed > 0) {
        this.buf = this.buf.slice(consumed);
        this.readPos -= consumed;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCaptureProcessor);
`;

/** 聚合帧大小：6000 样本 ≈ 375ms @16k。 */
const FRAME_SAMPLES = 6_000;
const MAX_INFLIGHT_POSTS = 3;
const MAX_SEND_FAILURES = 3;
const MAX_EVENT_RECONNECTS = 5;

export interface VoiceStreamCallbacks {
  onStateChange?: (state: VoiceStreamState) => void;
  onPartial?: (text: string) => void;
  onTurnCommitted?: () => void;
  onTurnResumed?: () => void;
  onFinal?: (text: string, degraded: boolean) => void;
  onInterruption?: () => void;
  onTtsStarted?: (messageId: string, segmentTotal: number) => void;
  onTtsSegmentFailed?: (messageId: string, index: number, error: PublicError) => void;
  onPreflight?: (preflight: VoicePreflight) => void;
  onStreamError?: (stage: "asr" | "vad" | "tts" | "pipeline", error: PublicError) => void;
}

interface SpeakWaiter {
  resolve: () => void;
  messageId: string;
}

export class VoiceStreamClient {
  readonly streamId: string;

  private readonly sessionId: string;
  private readonly tokenProvider: () => Promise<string | null>;
  private readonly callbacks: VoiceStreamCallbacks;

  private state: VoiceStreamState = "off";
  private stopping = false;

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sendQueue: Array<{ seq: number; bytes: Uint8Array }> = [];
  private inflightPosts = 0;
  private sendFailures = 0;
  private seqCounter = 0;
  private pendingSamples: Int16Array[] = [];
  private pendingCount = 0;

  private eventController: AbortController | null = null;
  private lastEventSeq = -1;
  private eventReconnects = 0;
  private token: string | null = null;

  private playbackQueue: string[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private playingMessageId: string | null = null;
  private waiters: SpeakWaiter[] = [];

  constructor(input: {
    sessionId: string;
    tokenProvider: () => Promise<string | null>;
    callbacks: VoiceStreamCallbacks;
  }) {
    this.sessionId = input.sessionId;
    this.tokenProvider = input.tokenProvider;
    this.callbacks = input.callbacks;
    this.streamId = crypto.randomUUID();
  }

  getState(): VoiceStreamState {
    return this.state;
  }

  get active(): boolean {
    return this.state !== "off" && this.state !== "starting";
  }

  private setState(state: VoiceStreamState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  // ------------------------------------------------------------------ 生命周期

  async start(): Promise<void> {
    if (this.state !== "off") return;
    this.stopping = false;
    this.setState("starting");
    try {
      this.token = await this.tokenProvider();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;
      const context = new AudioContext();
      this.audioContext = context;
      const workletUrl = URL.createObjectURL(
        new Blob([WORKLET_CODE], { type: "application/javascript" }),
      );
      try {
        await context.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "pcm-capture");
      worklet.port.onmessage = (event) => this.onWorkletChunk(event.data as ArrayBuffer);
      source.connect(worklet);
      this.sourceNode = source;
      this.workletNode = worklet;
      // 不连 destination：只采集不回放（避免啸叫）。
      this.setState("listening");
      void this.connectEvents();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopping && this.state === "off") return;
    this.stopping = true;
    this.eventController?.abort();
    this.eventController = null;
    this.clearPlayback();
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
    this.sendQueue = [];
    this.pendingSamples = [];
    this.pendingCount = 0;
    resetVoiceAmp();
    if (this.active) {
      void this.postControl({ action: "abort", stream_id: this.streamId }).catch(
        () => undefined,
      );
    }
    this.setState("off");
  }

  // ------------------------------------------------------------------ 上行

  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private onWorkletChunk(buffer: ArrayBuffer): void {
    if (this.stopping || this.state === "off") return;
    const chunk = new Int16Array(buffer);
    this.pendingSamples.push(chunk);
    this.pendingCount += chunk.length;
    if (this.pendingCount < FRAME_SAMPLES) return;
    const frame = new Int16Array(this.pendingCount);
    let offset = 0;
    for (const part of this.pendingSamples) {
      frame.set(part, offset);
      offset += part.length;
    }
    this.pendingSamples = [];
    this.pendingCount = 0;
    this.sendQueue.push({ seq: this.seqCounter, bytes: new Uint8Array(frame.buffer) });
    this.seqCounter += 1;
    this.pumpSends();
  }

  private async pumpSends(): Promise<void> {
    while (
      !this.stopping &&
      this.inflightPosts < MAX_INFLIGHT_POSTS &&
      this.sendQueue.length > 0
    ) {
      const frame = this.sendQueue.shift()!;
      this.inflightPosts += 1;
      // 串行化窗口内的发送以保持 seq 语义；失败按显式上限处理。
      void this.postFrame(frame).finally(() => {
        this.inflightPosts -= 1;
        if (this.sendQueue.length > 0) void this.pumpSends();
      });
      await Promise.resolve();
    }
  }

  private async postFrame(frame: { seq: number; bytes: Uint8Array }): Promise<void> {
    for (let attempt = 0; attempt < MAX_SEND_FAILURES; attempt += 1) {
      if (this.stopping || this.state === "off") return;
      try {
        const response = await fetch("/api/voice/stream/audio", {
          method: "POST",
          headers: this.headers({
            "X-Stream-Id": this.streamId,
            "X-Session-Id": this.sessionId,
            "X-Seq": String(frame.seq),
            "Content-Type": "application/octet-stream",
          }),
          body: frame.bytes.slice().buffer as ArrayBuffer,
        });
        if (response.status === 401) {
          this.token = await this.tokenProvider();
          continue;
        }
        if (response.ok) {
          this.sendFailures = 0;
          return;
        }
      } catch {
        // 本机回环网络抖动：计入连续失败。
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    this.sendFailures += 1;
    if (this.sendFailures >= 2) {
      this.callbacks.onStreamError?.("pipeline", {
        code: "SERVICE_UNAVAILABLE",
        message: "语音上行中断，已切换回键盘输入",
      });
      await this.stop();
    }
  }

  private async postControl(body: Record<string, unknown>): Promise<void> {
    const response = await fetch("/api/voice/stream/control", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    // 404 = 流已被服务端回收/不存在：对 abort / stop_speak 属预期，不作为错误呈现。
    if (!response.ok && response.status !== 404) {
      const data = (await response.json().catch(() => null)) as PublicError | null;
      if (data && typeof data.code === "string") {
        this.callbacks.onStreamError?.("pipeline", data);
      }
    }
  }

  private headers(base: Record<string, string>): Record<string, string> {
    return this.token ? { ...base, Authorization: `Bearer ${this.token}` } : base;
  }

  // ------------------------------------------------------------------ 下行

  private async connectEvents(): Promise<void> {
    while (!this.stopping && this.eventReconnects < MAX_EVENT_RECONNECTS) {
      this.eventController = new AbortController();
      const controller = this.eventController;
      try {
        const response = await fetch(
          `/api/voice/stream/events?stream_id=${encodeURIComponent(this.streamId)}&after_seq=${this.lastEventSeq}`,
          { headers: this.headers({}), signal: controller.signal },
        );
        if (response.status === 401) {
          this.token = await this.tokenProvider();
          this.eventReconnects += 1;
          continue;
        }
        if (!response.ok || response.body === null) {
          this.eventReconnects += 1;
          await new Promise((resolve) => setTimeout(resolve, 900));
          continue;
        }
        this.eventReconnects = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let carry = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done || this.stopping) break;
          carry += decoder.decode(value, { stream: true });
          let newline = carry.indexOf("\n");
          while (newline >= 0) {
            const line = carry.slice(0, newline).trim();
            carry = carry.slice(newline + 1);
            if (line !== "") this.dispatchLine(line);
            newline = carry.indexOf("\n");
          }
        }
      } catch {
        // abort 或网络错误：走下面的重连计数。
      }
      if (this.stopping) return;
      this.eventReconnects += 1;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    if (!this.stopping) {
      this.callbacks.onStreamError?.("pipeline", {
        code: "SERVICE_UNAVAILABLE",
        message: "语音事件流连接失败，已切换回键盘输入",
      });
      await this.stop();
    }
  }

  private dispatchLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const frame = voiceStreamFrameSchema.safeParse(parsed);
    if (!frame.success) return;
    this.lastEventSeq = Math.max(this.lastEventSeq, frame.data.seq);
    const event = frame.data.event;
    switch (event.type) {
      case "stream_ready":
      case "session_preflight":
        this.callbacks.onPreflight?.(event.preflight);
        break;
      case "asr_partial":
        this.callbacks.onPartial?.(event.text);
        break;
      case "turn_committed":
        this.callbacks.onTurnCommitted?.();
        break;
      case "turn_resumed":
        this.callbacks.onTurnResumed?.();
        break;
      case "asr_final":
        this.callbacks.onPartial?.("");
        this.callbacks.onFinal?.(event.text, event.degraded);
        break;
      case "interruption":
        this.clearPlayback();
        this.callbacks.onInterruption?.();
        this.resolveWaiters();
        this.setState("listening");
        break;
      case "tts_started":
        this.playingMessageId = event.message_id;
        this.clearPlayback();
        this.callbacks.onTtsStarted?.(event.message_id, event.segment_total);
        this.setState("speaking");
        break;
      case "tts_audio":
        if (event.message_id === this.playingMessageId) {
          this.enqueueChunk(event.wav_base64);
        }
        break;
      case "tts_segment_failed":
        this.callbacks.onTtsSegmentFailed?.(event.message_id, event.index, event.error);
        break;
      case "tts_finished":
        this.playingMessageId = null;
        this.setState("listening");
        this.resolveWaitersFor(event.message_id);
        break;
      case "tts_aborted":
        this.clearPlayback();
        this.playingMessageId = null;
        this.resolveWaitersFor(event.message_id);
        this.setState("listening");
        break;
      case "voice_stream_error":
        this.callbacks.onStreamError?.(event.stage, event.error);
        break;
    }
  }

  // ------------------------------------------------------------------ TTS 播放

  /** 请求服务端流式播报一条已批准消息；完成/中止时 resolve。 */
  async speakMessage(messageId: string): Promise<void> {
    if (!this.active) {
      throw new Error("voice stream 未连接");
    }
    const waiter = new Promise<void>((resolve) => {
      this.waiters.push({ resolve, messageId });
    });
    await this.postControl({
      action: "speak",
      stream_id: this.streamId,
      session_id: this.sessionId,
      message_id: messageId,
    });
    return waiter;
  }

  stopSpeaking(): void {
    if (!this.active) return;
    this.clearPlayback();
    this.playingMessageId = null;
    this.resolveWaiters();
    void this.postControl({ action: "stop_speak", stream_id: this.streamId }).catch(
      () => undefined,
    );
    this.setState("listening");
  }

  private enqueueChunk(wavBase64: string): void {
    const binary = atob(wavBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "audio/wav" }));
    this.playbackQueue.push(url);
    this.pumpPlayback();
  }

  private pumpPlayback(): void {
    if (this.currentAudio !== null || this.playbackQueue.length === 0) return;
    const url = this.playbackQueue.shift()!;
    const audio = new Audio(url);
    this.currentAudio = audio;
    attachVoiceElement(audio);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (this.currentAudio === audio) this.currentAudio = null;
      if (this.playbackQueue.length > 0 && !this.stopping) {
        this.pumpPlayback();
      }
    };
    audio.onerror = () => {
      if (this.currentAudio === audio) this.currentAudio = null;
      this.callbacks.onStreamError?.("tts", {
        code: "VOICE_TTS_FAILED",
        message: "语音播放失败，文字内容不受影响",
      });
    };
    void audio.play().catch(() => {
      this.callbacks.onStreamError?.("tts", {
        code: "VOICE_TTS_FAILED",
        message: "浏览器暂不允许自动播放语音，可点消息旁的播放按钮手动收听",
      });
    });
  }

  private clearPlayback(): void {
    this.playbackQueue.forEach((url) => URL.revokeObjectURL(url));
    this.playbackQueue = [];
    if (this.currentAudio !== null) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    resetVoiceAmp();
  }

  private resolveWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter.resolve();
  }

  /** 只解决某条消息的等待者（连续播报切换时互不误伤）。 */
  private resolveWaitersFor(messageId: string): void {
    const matched = this.waiters.filter((waiter) => waiter.messageId === messageId);
    this.waiters = this.waiters.filter((waiter) => waiter.messageId !== messageId);
    for (const waiter of matched) waiter.resolve();
  }
}

// ---------------------------------------------------------------------------
// React hook：审讯页语音对话模式

export interface UseVoiceStreamOptions {
  sessionId: string;
  /** true = 语音模式开启（麦克风持续采集 + 事件流）。 */
  enabled: boolean;
  fetchAccessToken: (input: { forceRefreshToken: boolean }) => Promise<string | null>;
  onFinal: (text: string, degraded: boolean) => void;
  onVoiceError: (error: { code: string; message: string }) => void;
}

export function useVoiceStream(options: UseVoiceStreamOptions): {
  state: VoiceStreamState;
  partial: string;
  speakingMessageId: string | null;
  /** 同步读取底层客户端连接状态（不经过 React 渲染周期，供回调内判断）。 */
  isActive: () => boolean;
  speakMessage: (messageId: string) => Promise<void>;
  stopSpeaking: () => void;
} {
  const { sessionId, enabled, fetchAccessToken } = options;
  const clientRef = useRef<VoiceStreamClient | null>(null);
  const [state, setState] = useState<VoiceStreamState>("off");
  const [partial, setPartial] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const finalRef = useRef(options.onFinal);
  const errorRef = useRef(options.onVoiceError);
  useEffect(() => {
    finalRef.current = options.onFinal;
    errorRef.current = options.onVoiceError;
  });

  useEffect(() => {
    if (!enabled) {
      void clientRef.current?.stop();
      clientRef.current = null;
      setState("off");
      setPartial("");
      setSpeakingMessageId(null);
      return;
    }
    const client = new VoiceStreamClient({
      sessionId,
      tokenProvider: () => fetchAccessToken({ forceRefreshToken: false }),
      callbacks: {
        onStateChange: setState,
        onPartial: setPartial,
        onFinal: (text, degraded) => finalRef.current(text, degraded),
        onStreamError: (stage, error) => errorRef.current(error),
        onTtsSegmentFailed: (_messageId, _index, error) => errorRef.current(error),
        onInterruption: () => setSpeakingMessageId(null),
        onTtsStarted: (messageId) => setSpeakingMessageId(messageId),
      },
    });
    clientRef.current = client;
    void client.start().catch(() => {
      errorRef.current({
        code: "VOICE_ASR_FAILED",
        message: "无法访问麦克风",
      });
    });
    return () => {
      void client.stop();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  const speakMessage = useCallback(async (messageId: string): Promise<void> => {
    const client = clientRef.current;
    if (!client || !client.active) {
      throw new Error("voice stream 未连接");
    }
    await client.speakMessage(messageId);
  }, []);

  const stopSpeaking = useCallback(() => {
    clientRef.current?.stopSpeaking();
  }, []);

  const isActive = useCallback(() => {
    const client = clientRef.current;
    return client !== null && client.active;
  }, []);

  return { state, partial, speakingMessageId, isActive, speakMessage, stopSpeaking };
}
