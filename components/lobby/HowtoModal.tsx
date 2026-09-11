"use client";

/**
 * 「玩法 · 90 秒看懂」弹窗：替代原右栏就地展开（小屏下内容被裁切且无法滚动）。
 * 范式与 ModelSettingsDialog 一致：portal + fixed 遮罩 + max-h 内部滚动，
 * 点遮罩 / ✕ / Esc 关闭。
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icons";

const HOWTO_STEPS = [
  "五个 AI 角色围绕圆桌各自开场，只有一人篡改了原文。",
  "温和/直接/施压三种问法审讯，把发言存成录音证据对质。",
  "在证据板上拼出「来源事实 → 角色转述 → 被改变的关系」。",
  "提交指控：篡改者 + 篡改方式 + 证据链。",
  "揭底复盘：证据/审讯双维评分，生成可分享的辨别力战绩卡。",
];

export default function HowtoModal({ onClose }: { onClose: () => void }) {
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-night/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="玩法说明"
      onClick={onClose}
    >
      <div
        className="card-dark max-h-[85vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper/40 text-paper/80">
            <Icon name="quote" size={15} />
          </span>
          <div className="flex-1">
            <h2 className="text-sm font-black text-paper">玩法 · 90 秒看懂</h2>
            <p className="text-[11px] text-paper/50">五步抓出那个篡改原文的家伙</p>
          </div>
          <button
            onClick={onClose}
            title="关闭"
            aria-label="关闭玩法说明"
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-paper/60 transition-colors hover:border-coral hover:text-coral"
          >
            ✕
          </button>
        </div>

        <ol className="mt-4 space-y-2.5">
          {HOWTO_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl border border-paper/10 bg-night-deep/60 p-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber/20 text-[10px] font-black text-amber">
                {i + 1}
              </span>
              <span className="text-xs leading-relaxed text-paper/75">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>,
    document.body,
  );
}
