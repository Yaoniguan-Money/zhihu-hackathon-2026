"use client";

import { useEffect, useState } from "react";
import { isSfxMuted, primeSfx, toggleSfxMuted, playSfx } from "@/lib/sfx";
import { Icon } from "@/components/ui/Icons";

/** 全局音效开关：解锁 AudioContext + 持久化静音偏好。 */
export default function SoundToggle({ className }: { className?: string }) {
  const [muted, setMuted] = useState(true); // SSR 初值与首次渲染前读取同步

  useEffect(() => {
    setMuted(isSfxMuted());
    // 浏览器自动播放策略：首次手势解锁 AudioContext
    const prime = () => primeSfx();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  return (
    <button
      onClick={() => {
        const next = toggleSfxMuted();
        setMuted(next);
        if (!next) playSfx("select");
      }}
      title={muted ? "开启音效" : "关闭音效"}
      aria-label={muted ? "开启音效" : "关闭音效"}
      className={
        className ??
        "ml-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-paper/70 transition-colors hover:border-amber hover:text-amber"
      }
    >
      <Icon name={muted ? "sound-off" : "sound-on"} size={14} />
    </button>
  );
}
