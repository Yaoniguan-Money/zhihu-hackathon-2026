import { z } from "zod";

/**
 * 版本化模型候选 schema（CONTRACTS 9.3）：Reveal 解释器 reveal-v1@1。
 * 正确性、分数、truth chain、altered links 由服务器确定；
 * 模型只产生解释与 Reality Mapping 候选（须引用真实 Claim ID）。
 */

export const REVEAL_SCHEMA_VERSION = "reveal-v1@1";

export const revealExplanationModelSchema = z.strictObject({
  explanation: z.string().min(1),
  reality_mapping: z.array(z.string().min(1)).min(1),
  referenced_claim_ids: z.array(z.string().min(1)).min(1),
});

export type RevealExplanationCandidate = z.infer<
  typeof revealExplanationModelSchema
>;

export function revealSystemPrompt(): string {
  return [
    "你是真相揭晓（Reveal）解释器。输入：标准答案（篡改角色、篡改类型、真相链）、玩家的指控与证据、相关可见事实原文。",
    "任务：写一段向玩家解释「谁篡改了什么、如何被改变」的说明，以及 Reality Mapping（把每个角色映射回文章的视角/立场）。",
    "explanation 要点明被改变的语义关系（范围、条件、因果等），不得引入事实之外的新断言。",
    "referenced_claim_ids 只能引用给出的事实 ID。",
    "输出必须严格符合 JSON schema：explanation（string）、reality_mapping（string 数组，每个角色一条）、referenced_claim_ids（string 数组）。",
    "除 JSON 外不要输出任何解释文字。",
  ].join("\n");
}

export function revealUserPrompt(input: {
  correctRoleId: string;
  distortionTypes: string[];
  truthChain: { claim_id: string; proposition: string }[];
  playerCorrect: boolean;
  accusedRoleId: string;
  accusedTypes: string[];
  evidenceTitles: string[];
  alteredLinks: { original: string; distorted: string; distortion_type: string }[];
}): string {
  return [
    `标准答案：篡改角色=${input.correctRoleId}；篡改类型=${input.distortionTypes.join("、")}。`,
    `玩家指控：角色=${input.accusedRoleId}；类型=${input.accusedTypes.join("、")}；判定=${input.playerCorrect ? "正确" : "不正确"}。`,
    `玩家引用的证据：${input.evidenceTitles.join("；") || "（无）"}`,
    "",
    "真相链（按顺序）：",
    ...input.truthChain.map(
      (entry) => `- ${entry.claim_id}: ${entry.proposition}`,
    ),
    "",
    "被改变的关系（原文 → 篡改后）：",
    ...(input.alteredLinks.length > 0
      ? input.alteredLinks.map(
          (link) => `- [${link.distortion_type}] ${link.original} ⇒ ${link.distorted}`,
        )
      : ["（无记录）"]),
    "",
    "请输出解释与 Reality Mapping。",
  ].join("\n");
}
