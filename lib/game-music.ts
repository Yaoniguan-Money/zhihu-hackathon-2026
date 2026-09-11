export interface GameMusicTrack {
  id: string;
  title: string;
  src: string;
  /** 相对首曲的响度补偿；最终 HTMLAudio 音量仍限制在 0..1。 */
  gain: number;
}

export const GAME_MUSIC_TRACKS: readonly GameMusicTrack[] = [
  {
    id: "morgan-dreamscape",
    title: "Ambient Calm Dreamscape",
    src: "/game-music/morgan-ambient-calm-ambient-dreamscape-529861.mp3",
    gain: 1,
  },
  {
    id: "leberch-ambient",
    title: "Ambient",
    src: "/game-music/leberch-ambient-595680.mp3",
    gain: 3,
  },
  {
    id: "atlas-ambient",
    title: "Ambient Music",
    src: "/game-music/atlasaudio-ambient-ambient-music-576612.mp3",
    gain: 1.67,
  },
];

/** 背景音乐低于角色语音，UI/游戏 SFX 由独立总线控制。 */
export const GAME_MUSIC_VOLUME = 0.24;

export function getGameMusicTrackVolume(index: number): number {
  return Math.min(1, GAME_MUSIC_VOLUME * GAME_MUSIC_TRACKS[index].gain);
}

/** 随机切曲：不与当前曲目重复（2026-09-11 用户决定全场随机播放）。 */
export function nextGameMusicIndex(currentIndex: number): number {
  if (GAME_MUSIC_TRACKS.length <= 1) return currentIndex;
  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * GAME_MUSIC_TRACKS.length);
  }
  return next;
}
