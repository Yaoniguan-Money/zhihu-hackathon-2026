"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { useGame } from "@/context/GameContext";
import Mascot from "@/components/ui/Mascot";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { Icon } from "@/components/ui/Icons";
import { personaForRole } from "@/components/three/characters/personas";
import { castArtFor } from "@/components/three/characters/castArt";
import { DISTORTION_META } from "@/lib/distortions";
import { calcDiscernmentLevel, type ScoreCardData } from "@/lib/score-card";
import GameTour from "@/components/onboarding/GameTour";

export default function RevealPage() {
  const { casePublic, sessionView, reveal, actionError, phase, backToLobby, messages } = useGame();
  const rootRef = useRef<HTMLDivElement>(null);
  const scoreEvidenceRef = useRef<HTMLSpanElement>(null);
  const scoreQuestioningRef = useRef<HTMLSpanElement>(null);

  // 入场演出时间轴：标题 → 真相卡 → 对照卡 → 真相链 → 分数滚动。
  useEffect(() => {
    if (!reveal || !rootRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".rv-hero", { opacity: 0, y: -30, duration: 0.55 })
        .from(".rv-culprit", { scale: 0.6, opacity: 0, rotate: -6, duration: 0.6, ease: "back.out(1.8)" })
        .from(".rv-badges > *", { opacity: 0, y: 14, stagger: 0.07, duration: 0.35 })
        .from(".rv-link", { opacity: 0, x: -36, stagger: 0.16, duration: 0.45 })
        .from(".rv-chain > *", { opacity: 0, y: 18, stagger: 0.1, duration: 0.35 })
        .from(".rv-note", { opacity: 0, y: 18, duration: 0.4 });

      const counters: Array<[HTMLSpanElement | null, number]> = [
        [scoreEvidenceRef.current, reveal.evidence_score],
        [scoreQuestioningRef.current, reveal.questioning_score],
      ];
      for (const [el, value] of counters) {
        if (!el) continue;
        const obj = { v: 0 };
        tl.to(
          obj,
          {
            v: value,
            duration: 1.3,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = String(Math.round(obj.v));
            },
          },
          "-=0.4",
        );
      }
      tl.from(".rv-score", { opacity: 0, scale: 0.7, duration: 0.5, ease: "back.out(1.6)" }, "<");
    }, rootRef);
    return () => ctx.revert();
  }, [reveal]);

  // 战绩回流：揭晓后把本局结果写入 localStorage，供 /zhihu/score-card 生成战绩卡。
  const savedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!reveal || !casePublic || !sessionView) return;
    if (savedSessionRef.current === sessionView.session_id) return;
    savedSessionRef.current = sessionView.session_id;
    const totalScore = Math.round((reveal.evidence_score + reveal.questioning_score) / 2);
    const result: ScoreCardData = {
      caseTitle: casePublic.title,
      isCorrect: reveal.player_correct,
      timeUsed: Math.max(0, Math.round((Date.now() - Date.parse(sessionView.created_at)) / 1000)),
      roundsPlayed: messages.filter((m) => m.speaker_type === "role").length,
      evidenceScore: reveal.evidence_score,
      questioningScore: reveal.questioning_score,
      totalScore,
      discernmentLevel: calcDiscernmentLevel(totalScore),
      timestamp: Date.now(),
    };
    localStorage.setItem("lastGameResult", JSON.stringify(result));
  }, [reveal, casePublic, sessionView, messages]);

  if (phase !== "revealed") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="sleep" size={110} caption="判决还没有揭晓。" />
        <Link href="/game/interrogation" className="btn btn-ghost text-sm">回到审讯桌</Link>
      </div>
    );
  }

  if (!casePublic) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="computer" size={110} caption="正在调取判决书…" />
      </div>
    );
  }

  if (actionError && !reveal) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <ErrorPanel error={actionError} />
        <Link href="/game/interrogation" className="btn btn-ghost text-sm">回到审讯桌</Link>
      </div>
    );
  }

  if (!reveal) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="sway" size={120} caption="合议庭正在宣读判决…" />
      </div>
    );
  }

  const culprit = casePublic.roles.find((r) => r.role_id === reveal.correct_role_id);
  const accused = sessionView?.submitted_accusation
    ? casePublic.roles.find((r) => r.role_id === sessionView.submitted_accusation?.suspect_role_id)
    : null;
  const correct = reveal.player_correct;

  return (
    <div ref={rootRef} className="mx-auto max-w-4xl px-6 py-8">
      <GameTour tour="reveal" />
      {/* 判决时刻 */}
      <div className="rv-hero text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-paper/50">The Reveal</p>
        <h1 className={`mt-2 text-5xl font-black ${correct ? "text-amber" : "text-coral"}`}>
          {correct ? "指控成立！" : "指控未成立"}
        </h1>
        <p className="mt-2 text-sm font-bold text-paper/60">
          {accused ? `你指控了 ${accused.display_name.split(" · ")[0]} · ` : ""}
          真正的篡改者是——
        </p>
      </div>

      {/* 真凶卡 */}
      {culprit && (
        <div className="rv-culprit card mx-auto mt-5 max-w-lg px-7 py-6 text-center">
          {castArtFor(culprit.persona_key) ? (
            <div className="relative mx-auto h-44 w-36 overflow-hidden rounded-2xl border-2 border-ink shadow-[3px_3px_0_0_rgba(26,22,38,0.85)]">
              <Image
                src={castArtFor(culprit.persona_key)!.portrait}
                alt={culprit.display_name}
                fill
                sizes="144px"
                className="object-cover object-top"
              />
            </div>
          ) : (
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-ink text-2xl font-black text-paper" style={{ background: personaForRole(culprit).outfit }}>
              {culprit.display_name.slice(0, 1)}
            </div>
          )}
          <h2 className="mt-3 text-2xl font-black text-ink">{culprit.display_name}</h2>
          <p className="mt-1 text-xs font-bold text-ink/60">{culprit.public_bio}</p>
          <div className="rv-badges mt-4 flex flex-wrap justify-center gap-2">
            {reveal.distortion_types.map((dt) => (
              <span key={dt} className="chip !border-coral-deep !bg-coral/15 !text-coral-deep">
                <Icon name="mask" size={12} />
                {DISTORTION_META[dt]?.name ?? dt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 正误氛围 */}
      <div className="mt-4 flex justify-center">
        {correct ? (
          <Mascot motion="dribble" size={110} caption="证据链把真相钉死了。" />
        ) : (
          <Mascot motion="idle" size={110} caption="真相和你想的不一样，看看下面。" />
        )}
      </div>

      {/* 被改变的关系 */}
      {reveal.altered_links.length > 0 && (
        <section className="mt-8" data-tour="rev-links">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-paper">
            <Icon name="bolt" size={16} className="text-coral" filled />
            被改变的关系
          </h3>
          <div className="space-y-3">
            {reveal.altered_links.map((link, i) => (
              <div key={i} className="rv-link grid gap-2 md:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-2xl border-2 border-teal bg-teal/10 px-4 py-3">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-teal">原文事实</p>
                  <p className="text-sm leading-relaxed text-paper/90">{link.original}</p>
                </div>
                <div className="flex items-center justify-center">
                  <span className="chip !border-coral !bg-coral/20 !text-coral">
                    <Icon name="next" size={12} />
                    {DISTORTION_META[link.distortion_type]?.name ?? link.distortion_type}
                  </span>
                </div>
                <div className="rounded-2xl border-2 border-coral bg-coral/10 px-4 py-3">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-coral">被篡改后</p>
                  <p className="text-sm leading-relaxed text-paper/90">{link.distorted}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 真相链 */}
      <section className="card-dark mt-8 p-5" data-tour="rev-chain">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-paper">
          <Icon name="link" size={16} className="text-amber" />
          完整真相链
        </h3>
        <div className="rv-chain space-y-0">
          {reveal.truth_chain.map((step, i) => (
            <div key={step.claim_id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < reveal.truth_chain.length - 1 && (
                <span className="absolute left-[13px] top-7 h-full w-0.5 bg-amber/40" />
              )}
              <span className="z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-amber text-xs font-black text-ink">
                {step.order}
              </span>
              <p className="pt-1 text-sm leading-relaxed text-paper/85">{step.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 判词与现实映射 */}
      <section className="card mt-8 px-7 py-6">
        <h3 className="flex items-center gap-2 text-sm font-black text-ink">
          <Icon name="scale" size={16} />
          合议庭判词
        </h3>
        <p className="rv-note mt-3 text-sm leading-relaxed text-ink/80">{reveal.explanation}</p>
        {reveal.reality_mapping.length > 0 && (
          <>
            <div className="dashed-divider my-4" />
            <h4 className="text-xs font-black uppercase tracking-widest text-coral-deep">
              现实映射 · 这套手法在信息流里长什么样
            </h4>
            <ul className="mt-2 space-y-2">
              {reveal.reality_mapping.map((m, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink/75">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-deep" />
                  {m}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 双维评分 */}
      <section className="rv-score card-dark mt-8 grid grid-cols-2 gap-4 p-6" data-tour="rev-score">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-widest text-teal">Evidence Score</p>
          <p className="mt-1 text-5xl font-black text-teal">
            <span ref={scoreEvidenceRef}>{reveal.evidence_score}</span>
            <span className="text-lg text-paper/40"> / 100</span>
          </p>
          <p className="mt-1 text-[11px] font-bold text-paper/50">证据质量：命中真相链的程度</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-widest text-indigo-soft">Questioning Score</p>
          <p className="mt-1 text-5xl font-black text-indigo-soft">
            <span ref={scoreQuestioningRef}>{reveal.questioning_score}</span>
            <span className="text-lg text-paper/40"> / 100</span>
          </p>
          <p className="mt-1 text-[11px] font-bold text-paper/50">审讯质量：覆盖角色与追问深度</p>
        </div>
      </section>

      {/* 行动 */}
      <div className="mt-8 flex justify-center gap-3 pb-10" data-tour="rev-actions">
        <button onClick={backToLobby} className="btn btn-amber px-8">
          <Icon name="refresh" size={16} />
          再来一局
        </button>
        <Link href="/zhihu/score-card" className="btn btn-coral px-8">
          <Icon name="pin" size={16} />
          生成战绩卡
        </Link>
        <Link href="/" className="btn btn-ghost px-8">
          <Icon name="home" size={16} />
          回到事务所
        </Link>
      </div>
    </div>
  );
}
