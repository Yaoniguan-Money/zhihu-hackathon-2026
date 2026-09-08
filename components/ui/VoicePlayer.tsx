"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { newClientActionId } from "@/lib/convex-client";
import { toPublicError } from "@/lib/convex-errors";
import { Icon } from "./Icons";

interface VoicePlayerProps {
  messageId: string;
  sessionId: string;
  onError?: (error: { code: string; message: string }) => void;
}

type VoiceState = "idle" | "loading" | "playing";

/**
 * 已批准发言的语音播放按钮：POST /api/voice/messages/{id}/speech（同源 Route）。
 * 失败显式呈现（VOICE_TTS_FAILED 等），已批准文字保留——不允许备用朗读路径。
 */
export default function VoicePlayer({ messageId, sessionId, onError }: VoicePlayerProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { fetchAccessToken } = useConvexAuth();

  const play = async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      const token = await fetchAccessToken({ forceRefreshToken: false });
      if (!token) {
        onError?.({ code: "AUTH_REQUIRED", message: "需要先建立会话身份" });
        setState("idle");
        return;
      }
      const res = await fetch(`/api/voice/messages/${encodeURIComponent(messageId)}/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, client_action_id: newClientActionId() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const err = toPublicError(data);
        onError?.(err);
        setState("idle");
        return;
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => {
        setState("idle");
        audioRef.current = null;
      };
      await audio.play();
      setState("playing");
    } catch (err) {
      onError?.(toPublicError(err));
      setState("idle");
    }
  };

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setState("idle");
  };

  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={state === "playing" ? stop : play}
      disabled={state === "loading"}
      title="播放这条发言的语音"
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink transition-colors ${
        state === "playing"
          ? "bg-coral text-paper"
          : "bg-amber text-ink hover:brightness-105 disabled:opacity-50"
      }`}
    >
      {state === "loading" ? (
        <motion.span
          className="block h-3 w-3 rounded-full border-2 border-ink border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
        />
      ) : state === "playing" ? (
        <Icon name="stop" size={12} filled />
      ) : (
        <Icon name="play" size={13} filled />
      )}
    </motion.button>
  );
}
