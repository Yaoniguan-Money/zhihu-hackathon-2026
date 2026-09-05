"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useGame } from "@/context/GameContext";
import { Icon } from "@/components/ui/Icons";

const PHASE_LABEL: Record<string, string> = {
  briefing: "案情简报",
  opening_statements: "开场陈述",
  investigation: "审讯时间",
  judging: "合议中",
  revealed: "真相揭晓",
  failed: "对局终止",
};

export default function GameLayout({ children }: { children: ReactNode }) {
  const { phase, allowedActions, backToLobby } = useGame();

  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部导航 */}
      <nav className="relative z-20 flex items-center gap-3 border-b-2 border-paper/10 bg-night-deep/80 px-4 py-2.5 backdrop-blur-md">
        <Link
          href="/game/briefing"
          className="flex items-center gap-2 rounded-full border-2 border-paper/20 px-3 py-1 text-sm font-black text-paper transition-colors hover:border-amber hover:text-amber"
        >
          <Icon name="magnifier" size={16} />
          证据链狼人杀
        </Link>

        {phase && (
          <span className="chip !border-amber/70 !bg-amber/15 !text-amber">
            <Icon name="eye" size={12} />
            {PHASE_LABEL[phase] ?? phase}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/game/interrogation"
            className="rounded-full px-3 py-1.5 text-xs font-bold text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
          >
            审讯桌
          </Link>
          <Link
            href="/game/evidence"
            className="rounded-full px-3 py-1.5 text-xs font-bold text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
          >
            证据板
          </Link>
          {allowedActions.has("accuse") && (
            <Link
              href="/game/accusation"
              className="btn btn-coral !px-3.5 !py-1 text-xs"
            >
              <Icon name="bolt" size={13} filled />
              最终指控
            </Link>
          )}
          <button
            onClick={backToLobby}
            title="回到案件大厅"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-paper/70 transition-colors hover:border-coral hover:text-coral"
          >
            <Icon name="home" size={14} />
          </button>
        </div>
      </nav>

      <main className="relative flex-1">{children}</main>
    </div>
  );
}
