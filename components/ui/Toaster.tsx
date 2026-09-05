"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/context/GameContext";
import { errorCodeHint } from "@/lib/convex-errors";
import { Icon } from "./Icons";

const KIND_STYLE: Record<string, { bg: string; icon: string }> = {
  evidence: { bg: "#2ea79b", icon: "sparkle" },
  success: { bg: "#f2b04c", icon: "check" },
  info: { bg: "#8f9bff", icon: "eye" },
  error: { bg: "#e4685d", icon: "alert" },
};

function ToastCard({ id, kind, title, body, errorCode }: { id: string; kind: string; title: string; body?: string; errorCode?: string }) {
  const { dismissNotif } = useGame();
  const style = KIND_STYLE[kind] ?? KIND_STYLE.info;

  useEffect(() => {
    const timer = setTimeout(() => dismissNotif(id), kind === "error" ? 7000 : 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -18, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, y: -8 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className="pointer-events-auto flex w-[320px] gap-3 rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-ink shadow-[var(--shadow-sticker)]"
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink"
        style={{ background: style.bg, color: "#191631" }}
      >
        <Icon name={style.icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-tight">{title}</p>
        {body && <p className="mt-0.5 text-xs leading-snug text-ink/75">{body}</p>}
        {errorCode && (
          <p className="mt-1 text-[11px] font-bold text-coral-deep">
            {errorCode} · {errorCodeHint(errorCode as never)}
          </p>
        )}
      </div>
      <button
        onClick={() => dismissNotif(id)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded-full text-ink/40 transition-colors hover:bg-ink/10 hover:text-ink"
        aria-label="关闭提醒"
      >
        ✕
      </button>
    </motion.div>
  );
}

export default function Toaster() {
  const { notifList } = useGame();
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {notifList.map((n) => (
          <ToastCard key={n.id} {...n} />
        ))}
      </AnimatePresence>
    </div>
  );
}
