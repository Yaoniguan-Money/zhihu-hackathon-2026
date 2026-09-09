import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  GAME_MUSIC_TRACKS,
  GAME_MUSIC_VOLUME,
  getGameMusicTrackVolume,
  nextGameMusicIndex,
} from "@/lib/game-music";
import manifest from "@/public/game-music/manifest.json";

describe("游戏音乐轮换", () => {
  test("三首上传音乐均进入公开资源目录", () => {
    expect(GAME_MUSIC_TRACKS).toHaveLength(3);
    expect(new Set(GAME_MUSIC_TRACKS.map((track) => track.src)).size).toBe(3);
    for (const track of GAME_MUSIC_TRACKS) {
      expect(track.src.startsWith("/game-music/")).toBe(true);
      expect(track.src.endsWith(".mp3")).toBe(true);
      const assetPath = path.join(process.cwd(), "public", track.src.slice(1));
      expect(existsSync(assetPath)).toBe(true);
      const recorded = manifest.tracks.find((entry) => track.src.endsWith(entry.file));
      expect(recorded).toBeDefined();
      if (!recorded) throw new Error(`missing manifest entry for ${track.src}`);
      expect(createHash("sha256").update(readFileSync(assetPath)).digest("hex").toUpperCase()).toBe(
        recorded.sha256,
      );
    }
  });

  test("播放完成后依次前进并在第三首后回到第一首", () => {
    expect(nextGameMusicIndex(0)).toBe(1);
    expect(nextGameMusicIndex(1)).toBe(2);
    expect(nextGameMusicIndex(2)).toBe(0);
  });

  test("背景音乐保持在角色语音之下", () => {
    expect(GAME_MUSIC_VOLUME).toBeGreaterThanOrEqual(0.2);
    expect(GAME_MUSIC_VOLUME).toBeLessThanOrEqual(0.35);
    expect(getGameMusicTrackVolume(0)).toBeCloseTo(0.24);
    expect(getGameMusicTrackVolume(1)).toBeCloseTo(0.72);
    expect(getGameMusicTrackVolume(2)).toBeCloseTo(0.4008);
    for (const index of GAME_MUSIC_TRACKS.keys()) {
      expect(getGameMusicTrackVolume(index)).toBeLessThanOrEqual(0.8);
    }
  });
});
