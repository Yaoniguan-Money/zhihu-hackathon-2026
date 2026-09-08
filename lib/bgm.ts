"use client";

import { isSfxMuted } from "./sfx";

/**
 * 程序化 BGM：WebAudio 合成的氛围垫乐，无外部资产。
 * - 两档情绪：calm（庭审/证据板，大调化慢和弦）与 tension（指控阶段，低音小调+更密换和弦）；
 * - 每小节调度（bar 级 look-ahead），和弦间无缝衔接；音量极低（垫乐定位）；
 * - 复用 lib/sfx 的 AudioContext 与静音开关（isSfxMuted），每小节检查静音。
 */

type Mood = "calm" | "tension";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let mood: Mood = "calm";
let barIndex = 0;
let running = false;

// 和弦频率组（A 小调体系；tension 用更低的持续音）
const CHORDS: Record<Mood, number[][]> = {
  // Am7 - Fmaj7 - Cmaj - G：温和的“调查”行进
  calm: [
    [220.0, 261.6, 329.6, 392.0],
    [174.6, 220.0, 261.6, 329.6],
    [196.0, 261.6, 329.6, 392.0],
    [164.8, 196.0, 246.9, 329.6],
  ],
  // 低音小二度摩擦：怀疑升温
  tension: [
    [110.0, 130.8, 155.6, 196.0],
    [103.8, 130.8, 146.8, 185.0],
  ],
};

const BAR_SEC: Record<Mood, number> = { calm: 3.6, tension: 2.6 };

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.05;
    // 低通让垫乐退到背景
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    master.connect(filter).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function scheduleBar(c: AudioContext, startAt: number): void {
  if (!master) return;
  const chord = CHORDS[mood][barIndex % CHORDS[mood].length];
  const dur = BAR_SEC[mood];
  const muted = isSfxMuted();
  for (const freq of chord) {
    if (muted) continue;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 6;
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.linearRampToValueAtTime(0.05, startAt + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, startAt + dur * 1.05);
    osc.connect(g).connect(master);
    osc.start(startAt);
    osc.stop(startAt + dur * 1.1);
  }
  barIndex += 1;
}

function loop(): void {
  const c = ensureContext();
  if (!c || !running) return;
  // look-ahead：提前 0.12s 调度下一小节，保证衔接
  scheduleBar(c, c.currentTime + 0.12);
}

/** 在用户手势解锁 AudioContext 后调用；幂等。 */
export function startBgm(initial: Mood = "calm"): void {
  mood = initial;
  if (running) return;
  const c = ensureContext();
  if (!c) return;
  running = true;
  loop();
  timer = setInterval(loop, 1000);
}

export function setBgmMood(next: Mood): void {
  mood = next;
}

export function stopBgm(): void {
  running = false;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
