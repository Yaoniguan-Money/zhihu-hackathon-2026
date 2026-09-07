"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icons";
import Mascot from "@/components/ui/Mascot";

/** 知乎支线页统一外壳：返回大厅导航 + 标题区 + 设计系统容器。 */
export default function ZhihuShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      {/* 顶部导航 */}
      <nav className="flex items-center gap-3 border-b-2 border-paper/10 bg-night-deep/80 px-4 py-2.5 backdrop-blur-md">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full border-2 border-paper/20 px-3 py-1 text-sm font-black text-paper transition-colors hover:border-amber hover:text-amber"
        >
          <Icon name="back" size={14} />
          侦探事务所
        </Link>
        <span className="chip !border-amber/70 !bg-amber/15 !text-amber">
          <Icon name="eye" size={12} />
          知乎选题工坊
        </span>
      </nav>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        {/* 标题区 */}
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-ink bg-amber shadow-[3px_3px_0_0_rgba(26,22,38,0.85)]">
            <Icon name={icon} size={22} className="text-ink" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-paper">{title}</h1>
            <p className="text-xs font-bold text-paper/50">{subtitle}</p>
          </div>
          <Mascot motion="idle" size={72} className="ml-auto hidden sm:block" />
        </div>

        {children}
      </div>
    </div>
  );
}
