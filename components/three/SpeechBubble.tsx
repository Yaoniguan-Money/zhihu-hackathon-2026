"use client";

import { Html } from "@react-three/drei";
import { motion, AnimatePresence } from "motion/react";

interface SpeechBubbleProps {
  position: [number, number, number];
  name: string;
  color: string;
  text: string;
  bubbleKey: string;
  thinking?: boolean;
}

/** 3D 场景内的对话气泡：圆角卡片 + 尾巴 + 弹入动效。文本由页面侧截断。 */
export default function SpeechBubble({
  position,
  name,
  color,
  text,
  bubbleKey,
  thinking = false,
}: SpeechBubbleProps) {
  return (
    <Html position={position} center distanceFactor={6.5} zIndexRange={[20, 0]} className="select-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={bubbleKey}
          initial={{ opacity: 0, y: 14, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          style={{ width: 190, pointerEvents: "none" }}
        >
          <div className="relative rounded-2xl border-2 border-ink/80 bg-paper px-3 py-2 shadow-[4px_4px_0_rgba(26,22,38,0.55)]">
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full border border-ink/70"
                style={{ background: color }}
              />
              <span className="text-[11px] font-black tracking-wide text-ink">{name}</span>
              {thinking && (
                <span className="ml-auto flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="inline-block h-1 w-1 rounded-full bg-ink/60"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.14 }}
                    />
                  ))}
                </span>
              )}
            </div>
            <p className="line-clamp-3 text-[11px] leading-snug text-ink/85">
              {thinking ? "让我想想…" : text}
            </p>
            <div className="absolute -bottom-[7px] left-6 h-3 w-3 rotate-45 border-b-2 border-r-2 border-ink/80 bg-paper" />
          </div>
        </motion.div>
      </AnimatePresence>
    </Html>
  );
}
