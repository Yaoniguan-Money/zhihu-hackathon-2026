"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { MessagePublic, RolePublic } from "@/contracts/public";
import { personaForRole } from "@/components/three/characters/personas";
import { EMOTION_META, STANCE_META } from "@/lib/distortions";
import { useGame } from "@/context/GameContext";
import Typewriter from "@/components/ui/Typewriter";
import VoicePlayer from "@/components/ui/VoicePlayer";
import { Icon } from "@/components/ui/Icons";

interface DialogueListProps {
  messages: MessagePublic[];
  roles: RolePublic[];
  /** 正在逐字播放的 message_id（3D 角色同步口型）。 */
  speakingMessageId: string | null;
  onSpeakDone?: () => void;
  /** 语音播放失败上抛（显式呈现，不静默）。 */
  onVoiceError?: (error: { code: string; message: string }) => void;
}

/**
 * 对话记录：玩家消息（右）与已批准角色消息（左）。
 * 角色消息带情绪/立场徽章、语音播放与「存为录音证据」。
 */
export default function DialogueList({ messages, roles, speakingMessageId, onSpeakDone, onVoiceError }: DialogueListProps) {
  const roleById = new Map(roles.map((r) => [r.role_id, r]));
  const { sessionId, allowedActions, saveRecording, busyTurn } = useGame();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const canSave = allowedActions.has("save_recording") && !busyTurn;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-3">
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="flex h-9 w-9 animate-pulse items-center justify-center rounded-full border-2 border-paper/25 text-paper/50">
            <Icon name="quote" size={16} />
          </span>
          <p className="text-xs font-bold leading-relaxed text-paper/45">
            审讯记录为空。
            <br />
            五名角色正在准备开场陈述…
          </p>
        </div>
      )}
      {messages.map((m) => {
        if (m.speaker_type === "player") {
          return (
            <motion.div
              key={m.message_id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              className="ml-auto max-w-[85%]"
            >
              <div className="rounded-2xl rounded-br-sm border-2 border-ink bg-indigo-soft px-3.5 py-2 text-sm font-bold text-night shadow-[var(--shadow-sticker-sm)]">
                {m.exact_text}
              </div>
              <p className="mt-1 text-right text-[10px] font-bold text-paper/40">
                你 · {MODE_LABEL[m.mode]} · {timeLabel(m.created_at)}
              </p>
            </motion.div>
          );
        }

        if (m.speaker_type === "role") {
          const role = roleById.get(m.speaker_id);
          const look = role ? personaForRole(role) : null;
          const emotion = EMOTION_META[m.emotion] ?? EMOTION_META.calm;
          const isSpeaking = m.message_id === speakingMessageId;
          return (
            <motion.div
              key={m.message_id}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-[92%]"
            >
              <div
                className="rounded-2xl rounded-bl-sm border-2 border-ink bg-paper px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-[var(--shadow-sticker-sm)]"
                style={{ borderLeft: `6px solid ${look?.outfit ?? "#999"}` }}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-ink/70"
                    style={{ background: look?.outfit ?? "#999" }}
                  />
                  <span className="text-xs font-black">{role?.display_name ?? m.speaker_id}</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                    style={{ background: `${emotion.color}22`, color: emotion.color }}
                  >
                    {emotion.label}
                  </span>
                  <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink/60">
                    {STANCE_META[m.stance] ?? m.stance}
                  </span>
                  {role && sessionId && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <VoicePlayer messageId={m.message_id} sessionId={sessionId} />
                      {canSave && (
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => saveRecording(m.message_id)}
                          title="把这条发言存为录音证据"
                          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-teal text-ink hover:brightness-105"
                        >
                          <Icon name="quote" size={13} filled />
                        </motion.button>
                      )}
                    </span>
                  )}
                </div>
                {isSpeaking ? (
                  <Typewriter
                    text={m.exact_text}
                    prosody={m.prosody}
                    onDone={onSpeakDone}
                    className="cursor-pointer"
                  />
                ) : (
                  m.exact_text
                )}
              </div>
              <p className="mt-1 text-[10px] font-bold text-paper/40">{timeLabel(m.created_at)}</p>
            </motion.div>
          );
        }

        // GM 消息
        return (
          <div key={m.message_id} className="mx-auto max-w-[90%] rounded-xl border border-dashed border-paper/30 px-3 py-2 text-center text-xs font-bold text-paper/70">
            {m.exact_text}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

const MODE_LABEL: Record<string, string> = { gentle: "温和", direct: "直接", pressure: "施压" };

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
