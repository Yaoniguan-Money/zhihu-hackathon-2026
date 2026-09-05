"use client";

import type { PublicError } from "@/contracts/public";

/**
 * Convex 服务端以 ConvexError({ code, message }) 抛出 Public Error（CONTRACTS 13）。
 * 客户端统一在此归一化：不猜测、不重试、不吞掉；解析不出结构时原样包装展示。
 */
export function toPublicError(error: unknown): PublicError {
  const data =
    error && typeof error === "object" && "data" in error
      ? (error as { data: unknown }).data
      : undefined;

  if (
    data &&
    typeof data === "object" &&
    "code" in data &&
    "message" in data &&
    typeof (data as { code: unknown }).code === "string" &&
    typeof (data as { message: unknown }).message === "string"
  ) {
    return {
      code: (data as { code: string }).code as PublicError["code"],
      message: (data as { message: string }).message,
    };
  }

  return {
    code: "SERVICE_UNAVAILABLE",
    message:
      error instanceof Error
        ? error.message
        : "网络或服务不可用，请检查连接后重试",
  };
}

/** 面向玩家的错误码 → 可采取动作提示（不泄露任何私有原因）。 */
export function errorCodeHint(code: PublicError["code"]): string {
  switch (code) {
    case "ROLE_TURN_BUSY":
      return "该案件正在回应另一个问题，等当前回应结束后再操作。";
    case "ROLE_TURN_FAILED":
      return "这条回应失败了，可以换一种问法重新提问。";
    case "BOARD_REVISION_CONFLICT":
      return "证据板在别处被修改过，刷新后重新调整再保存。";
    case "EVIDENCE_UNAVAILABLE":
      return "这条证据不可用或尚未解锁。";
    case "SESSION_PHASE_CONFLICT":
      return "当前阶段不允许这个操作。";
    case "VOICE_ASR_FAILED":
    case "VOICE_TTS_FAILED":
    case "VOICE_NO_SPEECH":
    case "VOICE_AUDIO_TOO_LONG":
      return "语音服务不可用，可以继续使用键盘输入。";
    case "SERVICE_NOT_CONFIGURED":
      return "服务端尚未配置模型，暂时无法进行该操作。";
    case "RATE_LIMITED":
      return "次数已达上限，请稍后再试。";
    case "AUTH_REQUIRED":
      return "身份建立失败，请刷新页面重试。";
    default:
      return "请稍后重试，或返回首页重新开始。";
  }
}
