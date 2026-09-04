/**
 * 幂等键与载荷哈希（CONTRACTS 第 12 节）。
 * 处理顺序：操作规定的内容规范化 → RFC 8785 canonical JSON → SHA-256。
 * `client_action_id` 不进入载荷哈希。
 *
 * 建案载荷仅由字符串字段组成（source_url / source_text / theme / invite_code），
 * 本模块实现该 JSON 子集的 JCS 规则：按键的 UTF-16 码元排序、
 * JSON.stringify 转义（ES2019+ 对孤立代理项做 \uXXXX 转义）、无数字序列化分歧。
 */

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(
    `canonicalJson 仅支持建案载荷的 JSON 子集，遇到不支持的类型: ${typeof value}`,
  );
}

import { sha256Hex } from "./hash.js";
import { normalizeSourceText } from "@server/source/normalize.js";

export { sha256Hex };

/** 幂等键第 1 段：操作名固定，防止跨操作复用同一 client_action_id。 */
export const OPERATION_CREATE_FROM_SOURCE = "cases.createFromSource";

export async function payloadHashForCreateFromSource(payload: {
  source_url: string;
  source_text: string;
  theme?: string | null;
  invite_code: string;
}): Promise<string> {
  // 操作规定的内容规范化先于哈希（CONTRACTS 12）：正文按 3.1 规范化，
  // 规范化幂等，重复调用安全。
  return sha256Hex(
    canonicalJson({
      ...payload,
      source_text: normalizeSourceText(payload.source_text),
    }),
  );
}
