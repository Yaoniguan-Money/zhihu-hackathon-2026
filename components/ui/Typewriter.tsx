"use client";

import { useEffect, useRef, useState } from "react";
import type { RoleProsody } from "@/contracts/public";

const PACE_MS: Record<NonNullable<RoleProsody["pace"]>, number> = {
  slow: 42,
  normal: 20,
  fast: 12,
};

interface TypewriterProps {
  text: string;
  prosody?: RoleProsody;
  /** 打完后光标是否继续闪（等待下一步演出）。 */
  keepCaret?: boolean;
  onDone?: () => void;
  className?: string;
}

/**
 * 打字机：只对本机已批准文本做动画（ENGINEERING_SPEC §5.2 —— 流式不属于产品能力）。
 * prefers-reduced-motion 时直接整段显示。
 */
export default function Typewriter({ text, prosody, keepCaret = false, onDone, className }: TypewriterProps) {
  const [count, setCount] = useState(0);
  const doneRef = useRef(false);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setCount(0);
    doneRef.current = false;
    if (reduced || !text) {
      setCount(text.length);
      return;
    }
    const speed = PACE_MS[prosody?.pace ?? "normal"];
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      setCount((c) => {
        if (c + 1 >= text.length) {
          clearInterval(timer);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
          return text.length;
        }
        return c + 1;
      });
    }, speed);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, prosody?.pace, reduced]);

  const done = count >= text.length;
  const showCaret = !done || keepCaret;

  return (
    <span className={className} onClick={() => !done && setCount(text.length)}>
      {text.slice(0, count)}
      {showCaret && <span className="typewriter-caret" />}
    </span>
  );
}
