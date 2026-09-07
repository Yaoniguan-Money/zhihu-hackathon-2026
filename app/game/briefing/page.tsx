"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { useGame } from "@/context/GameContext";
import Mascot from "@/components/ui/Mascot";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { Icon } from "@/components/ui/Icons";
import GameTour from "@/components/onboarding/GameTour";
import { personaForRole } from "@/components/three/characters/personas";
import { castArtFor, SCENE_ART } from "@/components/three/characters/castArt";

const PortraitRow = dynamic(() => import("@/components/three/PortraitRow"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-2xl bg-night-soft/60" />,
});

export default function BriefingPage() {
  const { casePublic, sourceDoc, sessionView, startGame, actionError, clearActionError, phase } = useGame();
  const router = useRouter();

  // 开庭成功后跟随阶段自动进入审讯桌（阶段事实来自 SessionView，不做本地推断）。
  useEffect(() => {
    if (phase === "opening_statements" || phase === "investigation") {
      router.replace("/game/interrogation");
    }
  }, [phase, router]);

  if (!casePublic || !sessionView) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="computer" size={110} caption="正在调出案件档案…" />
        <Link href="/" className="btn btn-ghost text-sm">
          <Icon name="back" size={14} /> 返回大厅
        </Link>
      </div>
    );
  }

  const canStart = phase === "briefing" && sessionView.allowed_actions.includes("start");
  const alreadyPlaying = phase !== "briefing";

  // 案情摘要取来源正文的前几段（完整正文可展开）。
  const paragraphs = (sourceDoc?.canonical_text ?? casePublic.summary)
    .split(/\n{2,}/)
    .filter((p) => p.trim() && !p.trimStart().startsWith("#"));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* 档案头 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <div className="tape" style={{ top: -10, left: "42%", transform: "rotate(-2deg)" }} />
        <div className="card relative overflow-hidden px-8 py-7">
          {/* 场景资产图横幅 */}
          <div className="relative -mx-8 -mt-7 mb-5 h-40 overflow-hidden md:h-52">
            <Image src={SCENE_ART} alt="侦探会议室 · 月下" fill sizes="(max-width: 1024px) 100vw, 960px" className="object-cover object-center" priority />
            <div className="absolute inset-0 bg-gradient-to-t from-[#f7f1e3] via-[#f7f1e3]/10 to-transparent" />
            <p className="absolute bottom-2 right-4 text-[10px] font-black uppercase tracking-[0.3em] text-ink/70 drop-shadow-[0_1px_0_rgba(247,241,227,0.8)]">
              Detective Meeting Room · Moonlight
            </p>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-coral-deep">Case File</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-ink">{casePublic.title}</h1>
          <p className="mt-2 text-sm font-bold text-ink/60">{casePublic.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="chip">{casePublic.theme}</span>
            <a
              href={casePublic.source_url}
              target="_blank"
              rel="noreferrer"
              className="chip cursor-pointer !bg-paper-dim hover:!bg-amber/40"
            >
              <Icon name="link" size={12} /> 来源知乎文章
            </a>
          </div>
        </div>
      </motion.div>

      {/* 角色立绘 */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="card-dark mt-6 p-4"
      >
        <h2 className="mb-1 flex items-center gap-2 px-2 text-sm font-black text-paper">
          <Icon name="mask" size={16} className="text-amber" />
          涉案角色 · 五人
          <span className="ml-2 chip !border-coral !bg-coral/15 !text-[10px] !text-coral">其中一位篡改了原文</span>
        </h2>
        <div className="h-64">
          <PortraitRow roles={casePublic.roles} className="h-full w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 px-2 pb-2 md:grid-cols-5">
          {casePublic.roles.map((role) => {
            const art = castArtFor(role.persona_key);
            return (
              <div key={role.role_id} className="rounded-xl border border-paper/10 bg-night-deep/50 p-2.5">
                <div className="flex items-center gap-2">
                  {art ? (
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-paper/25">
                      <Image src={art.portrait} alt={role.display_name} fill sizes="36px" className="object-cover object-top" />
                    </span>
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink/60"
                      style={{ background: personaForRole(role).outfit }}
                    />
                  )}
                  <p className="line-clamp-2 text-xs font-black leading-snug text-paper">{role.display_name}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-paper/55">{role.public_bio}</p>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* 案情正文 */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card mt-6 px-7 py-6"
        data-tour="briefing-file"
      >
        <h2 className="flex items-center gap-2 text-sm font-black text-ink">
          <Icon name="file" size={16} /> 案情来源（原文节选）
        </h2>
        <div className="paper-lines dashed-divider mt-3 space-y-3 pt-3">
          {paragraphs.slice(0, 6).map((p, i) => (
            <p key={i} className="line-clamp-4 text-sm leading-relaxed text-ink/80">
              {p.trim()}
            </p>
          ))}
          {paragraphs.length > 6 && (
            <p className="text-xs font-bold text-ink/45">… 完整正文已冻结在案件来源中（共 {paragraphs.length} 段）</p>
          )}
        </div>
      </motion.section>

      {/* 行动区 */}
      <div className="mt-7 flex flex-col items-center gap-3 pb-10">
        {actionError && <ErrorPanel error={actionError} onDismiss={clearActionError} />}
        {alreadyPlaying ? (
          <Link href="/game/interrogation" className="btn btn-amber px-10 text-base">
            对局进行中 · 回到审讯桌 <Icon name="next" size={16} />
          </Link>
        ) : (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={startGame}
            disabled={!canStart}
            className="btn btn-amber px-12 py-4 text-lg disabled:opacity-40"
            data-tour="briefing-start"
          >
            <Icon name="play" size={20} filled />
            开庭 · 听五条开场陈述
          </motion.button>
        )}
        <p className="text-xs text-paper/50">
          开庭后 AI 将依次呈上五条开场陈述，其中已经藏好了篡改。
        </p>
        <GameTour tour="briefing" />
      </div>
    </div>
  );
}
