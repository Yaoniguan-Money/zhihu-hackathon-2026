import { ConvexError } from "convex/values";
import type { PrivateFailure } from "@contracts/private/index.js";
import type { PublicErrorCode } from "@contracts/public/index.js";

/**
 * 私有失败 × 操作上下文 → 公开错误（CONTRACTS 13.3）。
 * 本文件只含「建案 / 编译」上下文；角色回合与 Reveal 列在 TB4+ 加入。
 * 错误对象不含 retryable 等触发自动行为的标志。
 */

export type PublicErrorPayload = {
  code: PublicErrorCode;
  message: string;
};

export function throwPublicError(
  code: PublicErrorCode,
  message: string,
): never {
  throw new ConvexError({ code, message } satisfies PublicErrorPayload);
}

/** 建案 / 编译上下文的映射列（CONTRACTS 13.3 第一列）。 */
export function compileContextPublicError(
  failure: PrivateFailure,
): PublicErrorPayload {
  switch (failure.code) {
    case "INPUT_SCHEMA_INVALID":
      return { code: "INVALID_ARGUMENT", message: "请求参数不合法" };
    case "SOURCE_URL_INVALID":
    case "SOURCE_TEXT_EMPTY":
    case "SOURCE_PARSE_FAILED":
      return { code: "SOURCE_INVALID", message: "来源 URL 或正文无法解析" };
    case "SOURCE_TOO_LONG":
      return { code: "SOURCE_TOO_LONG", message: "正文超过长度上限" };
    case "AUTH_CONTEXT_MISSING":
      return { code: "AUTH_REQUIRED", message: "需要先建立会话身份" };
    case "INVITE_CODE_REJECTED":
      return { code: "CASE_CREATION_NOT_ALLOWED", message: "邀请码不可用" };
    case "CREATION_QUOTA_EXCEEDED":
      return { code: "RATE_LIMITED", message: "建案额度已用尽，请稍后再试" };
    case "SOURCE_SPAN_INVALID":
    case "NEW_FACT_INTRODUCED":
    case "MODEL_REQUEST_FAILED":
    case "MODEL_PROTOCOL_INVALID":
      return {
        code: "CASE_COMPILE_FAILED",
        message: "案件编译失败，该次建案未生效",
      };
    case "MODEL_CONFIG_MISSING":
      return {
        code: "SERVICE_NOT_CONFIGURED",
        message: "服务未配置，暂无法建案",
      };
    case "PRIVATE_PROJECTION_VIOLATION":
    case "INTERNAL_INVARIANT_VIOLATION":
      return {
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误，本次操作未生效",
      };
    default:
      // 建案/编译上下文不该出现的私有失败出现即内部不变量违规。
      return {
        code: "INTERNAL_INCIDENT",
        message: "服务内部错误，本次操作未生效",
      };
  }
}

export function throwCompileContextFailure(failure: PrivateFailure): never {
  const pub = compileContextPublicError(failure);
  throw new ConvexError(pub);
}

export function isConvexErrorPayload(
  data: unknown,
): data is PublicErrorPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  );
}
