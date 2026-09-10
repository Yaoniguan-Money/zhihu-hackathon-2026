"use client";

import { motion } from "motion/react";
import type { VoiceStreamState } from "@/lib/voice-stream-client";
import { Icon } from "./Icons";

interface VoiceStreamButtonProps {
  state: VoiceStreamState;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * P1-2b：语音对话模式开关（ADR 0006）。
 * off → starting（申请麦克风）→ listening（持续聆听，partial 实时上屏）；
 * 角色播报期间 speaking；再次点击关闭并释放麦克风。
 */
export default function VoiceStreamButton({ state, disabled, onToggle }: VoiceStreamButtonProps) {
  const active = state !== "off";
  const busy = state === "starting";

  const label =
    state === "off"
      ? "开启语音对话（说完自动提问）"
      : state === "starting"
        ? "正在连接麦克风…"
        : state === "speaking"
          ? "对方正在回答；点击关闭语音对话"
          : "持续聆听中；点击关闭语音对话";

  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.06 }}
        onClick={onToggle}
        disabled={disabled || busy}
        title={label}
        aria-label={label}
        aria-pressed={active}
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink shadow-[var(--shadow-sticker-sm)] transition-colors disabled:opacity-40 ${
          state === "speaking"
            ? "bg-amber text-ink"
            : active
              ? "bg-coral text-paper"
              : "bg-teal text-ink"
        }`}
      >
        {active && state !== "speaking" ? (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-coral"
            animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
            transition={{ repeat: Infinity, duration: 1.1 }}
          />
        ) : null}
        {busy ? (
          <motion.span
            className="block h-4 w-4 rounded-full border-2 border-ink border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
          />
        ) : (
          <Icon name={active ? "stop" : "mic"} size={18} filled={active} />
        )}
      </motion.button>
    </div>
  );
}
