"use client";

import { useEffect } from "react";
import { primeSfx } from "@/lib/sfx";
import { startBgm } from "@/lib/bgm";

/**
 * 全场 BGM 自启（2026-09-11 用户决定）：挂载在根布局，任意页面首次
 * pointerdown/keydown 后解锁并持续播放（大厅/对局/揭晓全程，随机切曲）；
 * 右上角声音开关仍是全局总闸（同时控制 BGM 与 SFX）。
 */
export default function BgmStarter() {
  useEffect(() => {
    const kick = () => {
      primeSfx();
      startBgm();
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, []);
  return null;
}
