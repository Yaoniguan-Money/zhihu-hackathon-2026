"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useGame } from "@/context/GameContext";
import { Icon } from "@/components/ui/Icons";
import { requestTour, type TourId } from "@/components/onboarding/GameTour";
import SoundToggle from "@/components/ui/SoundToggle";
import { playSfx, primeSfx } from "@/lib/sfx";
import { startBgm, stopBgm } from "@/lib/bgm";

const go = () => playSfx("click");

const PHASE_LABEL: Record<string, string> = {
  briefing: "案情简报",
  opening_statements: "开场陈述",
  investigation: "审讯时间",
  judging: "合议中",
  revealed: "真相揭晓",
  failed: "对局终止",
};

const TOUR_FOR_PATH: Partial<Record<string, TourId>> = {
  "/game/briefing": "briefing",
  "/game/interrogation": "interrogation",
  "/game/evidence": "evidence",
  "/game/accusation": "accusation",
  "/game/reveal": "reveal",
};

export default function GameLayout({ children }: { children: ReactNode }) {
  const { phase, allowedActions, backToLobby, booted, matchesLobby } = useGame();
  const pathname = usePathname();
  const router = useRouter();
  const tourId = pathname ? TOUR_FOR_PATH[pathname] : undefined;

  // 状态机回到大厅态而路由仍停在 /game/*（如开局失败后）时回弹大厅，
  // 避免「正在进入审讯室…」门屏永久盲等。
  useEffect(() => {
    if (booted && matchesLobby && pathname?.startsWith("/game")) {
      router.replace("/");
    }
  }, [booted, matchesLobby, pathname, router]);

  // BGM：首次手势解锁后启动三首上传音乐的顺序轮换。
  useEffect(() => {
    const kick = () => {
      primeSfx();
      startBgm();
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [pathname]);

  useEffect(() => () => stopBgm(), []);

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
            onClick={go}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
          >
            审讯桌
          </Link>
          <Link
            href="/game/evidence"
            onClick={go}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
          >
            证据板
          </Link>
          {allowedActions.has("accuse") && (
            <Link
              href="/game/accusation"
              onClick={go}
              className="btn btn-coral !px-3.5 !py-1 text-xs"
            >
              <Icon name="bolt" size={13} filled />
              最终指控
            </Link>
          )}
          <SoundToggle />
          {tourId && (
            <button
              onClick={() => requestTour(tourId)}
              title="新手指引"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-xs font-black text-paper/70 transition-colors hover:border-amber hover:text-amber"
            >
              ?
            </button>
          )}
          <button
            onClick={() => {
              playSfx("click");
              backToLobby();
            }}
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
