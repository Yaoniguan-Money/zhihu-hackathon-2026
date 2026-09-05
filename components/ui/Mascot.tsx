"use client";

/* eslint-disable @next/next/no-img-element */

import { motion as m } from "motion/react";

/**
 * 刘看山官方动图（public/assets/zhihu/liukanshan，manifest 固定哈希）。
 * 只从清单路径引用；用于引导、加载与庆祝时刻，不替代 3D 角色。
 */

export type MascotMotion = "idle" | "wave" | "computer" | "sleep" | "sway" | "dribble";

const PATHS: Record<MascotMotion, string> = {
  idle: "/assets/zhihu/liukanshan/motions/idle.gif",
  wave: "/assets/zhihu/liukanshan/motions/wave.gif",
  computer: "/assets/zhihu/liukanshan/motions/computer.gif",
  sleep: "/assets/zhihu/liukanshan/motions/sleep.gif",
  sway: "/assets/zhihu/liukanshan/motions/sway.gif",
  dribble: "/assets/zhihu/liukanshan/motions/dribble.gif",
};

interface MascotProps {
  motion?: MascotMotion;
  size?: number;
  caption?: string;
  className?: string;
}

export default function Mascot({ motion = "idle", size = 96, caption, className }: MascotProps) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`flex flex-col items-center ${className ?? ""}`}
    >
      <img
        src={PATHS[motion]}
        alt="刘看山"
        width={size}
        height={size}
        className="animate-wiggle"
        draggable={false}
      />
      {caption && (
        <p className="mt-1 max-w-[220px] text-center text-xs font-bold text-paper/70">{caption}</p>
      )}
    </m.div>
  );
}
