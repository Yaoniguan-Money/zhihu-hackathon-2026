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

export function nextGameMusicIndex(currentIndex: number): number {
  return (currentIndex + 1) % GAME_MUSIC_TRACKS.length;
}
