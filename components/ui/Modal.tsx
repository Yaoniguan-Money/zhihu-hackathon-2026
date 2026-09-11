"use client";

/**
 * 通用居中弹窗壳：portal + fixed 遮罩 + max-h 内部滚动。
 * 点遮罩 / ✕ / Esc 关闭。范式与 ModelSettingsDialog 一致，
 * 用于替代右栏就地展开（真机上右栏内容超高时无法滚动）。
 */

import { useEffect, useState, type ReactNode, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icons";

interface ModalProps {
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof Icon>["name"];
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, subtitle, icon, onClose, children }: ModalProps) {
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
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="card-dark max-h-[85vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-paper/40 text-paper/80">
              <Icon name={icon} size={15} />
            </span>
          )}
          <div className="flex-1">
            <h2 className="text-sm font-black text-paper">{title}</h2>
            {subtitle && <p className="text-[11px] text-paper/50">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            title="关闭"
            aria-label={`关闭${title}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-paper/60 transition-colors hover:border-coral hover:text-coral"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
