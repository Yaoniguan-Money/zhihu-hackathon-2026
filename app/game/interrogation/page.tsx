"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/context/GameContext";
import DialogueList from "@/components/DialogueList";
import RecordButton from "@/components/ui/RecordButton";
import Typewriter from "@/components/ui/Typewriter";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Mascot from "@/components/ui/Mascot";
import GameTour from "@/components/onboarding/GameTour";
import { Icon } from "@/components/ui/Icons";
import { personaForRole } from "@/components/three/characters/personas";
import { EMOTION_META } from "@/lib/distortions";
import type { MessagePublic, QuestionMode, RoleEmotion } from "@/contracts/public";

const InterrogationStage = dynamic(() => import("@/components/three/InterrogationStage"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Mascot motion="computer" size={110} caption="正在点亮审讯室…" />
    </div>
  ),
});

const EMOTION_PRESSURE: Record<RoleEmotion, number> = {
  calm: 22,
  uneasy: 48,
  defensive: 68,
  agitated: 88,
};

const MODES: Array<{ id: QuestionMode; label: string; desc: string }> = [
  { id: "gentle", label: "温和", desc: "婉转询问" },
  { id: "direct", label: "直接", desc: "单刀直入" },
  { id: "pressure", label: "施压", desc: "步步紧逼" },
];

export default function InterrogationPage() {
  const game = useGame();
  const {
    casePublic,
    sessionView,
    messages,
    thinking,
    busyTurn,
    allowedActions,
    phase,
    ask,
    actionError,
    clearActionError,
  } = game;

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [mode, setMode] = useState<QuestionMode>("direct");
  const [input, setInput] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<{ code: string; message: string } | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roleMessages = useMemo(() => messages.filter((m) => m.speaker_type === "role"), [messages]);

  // 门屏等待计时：真实加载通常数秒；超过 20s 提示玩家返回大厅，避免无限盲等。
  const [gateSeconds, setGateSeconds] = useState(0);
  const gateWaiting = !casePublic || !sessionView;
  useEffect(() => {
    if (!gateWaiting) {
      setGateSeconds(0);
      return;
    }
    const t = setInterval(() => setGateSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gateWaiting]);

  // 角色回合在途时，在记录面板显示已等待秒数（Validator 常需 1~2 分钟，玩家需要反馈）。
  const [answerSeconds, setAnswerSeconds] = useState(0);
  useEffect(() => {
    if (!thinking) {
      setAnswerSeconds(0);
      return;
    }
    const t = setInterval(() => setAnswerSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [thinking?.requestId]); // eslint-disable-line react-hooks/exhaustive-deps
  const latestRole = roleMessages[roleMessages.length - 1] as
    | Extract<MessagePublic, { speaker_type: "role" }>
    | undefined;

  const openings = roleMessages.slice(0, 5);
  const inOpening = phase === "opening_statements";

  // 最新角色消息 → 打字机口型同步；超时兜底关闭。
  useEffect(() => {
    if (!latestRole) return;
    if (speakTimer.current) clearTimeout(speakTimer.current);
    setSpeakingMessageId(latestRole.message_id);
    const cap = Math.min(Math.max(latestRole.exact_text.length * 140, 3500), 20000);
    speakTimer.current = setTimeout(() => setSpeakingMessageId(null), cap);
    return () => {
      if (speakTimer.current) clearTimeout(speakTimer.current);
    };
  }, [latestRole?.message_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!casePublic || !sessionView) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="computer" size={110} caption="正在进入审讯室…" />
        <p className="text-xs font-bold text-paper/45">
          {gateSeconds >= 20
            ? `已等待 ${gateSeconds} 秒。若长时间无响应，请返回大厅重新开始。`
            : `已等待 ${gateSeconds} 秒`}
        </p>
        <Link href="/" className="btn btn-ghost text-sm">
          <Icon name="back" size={14} /> 返回大厅
        </Link>
      </div>
    );
  }

  const roles = casePublic.roles;
  const latestByRole = new Map<string, Extract<MessagePublic, { speaker_type: "role" }>>();
  for (const m of roleMessages) {
    if (m.speaker_type === "role") latestByRole.set(m.speaker_id, m);
  }

  const emotionOf = (roleId: string): RoleEmotion => latestByRole.get(roleId)?.emotion ?? "calm";
  const selectedRole = roles.find((r) => r.role_id === selectedRoleId) ?? null;

  const send = () => {
    const text = input.trim();
    if (!text || !selectedRoleId || busyTurn) return;
    ask(selectedRoleId, mode, text, "keyboard");
    setInput("");
  };

  const canAsk = allowedActions.has("ask") && Boolean(selectedRoleId) && !busyTurn;

  return (
    <div className="relative h-[calc(100vh-49px)] overflow-hidden">
      {/* 新手指引（仅审讯阶段自动弹出） */}
      <GameTour tour="interrogation" enabled={phase === "investigation"} />
      {/* 3D 舞台 */}
      <InterrogationStage
        className="!absolute inset-0"
        roles={roles.map((role) => {
          const latest = latestByRole.get(role.role_id);
          return {
            role,
            emotion: emotionOf(role.role_id),
            stance: latest?.stance ?? "answer",
            speaking: speakingMessageId !== null && latest?.message_id === speakingMessageId,
            pressure: EMOTION_PRESSURE[emotionOf(role.role_id)],
            gestureSeed: latest?.message_id,
            selected: selectedRoleId === role.role_id,
            onClick: () => setSelectedRoleId(role.role_id),
          };
        })}
        focusRoleId={selectedRoleId ?? thinking?.roleId ?? null}
        bubble={
          thinking
            ? {
                roleId: thinking.roleId,
                name: roles.find((r) => r.role_id === thinking.roleId)?.display_name ?? "",
                color: personaForRole(roles.find((r) => r.role_id === thinking.roleId)!).outfit,
                text: "让我想想…",
                key: `thinking-${thinking.requestId}`,
                thinking: true,
              }
            : latestRole && speakingMessageId === latestRole.message_id
              ? {
                  roleId: latestRole.speaker_id,
                  name: roles.find((r) => r.role_id === latestRole.speaker_id)?.display_name ?? "",
                  color: personaForRole(roles.find((r) => r.role_id === latestRole.speaker_id)!).outfit,
                  text: latestRole.exact_text.slice(0, 60),
                  key: latestRole.message_id,
                }
              : null
        }
      />

      {/* 顶部信息 */}
      <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-3">
        <div className="card-dark pointer-events-auto flex items-center gap-2 px-4 py-2">
          <Icon name="scale" size={16} className="text-amber" />
          <span className="text-xs font-black text-paper">
            {casePublic.title.slice(0, 18)}…
          </span>
        </div>
        <AnimatePresence>
          {selectedRole && (
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="card pointer-events-auto max-w-[280px] px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full border-2 border-ink"
                  style={{ background: personaForRole(selectedRole).outfit }}
                />
                <p className="text-sm font-black text-ink">{selectedRole.display_name}</p>
                <span className="ml-auto text-[10px] font-black text-ink/50">{selectedRole.public_bio.slice(0, 14)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full border border-ink/30 bg-paper-dim">
                <motion.div
                  className="h-full rounded-full"
                  animate={{
                    width: `${EMOTION_PRESSURE[emotionOf(selectedRole.role_id)]}%`,
                    background:
                      EMOTION_META[emotionOf(selectedRole.role_id)].color,
                  }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                />
              </div>
              <p className="mt-1 text-[10px] font-bold text-ink/50">当前情绪：{EMOTION_META[emotionOf(selectedRole.role_id)].label}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 右侧对话面板 */}
      <div className="absolute bottom-[150px] right-4 top-[70px] z-10 w-[350px] max-w-[86vw] overflow-hidden rounded-2xl border-2 border-paper/10 bg-night-deep/75 backdrop-blur-md" data-tour="int-log">
        <div className="flex items-center gap-2 border-b border-paper/10 px-4 py-2.5">
          <Icon name="eye" size={15} className="text-amber" />
          <span className="text-sm font-black text-paper">审讯记录</span>
          {thinking && (
            <span className="chip !border-amber/60 !bg-amber/10 !text-[10px] !text-amber">
              正在回答… {answerSeconds}s
            </span>
          )}
          <span className="ml-auto chip !border-paper/30 !bg-transparent !text-[10px] !text-paper/60">
            {messages.length} 条
          </span>
        </div>
        <div className="h-[calc(100%-42px)]">
          <DialogueList
            messages={messages}
            roles={roles}
            speakingMessageId={inOpening ? null : speakingMessageId}
            onSpeakDone={() => setSpeakingMessageId(null)}
          />
        </div>
      </div>

      {/* 底部输入区 */}
      {phase === "investigation" && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="mx-auto max-w-3xl rounded-2xl border-2 border-paper/15 bg-night-deep/85 p-3 backdrop-blur-md">
            {/* 角色选择 + 问法 */}
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5" data-tour="int-role">
              {roles.map((role) => {
                const look = personaForRole(role);
                const emotion = emotionOf(role.role_id);
                const active = selectedRoleId === role.role_id;
                return (
                  <motion.button
                    key={role.role_id}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setSelectedRoleId(role.role_id)}
                    className={`flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-black transition-all ${
                      active ? "border-ink bg-amber text-ink shadow-[var(--shadow-sticker-sm)]" : "border-paper/20 bg-night-soft/70 text-paper/80 hover:border-paper/50"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full border border-ink/50" style={{ background: look.outfit }} />
                    {role.display_name.split(" · ")[0]}
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: EMOTION_META[emotion].color }} />
                  </motion.button>
                );
              })}
              <span className="mx-1 h-4 w-px bg-paper/20" />
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  title={m.desc}
                  className={`rounded-full border-2 px-2.5 py-1 text-xs font-black transition-all ${
                    mode === m.id ? "border-ink bg-coral text-paper shadow-[var(--shadow-sticker-sm)]" : "border-paper/20 text-paper/70 hover:border-paper/50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5" data-tour="int-input">
              <RecordButton
                disabled={!canAsk}
                onTranscript={(t) => setInput((prev) => (prev ? `${prev} ${t.text}` : t.text))}
                onError={(e) => setVoiceError(e)}
              />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
                placeholder={
                  selectedRole
                    ? `向 ${selectedRole.display_name.split(" · ")[0]} ${MODES.find((m) => m.id === mode)?.desc}地提问…`
                    : "先点圆桌上的角色，再提问"
                }
                disabled={!allowedActions.has("ask")}
                className="min-w-0 flex-1 rounded-full border-2 border-paper/20 bg-night-deep/70 px-5 py-2.5 text-sm text-paper placeholder:text-paper/35 focus:border-amber focus:outline-none disabled:opacity-50"
              />
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={send}
                disabled={!canAsk || !input.trim()}
                className="btn btn-amber !px-5 disabled:opacity-40"
              >
                <Icon name="send" size={16} />
                发问
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* 开场剧场 */}
      <AnimatePresence>
        {inOpening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.06, filter: "blur(6px)" }}
            className="absolute inset-0 z-30 flex items-end justify-center bg-night-deep/45 pb-24"
          >
            <OpeningTheater
              openings={openings}
              roles={roles}
              done={openings.length >= 5}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* judging 等待 */}
      {phase === "judging" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-night-deep/70">
          <Mascot motion="sway" size={130} caption="合议庭正在核对证据与答案…" />
        </div>
      )}

      {/* revealed 引导 */}
      {phase === "revealed" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2"
        >
          <Link href="/game/reveal" className="btn btn-coral px-10 py-4 text-lg shadow-[var(--shadow-glow-lamp)]">
            <Icon name="magnifier" size={20} />
            真相揭晓 →
          </Link>
        </motion.div>
      )}

      {/* failed 终局 */}
      {phase === "failed" && sessionView.terminal_error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-night-deep/85 px-6">
          <Mascot motion="sleep" size={120} caption="这一局没能走到揭晓…" />
          <ErrorPanel error={sessionView.terminal_error} className="max-w-md" />
          <button onClick={game.backToLobby} className="btn btn-amber">
            <Icon name="home" size={15} /> 回大厅开新局
          </button>
        </div>
      )}

      {/* briefing 引导 */}
      {phase === "briefing" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-night-deep/60">
          <Mascot motion="idle" size={110} caption="先读案情，再开庭" />
          <Link href="/game/briefing" className="btn btn-amber">
            <Icon name="file" size={15} /> 去看案情简报
          </Link>
        </div>
      )}

      {/* 提问失败显式呈现 */}
      <AnimatePresence>
        {actionError && phase === "investigation" && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-[132px] left-1/2 z-20 w-[420px] max-w-[90vw] -translate-x-1/2"
          >
            <ErrorPanel error={actionError} onDismiss={clearActionError} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 语音失败：显式呈现并保留键盘输入路径 */}
      <AnimatePresence>
        {voiceError && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-[132px] left-1/2 z-20 w-[420px] max-w-[90vw] -translate-x-1/2"
          >
            <ErrorPanel
              error={{ code: voiceError.code as never, message: voiceError.message }}
              onDismiss={() => setVoiceError(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OpeningTheater({
  openings,
  roles,
  done,
}: {
  openings: Extract<MessagePublic, { speaker_type: "role" }>[];
  roles: import("@/contracts/public").RolePublic[];
  done: boolean;
}) {
  const current = openings[openings.length - 1];
  const role = roles.find((r) => r.role_id === current?.speaker_id);
  const look = role ? personaForRole(role) : null;

  return (
    <motion.div
      key={current?.message_id ?? "empty"}
      initial={{ opacity: 0, y: 40, rotate: -0.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 20 }}
      className="card relative w-[640px] max-w-[92vw] px-8 py-6"
    >
      <div className="tape" style={{ top: -10, left: 40, transform: "rotate(-5deg)" }} />
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink text-lg text-paper"
          style={{ background: look?.outfit ?? "#888" }}
        >
          {openings.length}
        </span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-coral-deep">
            Opening Statement {openings.length} / 5
          </p>
          <h3 className="text-lg font-black text-ink">{role?.display_name ?? "…"}</h3>
        </div>
        <div className="ml-auto flex gap-1.5">
          {roles.map((r, i) => (
            <span
              key={r.role_id}
              className={`h-2.5 w-2.5 rounded-full border border-ink/60 ${
                openings.length > i ? "bg-teal" : "bg-paper-dim"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="dashed-divider paper-lines mt-4 min-h-[110px] pt-3">
        {current ? (
          <Typewriter
            key={current.message_id}
            text={current.exact_text}
            prosody={current.prosody}
            className="text-[15px] leading-relaxed text-ink/90"
          />
        ) : (
          <p className="animate-pulse text-sm font-bold text-ink/50">第一位角色正在起身…</p>
        )}
      </div>
      {done && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-right text-xs font-black text-teal"
        >
          五条开场已呈堂 · 进入自由审讯…
        </motion.p>
      )}
    </motion.div>
  );
}
