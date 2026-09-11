"use client";

import { GAME_MUSIC_TRACKS, getGameMusicTrackVolume, nextGameMusicIndex } from "./game-music";
import { isSfxMuted, subscribeSfxMuted } from "./sfx";

let player: HTMLAudioElement | null = null;
let currentTrackIndex = 0;
let running = false;
let consecutiveErrors = 0;

function playCurrentTrack(): void {
  if (!player || !running || typeof window === "undefined") return;
  const track = GAME_MUSIC_TRACKS[currentTrackIndex];
  player.volume = getGameMusicTrackVolume(currentTrackIndex);
  const expectedSrc = new URL(track.src, window.location.href).href;
  if (player.src !== expectedSrc) {
    player.src = track.src;
    player.load();
  }
  player.muted = isSfxMuted();
  void player.play().catch(() => {
    // 若当前手势未获浏览器授权，下一次 pointer/keydown 会再次调用 startBgm。
  });
}

function handleEnded(): void {
  if (!running) return;
  currentTrackIndex = nextGameMusicIndex(currentTrackIndex);
  playCurrentTrack();
}

function handleError(): void {
  if (!running) return;
  consecutiveErrors += 1;
  if (consecutiveErrors >= GAME_MUSIC_TRACKS.length) {
    running = false;
    return;
  }
  currentTrackIndex = nextGameMusicIndex(currentTrackIndex);
  playCurrentTrack();
}

function handlePlaying(): void {
  consecutiveErrors = 0;
}

function handleVisibilityChange(): void {
  if (!player || !running) return;
  if (document.hidden) {
    player.pause();
  } else {
    playCurrentTrack();
  }
}

function ensurePlayer(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (player) return player;

  player = new Audio();
  player.preload = "auto";
  player.addEventListener("ended", handleEnded);
  player.addEventListener("error", handleError);
  player.addEventListener("playing", handlePlaying);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  // BGM 全场常驻（2026-09-11 用户决定），静音订阅无需退订。
  subscribeSfxMuted((muted) => {
    if (player) player.muted = muted;
  });
  return player;
}

/** 首次用户手势后启动全场 BGM（大厅/对局/揭晓全程持续，随机切曲）；重复调用不会叠加播放器。 */
export function startBgm(): void {
  running = true;
  const audio = ensurePlayer();
  if (!audio) return;
  if (audio.paused) playCurrentTrack();
}
