import { z } from "zod";
import {
  distortionTypeSchema,
} from "@contracts/shared/index.js";
import { evidenceTypeSchema } from "@contracts/public/index.js";

/**
 * 版本化模型候选 schema（CONTRACTS 9.3）：Case Compiler v1。
 * 模型只产生角色内容、Catalog 条目内容与「下标引用」形式的失真方案候选；
 * 可信 ID（role/ev/crit）、voice、4+1 结构、答案子集关系、unlock rule、
 * rubric 权重与发布状态全部由服务器决定（server/cases/compile-case.ts）。
 * 所有下标引用指向输入中编号的 claims / catalog 下标，越界由服务器判编译失败。
 */

export const CASE_COMPILATION_SCHEMA_VERSION = "case-compilation-v1@1";

export const candidateRolePersonaSchema = z.strictObject({
  display_name: z.string().min(1).max(40),
  public_bio: z.string().min(1).max(200),
  persona_key: z.string().min(1).max(60),
});

export const candidateCatalogItemSchema = z.strictObject({
  type: evidenceTypeSchema,
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(400),
  claim_indices: z.array(z.number().int().min(0)).min(1),
  conflict_indices: z.array(z.number().int().min(0)).default([]),
});

export const candidateCaseCompilationSchema = z.strictObject({
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(500),
  theme: z.string().min(1).max(40),
  roles: z.array(candidateRolePersonaSchema).length(5),
  evidence_catalog: z.array(candidateCatalogItemSchema).min(2).max(12),
  distortion_plan: z.strictObject({
    distorted_role_index: z.number().int().min(0).max(4),
    allowed_distortion_types: z.array(distortionTypeSchema).min(1),
    answer_distortion_types: z.array(distortionTypeSchema).min(1),
    distorted_goal: z.string().min(1).max(300),
    truth_claim_indices: z.array(z.number().int().min(0)).min(1),
    visible_claim_indices: z
      .array(z.array(z.number().int().min(0)))
      .length(5),
  }),
});

export type CandidateCaseCompilation = z.infer<
  typeof candidateCaseCompilationSchema
>;

export function caseCompilationSystemPrompt(): string {
  return [
    "你是案件编译器。输入是一份已抽取的带编号 Claim 列表（含原文摘录）。",
    "任务：把它们编排成一个五角色「证据链狼人杀」案件。",
    "规则：",
    "1. roles 恰好 5 个：身份立场互异、贴合材料主题；display_name 用「名字 · 身份」格式。",
    "2. evidence_catalog（2-12 条）：每个条目必须包含全部必填字段 type、title、body、claim_indices（conflict_indices 可省略，其余字段禁止省略）；type 只能取 quote/claim/source/timeline/contradiction；body 是玩家可见的证据文字，必须完全来自所引 claims 的原文内容，禁止引入新事实；claim_indices 引用 claims 数组下标；conflict_indices（若提供）引用与其语义冲突的其它 catalog 条目下标。",
    "3. distortion_plan：恰有 1 名失真角色（distorted_role_index）。",
    "   - 篡改方式（DistortionType）只能取以下 10 个 ID，禁止自造：scope_expand, degree_strengthen, condition_delete, causal_swap, time_montage, source_splice, context_omit, subject_swap, concept_shift, cherry_pick。",
    "   - allowed_distortion_types 是该角色获准的篡改方式（非空，只能从上述 10 个 ID 中选取）。",
    "   - answer_distortion_types 是标准答案（非空，且每一项都必须 ⊆ allowed_distortion_types）。",
    "   - truth_claim_indices 是未被动摇、构成事实链的原文 Claim 下标。",
    "   - visible_claim_indices 给每个角色（按 roles 顺序）分配可见 Claim 下标；失真角色的可见集必须覆盖它要篡改的材料；每个角色的集合非空。",
    "   - distorted_goal 用一句话描述失真角色的私下目标（仅供服务器与该角色 Prompt 使用）。",
    "4. 所有 body/title/summary 不得泄露谁是失真角色，也不得出现「篡改」「失真」等提示。",
    "5. 只输出符合给定 JSON schema 的对象；不要输出任何解释文字。",
    "字段完整性清单（缺任何必填字段即为无效输出）：",
    "- roles[i] 必须同时包含：display_name、public_bio、persona_key（共 5 个角色）。",
    "- evidence_catalog[i] 必须同时包含：type、title、body、claim_indices（conflict_indices 可省略）。",
    "- distortion_plan 必须同时包含：distorted_role_index、allowed_distortion_types、answer_distortion_types、distorted_goal、truth_claim_indices、visible_claim_indices（5 个子数组，与 roles 一一对应）。",
    "- 顶层必须同时包含：title、summary、theme、roles、evidence_catalog、distortion_plan。",
    "- 所有字符串字段禁止为空字符串；可选字段若无需表达则整体省略键名。",
  ].join("\n");
}

export function caseCompilationUserPrompt(claims: {
  claims: { proposition: string; excerpt: string }[];
  relations: { from_claim_index: number; to_claim_index: number; type: string }[];
}): string {
  return [
    `Canonical Source 已抽取 ${claims.claims.length} 个 Claim：`,
    ...claims.claims.map(
      (claim, index) => `[${index}] 命题：${claim.proposition}｜原文：${claim.excerpt}`,
    ),
    "",
    "Claim 间关系：",
    ...claims.relations.map(
      (relation) =>
        `[${relation.from_claim_index}] --${relation.type}--> [${relation.to_claim_index}]`,
    ),
    "",
    "请编译五角色案件。",
  ].join("\n");
}
