import { z } from "zod";
import { relationTypeSchema } from "@contracts/shared/index.js";

/**
 * 版本化模型候选 schema（CONTRACTS 9.3）：Claim Extractor v1。
 * 模型只能产生摘录与命题候选；可信 ID、Span 定位、关系端点、
 * confidence 与发布状态全部由服务器决定。
 * 摘录必须是所给段块中逐字、连续且唯一的片段（服务器据此定位 Span）。
 */

export const CLAIM_EXTRACTION_SCHEMA_VERSION = "claim-extraction-v1@1";

export const candidateClaimSchema = z.strictObject({
  paragraph_index: z.number().int().min(0),
  excerpt: z.string().min(1),
  proposition: z.string().min(1),
  subject: z.string().min(1).optional(),
  predicate: z.string().min(1).optional(),
  object: z.string().min(1).optional(),
  time: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  modality: z.string().min(1).optional(),
});

export const candidateClaimGraphSchema = z.strictObject({
  claims: z.array(candidateClaimSchema).min(1),
  relations: z.array(
    z.strictObject({
      from_claim_index: z.number().int().min(0),
      to_claim_index: z.number().int().min(0),
      type: relationTypeSchema,
    }),
  ),
});

export type CandidateClaimGraph = z.infer<typeof candidateClaimGraphSchema>;

export function claimExtractionSystemPrompt(): string {
  return [
    "你是证据图谱抽取器。输入是一篇带段块编号的 Canonical Source。",
    "任务：抽取最小可验证命题（claims）与命题之间的语义关系（relations）。",
    "规则：",
    "1. excerpt 必须是所给段块内逐字、连续、唯一的原文片段；禁止改写、摘要或跨段块拼接。",
    "2. paragraph_index 必须是 excerpt 所在段块的编号（从 0 开始）。",
    "3. proposition 用一句中文陈述该命题；作者观点需保留归属（如“文章认为”）。",
    "4. relations 使用 from_claim_index/to_claim_index 引用 claims 数组下标，type 只能取：supports, qualifies, contradicts, temporal_before, temporal_after, causal, correlated, source_of。",
    "5. 只输出符合给定 JSON schema 的对象；不要输出任何解释文字。",
  ].join("\n");
}

export function claimExtractionUserPrompt(paragraphs: {
  numberedParagraphs: string[];
}): string {
  return [
    `Canonical Source 共 ${paragraphs.numberedParagraphs.length} 个段块：`,
    ...paragraphs.numberedParagraphs.map((text, index) => `[${index}] ${text}`),
    "",
    "请抽取 claims 与 relations。",
  ].join("\n");
}
