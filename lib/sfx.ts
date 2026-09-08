"use client";

/**
 * 程序化音效引擎：纯 WebAudio 合成，无外部资产、无依赖。
 * - AudioContext 惰性创建（首次用户手势后），符合浏览器自动播放策略；
 * - playSfx(name) 即播，全部短合成音（<0.9s）；
 * - 全局静音开关持久化 localStorage；音量总闸 masterGain。
 * 放置位置：lib/sfx.ts（纯客户端，SSR 侧不导入执行）。
 */

type SfxName =
  | "click" // 通用按钮
  | "hover" // 悬停（极轻）
  | "select" // 选中角色/选项
  | "send" // 提问送出
  | "receive" // 回合消息到达
  | "unlock" // 证据解锁
  | "connect" // 证据连线成功
  | "disconnect" // 撤线
  | "reveal" // 揭底
  | "accuse" // 指控
  | "error" // 错误
  | "type"; // 打字机（需节流）

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const MUTE_KEY = "ecw.sfx.muted";

if (typeof window !== "undefined") {
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isSfxMuted(): boolean {
  return muted;
}

export function setSfxMuted(next: boolean): void {
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
}

export function toggleSfxMuted(): boolean {
  setSfxMuted(!muted);
  return muted;
}

/** 首次用户手势时调用一次，解锁 AudioContext。 */
export function primeSfx(): void {
  ensureCtx();
}

interface ToneOpts {
  freq: number;
  endFreq?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

function tone(o: ToneOpts): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), t0 + o.dur);
  }
  const peak = o.gain ?? 0.18;
  const atk = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

function noise(dur: number, gain: number, filterFreq: number, delay = 0): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const RECIPES: Record<SfxName, () => void> = {
  click: () => {
    tone({ freq: 660, endFreq: 520, dur: 0.07, type: "triangle", gain: 0.1 });
  },
  hover: () => {
    tone({ freq: 880, dur: 0.03, type: "sine", gain: 0.03 });
  },
  select: () => {
    tone({ freq: 523, dur: 0.09, type: "triangle", gain: 0.12 });
    tone({ freq: 784, dur: 0.12, type: "triangle", gain: 0.1, delay: 0.06 });
  },
  send: () => {
    tone({ freq: 320, endFreq: 720, dur: 0.18, type: "sine", gain: 0.14 });
    noise(0.1, 0.05, 2400);
  },
  receive: () => {
    tone({ freq: 466, dur: 0.12, type: "sine", gain: 0.1 });
    tone({ freq: 622, dur: 0.16, type: "sine", gain: 0.09, delay: 0.08 });
  },
  unlock: () => {
    [660, 880, 1175].forEach((f, i) => tone({ freq: f, dur: 0.14, type: "triangle", gain: 0.11, delay: i * 0.07 }));
    noise(0.18, 0.04, 5200, 0.14);
  },
  connect: () => {
    tone({ freq: 440, endFreq: 880, dur: 0.12, type: "sine", gain: 0.13 });
  },
  disconnect: () => {
    tone({ freq: 620, endFreq: 300, dur: 0.12, type: "sine", gain: 0.1 });
  },
  reveal: () => {
    [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.5, type: "triangle", gain: 0.12, delay: i * 0.09, attack: 0.02 }));
    noise(0.5, 0.05, 1600, 0.05);
  },
  accuse: () => {
    tone({ freq: 130, endFreq: 65, dur: 0.4, type: "sawtooth", gain: 0.2 });
    noise(0.22, 0.14, 900, 0.02);
    tone({ freq: 98, dur: 0.35, type: "sawtooth", gain: 0.16, delay: 0.18 });
  },
  error: () => {
    tone({ freq: 196, dur: 0.16, type: "square", gain: 0.07 });
    tone({ freq: 185, dur: 0.2, type: "square", gain: 0.07, delay: 0.12 });
  },
  type: () => {
    tone({ freq: 1100 + Math.random() * 500, dur: 0.018, type: "square", gain: 0.016 });
  },
};

const MIN_INTERVAL_MS: Partial<Record<SfxName, number>> = {
  hover: 60,
  type: 34,
  click: 40,
};
const lastPlayed = new Map<SfxName, number>();

/** 播放一枚合成音效；同名音效按最小间隔节流（打字机/悬停防轰炸）。 */
export function playSfx(name: SfxName): void {
  if (muted) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const min = MIN_INTERVAL_MS[name];
  if (min !== undefined) {
    const last = lastPlayed.get(name) ?? 0;
    if (now - last < min) return;
  }
  lastPlayed.set(name, now);
  try {
    RECIPES[name]();
  } catch {
    // 音频失败不阻塞交互（自动播放策略等场景静默跳过）
  }
}
