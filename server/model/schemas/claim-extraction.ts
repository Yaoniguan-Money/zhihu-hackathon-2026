import { z } from "zod";
import { relationTypeSchema } from "@contracts/shared/index.js";

/**
 * 版本化模型候选 schema（CONTRACTS 9.3）：Claim Extractor v1。
 * 模型只能产生摘录与命题候选；可信 ID、Span 定位、关系端点、
 * confidence 与发布状态全部由服务器决定。
 * 摘录必须是所给段块中逐字、连续且唯一的片段（服务器据此定位 Span）。
 */

export const CLAIM_EXTRACTION_SCHEMA_VERSION = "claim-extraction-v1@3";

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
    "excerpt 的唯一合法生成方式：先在某个段块文本中定位原文位置，然后逐字符复制该处的一个连续片段。禁止凭印象重构原文，禁止改写、摘要、压缩、归纳、合并、翻译、纠正或增删任何字符（包括标点、引号、全角半角、括号、序号）。",
    "宁可少抽：如果一个命题找不到可逐字复制的原文片段，直接放弃该命题；输出与原文不完全一致的摘录是最高优先级的错误。",
    "规则：",
    "1. excerpt 必须是所给段块内逐字、连续、唯一的原文片段；禁止改写、摘要或跨段块拼接。",
    "2. excerpt 长度至少 10 个字符；若短语在段块内出现多次，扩展摘录上下文使其在该段块内只出现一次。",
    "3. excerpt 的标点、引号必须与段块原文逐字符一致（原文用什么样的引号就复制什么样的引号），禁止把原文标点替换成其他形态。",
    "4. paragraph_index 必须是 excerpt 所在段块的编号（从 0 开始）。标题段块只能摘录标题本身的文字；禁止为标题段块编造它不包含的正文，也不要把相邻段块的内容算进标题段块。",
    "5. proposition 用一句中文陈述该命题；作者观点需保留归属（如“文章认为”）。",
    "6. relations 使用 from_claim_index/to_claim_index 引用 claims 数组下标，type 只能取：supports, qualifies, contradicts, temporal_before, temporal_after, causal, correlated, source_of。两个下标都必须指向 claims 数组中真实存在的条目（0 ≤ 下标 < claims 长度）。",
    "7. 每个 claim / relation 对象只允许包含规定字段（claim: paragraph_index, excerpt, proposition, subject, predicate, object, time, scope, condition, modality；relation: from_claim_index, to_claim_index, type）；禁止添加 id、note 等任何额外字段；可选字段（subject/predicate/object/time/scope/condition/modality）无内容时必须直接省略，禁止输出空字符串。",
    "8. 输出前逐条核对：每个 excerpt 都能在其 paragraph_index 段块中找到且只找到一次；核对不通过的条目先修正（或放弃）再输出。",
    "9. 只输出符合给定 JSON schema 的对象；不要输出任何解释文字。",
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
