import { z } from "zod";

/**
 * contracts/shared — 不携带秘密的基础类型与运行时 schema。
 * 事实来源：docs/developer-a/CONTRACTS.md 第 1–3 节。
 * 未知字段、未知枚举和越界数值一律拒绝（strictObject / enum / 数值边界）。
 */

export type CaseId = string;
export type SessionId = string;
export type SourceId = string;
export type RoleId = string;
export type ClaimId = string;
export type MessageId = string;
export type EvidenceId = string;
export type RequestId = string;
export type EventId = string;
export type ClientActionId = string;
export type IsoDateTime = string;
export type Sha256Digest = `sha256:${string}`;

/** 服务端生成的不透明非空 ID；调用方不得解析其结构。 */
export const opaqueIdSchema = z.string().min(1);

export const caseIdSchema = opaqueIdSchema;
export const sessionIdSchema = opaqueIdSchema;
export const sourceIdSchema = opaqueIdSchema;
export const roleIdSchema = opaqueIdSchema;
export const claimIdSchema = opaqueIdSchema;
export const messageIdSchema = opaqueIdSchema;
export const evidenceIdSchema = opaqueIdSchema;
export const requestIdSchema = opaqueIdSchema;
export const eventIdSchema = opaqueIdSchema;

/** 调用方生成的 UUID；缺失、空白或非 UUID 直接 INVALID_ARGUMENT。 */
export const clientActionIdSchema = z.uuid();

/** 含时区的 RFC 3339 字符串。 */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** 小写十六进制、带 sha256: 前缀。 */
export const sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/);

export const DISTORTION_TYPES = [
  "scope_expand",
  "degree_strengthen",
  "condition_delete",
  "causal_swap",
  "time_montage",
  "source_splice",
  "context_omit",
  "subject_swap",
  "concept_shift",
  "cherry_pick",
] as const;

export type DistortionType = (typeof DISTORTION_TYPES)[number];
export const distortionTypeSchema = z.enum(DISTORTION_TYPES);

export const RELATION_TYPES = [
  "supports",
  "qualifies",
  "contradicts",
  "temporal_before",
  "temporal_after",
  "causal",
  "correlated",
  "source_of",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];
export const relationTypeSchema = z.enum(RELATION_TYPES);

export const sourceSpanSchema = z
  .strictObject({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    text: z.string().min(1),
    paragraph_index: z.number().int().min(0),
  })
  .refine((span) => span.start < span.end, {
    message: "span 必须满足 0 <= start < end",
  });

export type SourceSpan = z.infer<typeof sourceSpanSchema>;

/**
 * Span 不变量（CONTRACTS 3.2）：UTF-16 半开区间，且
 * text === canonical_text.slice(start, end)。
 * 不做“最相近文本”重定位；不匹配即无效。
 */
export function validateSourceSpan(
  canonicalText: string,
  span: SourceSpan,
): boolean {
  if (span.end > canonicalText.length) return false;
  return canonicalText.slice(span.start, span.end) === span.text;
}
