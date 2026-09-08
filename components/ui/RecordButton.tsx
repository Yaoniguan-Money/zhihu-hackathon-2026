"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { newClientActionId } from "@/lib/convex-client";
import { toPublicError } from "@/lib/convex-errors";
import type { TranscriptResultPublic } from "@/contracts/public";
import { Icon } from "./Icons";

interface RecordButtonProps {
  onTranscript: (result: TranscriptResultPublic) => void;
  onError: (error: { code: string; message: string }) => void;
  disabled?: boolean;
}

const MAX_SECONDS = 30;

/**
 * 录音按钮：MediaRecorder → POST /api/voice/transcriptions（同源 Route）。
 * 识别文本只回填输入框，由玩家确认后发送（source:"asr"）；失败保留键盘路径。
 */
export default function RecordButton({ onTranscript, onError, disabled }: RecordButtonProps) {
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(MAX_SECONDS);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { fetchAccessToken } = useConvexAuth();

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setCountdown(MAX_SECONDS);
  };

  const submit = async (blob: Blob) => {
    let token: string | null = null;
    try {
      token = await fetchAccessToken({ forceRefreshToken: false });
    } catch (err) {
      onError(toPublicError(err));
      return;
    }
    if (!token) {
      onError({ code: "AUTH_REQUIRED", message: "需要先建立会话身份" });
      return;
    }
    const form = new FormData();
    form.append("audio", blob, "question.webm");
    form.append("client_action_id", newClientActionId());
    try {
      const res = await fetch("/api/voice/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(toPublicError(data));
        return;
      }
      onTranscript(data as TranscriptResultPublic);
    } catch (err) {
      onError(toPublicError(err));
    }
  };

  const stop = () => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
  };

  const start = async () => {
    if (recording || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        cleanup();
        void submit(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setCountdown(MAX_SECONDS);
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            stop();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch {
      onError({ code: "VOICE_ASR_FAILED", message: "无法访问麦克风" });
      cleanup();
    }
  };

  useEffect(() => cleanup, []);

  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.06 }}
        onClick={recording ? stop : start}
        disabled={disabled}
        title={recording ? "停止并识别" : "按住说出你的问题（识别后需确认发送）"}
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink shadow-[var(--shadow-sticker-sm)] transition-colors disabled:opacity-40 ${
          recording ? "bg-coral text-paper" : "bg-teal text-ink"
        }`}
      >
        {recording ? (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-coral"
            animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
            transition={{ repeat: Infinity, duration: 1.1 }}
          />
        ) : null}
        <Icon name={recording ? "stop" : "mic"} size={18} filled={!recording} />
      </motion.button>
      {recording && (
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full border border-ink bg-paper px-2 py-0.5 text-[11px] font-black text-ink"
        >
          {countdown}s
        </motion.span>
      )}
    </div>
  );
}
