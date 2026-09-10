import type { ApprovedEnvelope } from "./pipeline";
import { VoiceStreamPipeline } from "./pipeline";
import { HttpVoiceModelClient } from "./worker-client";
import { convexCall, requireWorkerUrl } from "@/lib/voice";
import type { AllowedSessionAction, SessionPhase } from "@contracts/public/index";

/**
 * P1-2b：流式语音管线的进程内注册表（ADR 0006）。
 * 流是本地单用户演示语义：进程内存、创建时绑定 session、空闲 TTL 回收、
 * 并发上限。挂到 globalThis 以免 Next dev HMR 重建模块时丢失活跃流。
 */

const MAX_STREAMS = 4;
const IDLE_TTL_MS = 120_000;
const GC_INTERVAL_MS = 30_000;

interface RegistryEntry {
  pipeline: VoiceStreamPipeline;
  sessionId: string;
  createdAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __voiceStreamRegistry?: {
    streams: Map<string, RegistryEntry>;
    gcTimer: ReturnType<typeof setInterval> | null;
  };
};

function store() {
  if (!globalStore.__voiceStreamRegistry) {
    globalStore.__voiceStreamRegistry = { streams: new Map(), gcTimer: null };
  }
  return globalStore.__voiceStreamRegistry;
}

function sweep() {
  const state = store();
  const now = Date.now();
  for (const [streamId, entry] of state.streams) {
    if (now - entry.pipeline.idleAt > IDLE_TTL_MS) {
      entry.pipeline.dispose();
      state.streams.delete(streamId);
    }
  }
}

export class StreamCapacityError extends Error {
  constructor() {
    super("语音流数量已达上限，请稍后重试");
  }
}

export interface StreamHandle {
  pipeline: VoiceStreamPipeline;
  sessionId: string;
}

/** 取已有流；不存在返回 null（不隐式创建）。 */
export function getStream(streamId: string): StreamHandle | null {
  sweep();
  const entry = store().streams.get(streamId);
  return entry ? { pipeline: entry.pipeline, sessionId: entry.sessionId } : null;
}

/** 显式终止并移除流（control: abort）。 */
export function deleteStream(streamId: string): void {
  const entry = store().streams.get(streamId);
  if (!entry) return;
  entry.pipeline.dispose();
  store().streams.delete(streamId);
}

/** 创建流（创建时绑定 session）；已存在则复用；并发超上限抛 StreamCapacityError。 */
export function createStream(streamId: string, sessionId: string): StreamHandle {
  const state = store();
  sweep();
  const existing = state.streams.get(streamId);
  if (existing) {
    if (existing.sessionId !== sessionId) {
      throw new Error("stream session 绑定冲突");
    }
    return { pipeline: existing.pipeline, sessionId: existing.sessionId };
  }
  if (state.streams.size >= MAX_STREAMS) {
    throw new StreamCapacityError();
  }
  const pipeline = new VoiceStreamPipeline({
    streamId,
    client: new HttpVoiceModelClient(requireWorkerUrl()),
    loadEnvelope: (sid, messageId, bearer) =>
      convexCall(
        "query",
        "voice:approvedEnvelope",
        { session_id: sid, message_id: messageId },
        bearer,
      ) as Promise<ApprovedEnvelope | null>,
    loadSessionView: async (bearer) => {
      const view = (await convexCall(
        "query",
        "sessions:getPublic",
        { session_id: sessionId },
        bearer,
      )) as { phase: SessionPhase; allowed_actions: AllowedSessionAction[] };
      return { phase: view.phase, allowed_actions: view.allowed_actions };
    },
  });
  state.streams.set(streamId, { pipeline, sessionId, createdAt: Date.now() });
  if (state.gcTimer === null) {
    const timer = setInterval(sweep, GC_INTERVAL_MS);
    timer.unref?.();
    state.gcTimer = timer;
  }
  return { pipeline, sessionId };
}
