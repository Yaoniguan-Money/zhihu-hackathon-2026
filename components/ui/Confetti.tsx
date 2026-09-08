"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

const COLORS = ["#f0b429", "#e8563f", "#57b8a0", "#8f9bff", "#f7f1e3", "#d98aa6"];

/**
 * 揭晓时刻纸屑：一次性迸发（仅播放 1.8s），不依赖外部资产。
 * reduced-motion 下不渲染（由调用方判断或 CSS 层降级）。
 */
export default function Confetti({ count = 44 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const rand = (seed: number) => {
          // 轻量可复现随机，避免每次渲染重排
          const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          id: i,
          x: 8 + rand(1) * 84, // 视口横向起点百分比
          drift: (rand(2) - 0.5) * 220,
          delay: rand(3) * 0.35,
          duration: 1.1 + rand(4) * 0.7,
          size: 6 + rand(5) * 7,
          rotate: (rand(6) - 0.5) * 720,
          color: COLORS[Math.floor(rand(7) * COLORS.length)],
          round: rand(8) > 0.7,
        };
      }),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: `${p.x}vw`, y: "-4vh", opacity: 1, rotate: 0 }}
          animate={{ y: "110vh", x: `${p.x}vw`, rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.2, 0.4, 0.6, 1],
            opacity: { times: [0, 0.7, 0.9, 1], duration: p.duration, delay: p.delay },
          }}
          className="absolute top-0 block"
          style={{
            left: 0,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? "50%" : 1,
          }}
        />
      ))}
    </div>
  );
}
