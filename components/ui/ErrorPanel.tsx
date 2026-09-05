"use client";

import { motion } from "motion/react";
import type { PublicError } from "@/contracts/public";
import { errorCodeHint } from "@/lib/convex-errors";
import { Icon } from "./Icons";

interface ErrorPanelProps {
  error: PublicError | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

/** 显式失败呈现：错误码 + 玩家可采取动作；绝不伪装成成功。 */
export default function ErrorPanel({ error, onDismiss, onRetry, compact = false, className }: ErrorPanelProps) {
  if (!error) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      className={`flex items-start gap-3 rounded-2xl border-2 border-coral-deep bg-[#3a2430] px-4 py-3 text-paper shadow-[var(--shadow-sticker-sm)] ${className ?? ""}`}
      role="alert"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-coral text-night">
        <Icon name="alert" size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-tight">
          {error.message}
          {!compact && <span className="ml-2 rounded-md bg-ink/40 px-1.5 py-0.5 text-[10px] tracking-wider">{error.code}</span>}
        </p>
        <p className="mt-0.5 text-xs text-paper/70">{errorCodeHint(error.code)}</p>
        {(onRetry || onDismiss) && (
          <div className="mt-2 flex gap-2">
            {onRetry && (
              <button onClick={onRetry} className="chip cursor-pointer hover:bg-paper-dim">
                <Icon name="refresh" size={12} /> 重试
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} className="chip chip-outline cursor-pointer hover:bg-paper/10">
                知道了
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
