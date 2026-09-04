import { z } from "zod";
import {
  roleCandidatePayloadPrivateSchema,
  validationResultPrivateSchema,
} from "@contracts/private/index.js";

/**
 * 版本化模型候选 schema（CONTRACTS 9.3）：
 * - 角色候选生成器（task=role）：role_candidate-v1@1
 * - Validator（task=validator）：role_validation-v1@1
 * Prompt 只在服务端组装（可含 Role Policy 等私有上下文），不进日志或文档。
 */

export const ROLE_CANDIDATE_SCHEMA_VERSION = "role_candidate-v1@1";
export const ROLE_VALIDATION_SCHEMA_VERSION = "role_validation-v1@1";

export const roleCandidateModelSchema = roleCandidatePayloadPrivateSchema;
export const roleValidationModelSchema = validationResultPrivateSchema;

export function roleGeneratorSystemPrompt(input: {
  displayName: string;
  goal: string;
  faithful: boolean;
}): string {
  return [
    `你是角色扮演引擎中的角色「${input.displayName}」。严格按该角色的立场发言。`,
    input.goal,
    input.faithful
      ? [
          "忠实性要求（faithful）：你的每句话都必须由「可见事实」直接支持；",
          "不得扩大范围、加强程度、删除条件、颠倒因果、拼贴时间或来源、省略上下文、偷换主语或概念、断章取义。",
          "support_claim_ids 只能引用给出的可见事实；没有支持的事实就不要说对应的话。",
        ].join("\n")
      : [
          "改写要求（distorted）：你只能使用「可见事实」中的材料，但按获准的篡改方式改变它们；",
          "不得引入可见事实之外的任何新实体、数字、时间、事件或来源。",
        ].join("\n"),
    "输出必须严格符合给定 JSON schema：speech（完整发言）、support_claim_ids、stance、emotion。",
    "stance 只能取：answer、deny、challenge、clarify、evade 之一。",
    "emotion 只能取：calm、uneasy、defensive、agitated 之一。",
    "除 JSON 外不要输出任何解释文字，不要添加任何额外字段。",
  ].join("\n");
}

export function roleGeneratorUserPrompt(input: {
  visibleClaims: { claim_id: string; proposition: string }[];
  history: string[];
  question: string;
  questionMode: string;
}): string {
  return [
    "可见事实（support_claim_ids 只能从中选择）：",
    ...input.visibleClaims.map(
      (claim) => `- ${claim.claim_id}: ${claim.proposition}`,
    ),
    "",
    "近期对话：",
    ...(input.history.length > 0 ? input.history : ["（尚无对话）"]),
    "",
    `玩家的问题（mode=${input.questionMode}）：${input.question}`,
    "",
    "请以该角色的身份给出回应。",
  ].join("\n");
}

export function validatorSystemPrompt(input: {
  faithful: boolean;
  allowedDistortionTypes: string[];
}): string {
  return [
    "你是事实校验器（Validator）。给定：可见事实、候选发言、候选声称的支持事实。",
    "任务：判断候选发言与可见事实之间的语义关系，输出严格符合 schema 的 JSON。",
    input.faithful
      ? "status=entailed 仅当候选的每个实质性断言都被所引可见事实直接支持且不改变原意。"
      : `status=distorted 仅当候选确实改变了事实关系且其改写方式全部属于允许的篡改类型：${input.allowedDistortionTypes.join(", ")}。`,
    "若候选引入了可见事实之外的新实体、数字、时间、事件或来源，用 unsupported_spans 标出候选文本中的对应片段（start/end 为候选 speech 的 UTF-16 偏移，text 为该片段原文）。",
    "detected_distortion_types 只能从以下取值：scope_expand, degree_strengthen, condition_delete, causal_swap, time_montage, source_splice, context_omit, subject_swap, concept_shift, cherry_pick。",
    "输出 JSON 必须包含全部字段：status、detected_distortion_types（数组，可为空）、unsupported_spans（数组，可为空）、referenced_claim_ids（候选发言实际涉及的可见事实 ID 数组，可为空数组）、confidence（0 到 1 的数值）。",
    "confidence 为 0 到 1 的数值。除 JSON 外不要输出任何解释文字，不要遗漏或新增字段。",
  ].join("\n");
}

export function validatorUserPrompt(input: {
  visibleClaims: { claim_id: string; proposition: string }[];
  speech: string;
  supportClaimIds: string[];
}): string {
  return [
    "可见事实：",
    ...input.visibleClaims.map(
      (claim) => `- ${claim.claim_id}: ${claim.proposition}`,
    ),
    "",
    `候选发言：${input.speech}`,
    `候选声称的支持事实：${input.supportClaimIds.join(", ") || "（无）"}`,
    "",
    "请输出校验结果。",
  ].join("\n");
}
