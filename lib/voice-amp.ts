"use client";

/**
 * 语音振幅探测：把当前播放的 TTS 音频接到 AnalyserNode 上，输出实时 RMS。
 * - 失败任何一步都静默降级（调用方回退到程序化口型）；
 * - 同一时间只有一条语音在播（由调用方队列保证）。
 */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let amp = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const buf = new Uint8Array(256);

function ensureGraph(): boolean {
  if (typeof window === "undefined") return false;
  if (analyser) return true;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    return true;
  } catch {
    return false;
  }
}

function poll(): void {
  if (!analyser) return;
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  amp = Math.sqrt(sum / buf.length);
}

/** 把正在播放的 audio 元素接入振幅探测（每个元素只能接一次源）。 */
export function attachVoiceElement(el: HTMLAudioElement): void {
  try {
    if (!ensureGraph() || !ctx || !analyser) return;
    if (ctx.state === "suspended") void ctx.resume();
    source?.disconnect();
    source = ctx.createMediaElementSource(el);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    if (pollTimer === null) pollTimer = setInterval(poll, 50);
  } catch {
    // 探测失败不影响播放；口型走程序化回退
  }
}

export function currentVoiceAmp(): number {
  return amp;
}

/** 语音队列清空时调用：归零振幅并停止轮询。 */
export function resetVoiceAmp(): void {
  amp = 0;
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
