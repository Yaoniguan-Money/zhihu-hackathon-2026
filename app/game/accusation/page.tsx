"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useGame } from "@/context/GameContext";
import Mascot from "@/components/ui/Mascot";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { ModelSettingsButton } from "@/components/settings/ModelSettingsDialog";
import { Icon } from "@/components/ui/Icons";
import { personaForRole } from "@/components/three/characters/personas";
import GameTour from "@/components/onboarding/GameTour";
import { DISTORTION_META, DISTORTION_ORDER } from "@/lib/distortions";
import { playSfx } from "@/lib/sfx";
import type { DistortionType } from "@/contracts/shared";

const PortraitRow = dynamic(() => import("@/components/three/PortraitRow"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-night-soft/60" />,
});

export default function AccusationPage() {
  const router = useRouter();
  const {
    casePublic,
    sessionView,
    evidences,
    accuse,
    allowedActions,
    phase,
    busyTurn,
    actionError,
    clearActionError,
    backToLobby,
  } = useGame();

  // 判决就绪后自动带玩家进揭底页，避免停在指控表单上找不到入口。
  useEffect(() => {
    if (phase === "revealed") router.replace("/game/reveal");
  }, [phase, router]);

  const [suspect, setSuspect] = useState<string | null>(null);
  const [types, setTypes] = useState<DistortionType[]>([]);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  if (!casePublic || !sessionView) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="computer" size={110} caption="正在准备起诉状…" />
        <Link href="/" className="btn btn-ghost text-sm">返回大厅</Link>
      </div>
    );
  }

  const canAccuse = allowedActions.has("accuse") && !busyTurn;
  const ready = Boolean(suspect) && types.length > 0 && evidenceIds.length > 0;
  const judging = phase === "judging";

  const toggleType = (dt: DistortionType) =>
    setTypes((prev) => (prev.includes(dt) ? prev.filter((x) => x !== dt) : [...prev, dt]));
  const toggleEvidence = (id: string) =>
    setEvidenceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="mx-auto max-w-4xl px-6 py-7">
      <GameTour tour="accusation" />
      {/* 起诉状头 */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <div className="tape" style={{ top: -10, left: "38%", transform: "rotate(2deg)" }} />
        <div className="card px-8 py-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-coral-deep">Final Accusation</p>
          <h1 className="mt-1 text-3xl font-black text-ink">最终指控</h1>
          <p className="mt-1 text-xs font-bold text-ink/55">
            指出篡改者、篡改方式，并附上支撑证据。提交后由合议庭判决，不可撤回。
          </p>
        </div>
      </motion.div>

      {judging ? (
        <div className="mt-8 flex flex-col items-center gap-4">
          <Mascot motion="sway" size={130} caption="合议庭正在核对你的指控…" />
          <p className="text-sm font-bold text-paper/60">判决即将出炉，请稍候。</p>
        </div>
      ) : (
        <>
          {/* ① 嫌疑角色 */}
          <section className="card-dark mt-6 p-4" data-tour="acc-role">
            <h2 className="mb-1 flex items-center gap-2 px-2 text-sm font-black text-paper">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber bg-amber/20 text-xs text-amber">1</span>
              指认篡改者
            </h2>
            <div className="h-64">
              <PortraitRow
                roles={casePublic.roles}
                selectedId={suspect}
                onSelect={(id) => canAccuse && setSuspect(id)}
                className="h-full w-full"
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2 px-2 pb-1">
              {casePublic.roles.map((r) => (
                <button
                  key={r.role_id}
                  onClick={() => setSuspect(r.role_id)}
                  className={`chip cursor-pointer transition-all ${
                    suspect === r.role_id ? "!border-ink !bg-amber !text-ink shadow-[var(--shadow-sticker-sm)]" : ""
                  }`}
                >
                  <span className="h-2 w-2 rounded-full border border-ink/50" style={{ background: personaForRole(r).outfit }} />
                  {r.display_name.split(" · ")[0]}
                </button>
              ))}
            </div>
          </section>

          {/* ② 篡改方式 */}
          <section className="card-dark mt-4 p-4" data-tour="acc-distort">
            <h2 className="mb-3 flex items-center gap-2 px-2 text-sm font-black text-paper">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber bg-amber/20 text-xs text-amber">2</span>
              篡改方式（可多选）
            </h2>
            <div className="flex flex-wrap gap-2 px-2">
              {DISTORTION_ORDER.map((dt) => {
                const meta = DISTORTION_META[dt];
                const active = types.includes(dt);
                return (
                  <motion.button
                    key={dt}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => canAccuse && toggleType(dt)}
                    title={meta.desc}
                    className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-black transition-all ${
                      active
                        ? "border-ink bg-coral text-paper shadow-[var(--shadow-sticker-sm)]"
                        : "border-paper/20 bg-night-deep/50 text-paper/75 hover:border-paper/50"
                    }`}
                  >
                    {active && <Icon name="check" size={12} />}
                    {meta.name}
                    <span className="text-[10px] font-bold opacity-60">{meta.desc}</span>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* ③ 证据链 */}
          <section className="card-dark mt-4 p-4" data-tour="acc-evidence">
            <h2 className="mb-3 flex items-center gap-2 px-2 text-sm font-black text-paper">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber bg-amber/20 text-xs text-amber">3</span>
              支撑证据（至少一件）
              <span className="ml-auto text-[10px] font-bold text-paper/45">已选 {evidenceIds.length}</span>
            </h2>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto px-2 md:grid-cols-2">
              {evidences.map((e) => {
                const active = evidenceIds.includes(e.evidence_id);
                return (
                  <motion.button
                    key={e.evidence_id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => canAccuse && toggleEvidence(e.evidence_id)}
                    className={`rounded-xl border-2 p-2.5 text-left transition-all ${
                      active
                        ? "border-ink bg-amber text-ink shadow-[var(--shadow-sticker-sm)]"
                        : "border-paper/15 bg-night-deep/50 text-paper/80 hover:border-paper/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {active && <Icon name="check" size={12} />}
                      <p className="truncate text-[11px] font-black">{e.title}</p>
                      <span className={`ml-auto chip !px-1.5 !py-0 !text-[9px] ${active ? "" : "!border-paper/25 !bg-transparent !text-paper/50"}`}>
                        {e.type}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-70">{e.body}</p>
                  </motion.button>
                );
              })}
              {evidences.length === 0 && (
                <p className="col-span-2 py-6 text-center text-xs font-bold text-paper/40">
                  还没有证据。回审讯桌收集发言并解锁证据。
                </p>
              )}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="补充说明（可选）：指出角色在哪句话里改变了事实关系…"
              rows={2}
              className="mx-2 mt-3 w-[calc(100%-16px)] resize-none rounded-xl border-2 border-paper/20 bg-night-deep/60 px-4 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-amber focus:outline-none"
            />
          </section>

          {/* 提交 */}
          <div className="mt-6 flex flex-col items-center gap-3 pb-10" data-tour="acc-submit">
            {actionError && <ErrorPanel error={actionError} onDismiss={clearActionError} />}
            <motion.button
              whileHover={{ scale: ready && canAccuse ? 1.04 : 1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                if (!suspect) return;
                playSfx("accuse");
                accuse({
                  suspect_role_id: suspect,
                  distortion_types: types,
                  evidence_ids: evidenceIds,
                  note: note.trim() || undefined,
                });
              }}
              disabled={!ready || !canAccuse}
              className="btn btn-coral px-12 py-4 text-lg"
            >
              <Icon name="bolt" size={20} filled />
              提交指控
            </motion.button>
            {!canAccuse && phase === "investigation" && (
              <p className="text-xs font-bold text-paper/45">需要先解锁至少一件证据（在证据板上保存后）才能指控。</p>
            )}
            {phase === "revealed" && (
              <Link href="/game/reveal" className="btn btn-amber">
                看揭晓结果
              </Link>
            )}
          </div>
        </>
      )}

      {phase === "failed" && sessionView.terminal_error && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-night-deep/85">
          <ErrorPanel error={sessionView.terminal_error} className="max-w-md" />
          <div className="flex items-center gap-2">
            {sessionView.terminal_error.code === "SERVICE_NOT_CONFIGURED" && (
              <ModelSettingsButton label="去设置模型" className="btn btn-coral" />
            )}
            <button onClick={backToLobby} className="btn btn-amber">回大厅</button>
          </div>
        </div>
      )}
    </div>
  );
}
