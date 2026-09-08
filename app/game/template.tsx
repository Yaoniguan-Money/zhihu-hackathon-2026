"use client";

import { motion } from "motion/react";

/**
 * 游戏内路由统一过场：轻量淡入上移，消除页面切换的"硬切"感。
 * prefers-reduced-motion 时直接静态渲染。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
