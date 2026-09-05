'use client';

import { ReactNode } from 'react';
import Link from 'next/link';

export default function GameLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <nav className="glass-dark border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:text-indigo-400 transition-colors">
          <span className="text-xl">🔍</span>
          <span className="font-bold text-gradient">证据链狼人杀</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/game/interrogation"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            审讯桌
          </Link>
          <Link
            href="/game/evidence"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            证据板
          </Link>
          <Link
            href="/game/accusation"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            最终指控
          </Link>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
