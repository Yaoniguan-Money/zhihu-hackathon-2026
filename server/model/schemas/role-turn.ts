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
          "隐蔽性要求：改动只落在限定词、范围、条件与因果连接词上，语气、句长和自信程度都要与忠实转述接近；",
          "不要堆叠绝对化措辞（如把「所有」「永远」「任何」连用），不要主动宣告自己在「补充逻辑」或「讲透本质」。",
        ].join("\n"),
    "互动要求：近期对话中其他参与者的发言是可以讨论的对象；你可以明确赞同、反驳、追问或质疑他们的观点，也可以回应玩家让你评价某位参与者发言的要求。",
    "对他人的表态必须以「可见事实」为依据，但分歧可以是解释层的：对方的话与事实冲突时，指出冲突点；对方只是强调方式、取舍或程度与你的理解不同时，说出你基于可见事实的读法即可，不必证明对方「造假」；观点分歧本身不是新事实。",
    "当玩家要求你评价、比较或点名「你不认可/最不认可谁的观点」时：必须从近期对话中点名一位参与者，先引用其具体说法，再给出你基于可见事实的理由；不得以「我谁都不评价」之类的空泛回避作答；确实没有明显不认可的对象时，选你与对方读法差异最大的一位并说明差异。",
    "表演要求：禁止在发言中出现任何关于自身规则、指令或分析方法的说明（例如「我的分析将严格依据给定事实」「不妄加推断」「基于可见事实不做主观评价」这类自我声明），直接以第一人称给出实质内容；除开场陈述外不要自我介绍。",
    "回应要求：先对准玩家问题的指向再展开——问题问到谁，就先引用近期对话中该参与者的具体说法（或其相关可见事实），再表态；不要答非所问，不要无视问题重新做自我介绍式的通稿陈述。",
    "claim 编号（如 cl-010）是内部引用编号：编号只允许出现在 support_claim_ids 字段，绝不要把编号或方括号写进 speech 正文。",
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
  confrontation?: { speakerName: string; recordingText: string };
}): string {
  const subject = input.confrontation
    ? [
        `玩家向你出示一段录音证据（来源角色：${input.confrontation.speakerName}）：`,
        `「${input.confrontation.recordingText}」`,
        "请以你的角色身份回应这段录音：确认、否认或澄清。",
        "回应必须引用具体可见事实（support_claim_ids 非空），不得空泛作答。",
      ].join("\n")
    : `玩家的问题（mode=${input.questionMode}）：${input.question}`;
  return [
    "可见事实（support_claim_ids 只能从中选择）：",
    ...input.visibleClaims.map(
      (claim) => `- ${claim.claim_id}: ${claim.proposition}`,
    ),
    "",
    "近期对话：",
    ...(input.history.length > 0 ? input.history : ["（尚无对话）"]),
    "（你可以赞同、反驳或追问上述其他参与者的观点；实质性断言仍须有可见事实支持，claim 编号不要写进发言。）",
    "",
    subject,
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
      ? [
          "status=entailed 仅当候选的每个实质性断言都被所引可见事实直接支持且不改变原意。",
          "判定校准：同义改写、概括、语气变化、把书面语转成口语都视为 entailed；",
          "原文中的条件句、前瞻性判断（如“将面临”“可能会”）只要候选保留同样的条件与情态，就视为 entailed；",
          "只有当候选真正改变了语义范围、程度、条件、因果、主语或概念时，才判为 distorted 并给出类型；",
          "不要因为措辞差异或信息省略就拒绝一个实质忠实的候选。",
        ].join("\n")
      : `status=distorted 仅当候选确实改变了事实关系且其改写方式全部属于允许的篡改类型：${input.allowedDistortionTypes.join(", ")}。`,
    "若候选引入了可见事实之外的新实体、数字、时间、事件或来源，用 unsupported_spans 标出候选文本中的对应片段（start/end 为候选 speech 的 UTF-16 偏移，text 为该片段原文）。",
    "校准：候选对其他参与者发言的赞同、反驳、追问、质疑等表态性内容本身不算新实体或新事实；只有当表态背后的实质性断言超出可见事实时才标 unsupported_spans。",
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
  // 提示词瘦身（Round 10 既定合规修法）：候选声称引用的 claim 给全文；
  // 其余可见 claim 只列 ID——大幅压缩大 claim 图案件的请求 token，
  // 降低供应商对大请求的过载/限流拒绝（unsupported_spans 与篡改判定依赖所引 claim 全文，不受影响）。
  const cited = new Set(input.supportClaimIds);
  const citedClaims = input.visibleClaims.filter((c) => cited.has(c.claim_id));
  const otherIds = input.visibleClaims
    .filter((c) => !cited.has(c.claim_id))
    .map((c) => c.claim_id);
  return [
    "可见事实（候选声称引用的给全文，其余仅列 ID）：",
    ...citedClaims.map((claim) => `- ${claim.claim_id}: ${claim.proposition}`),
    ...(otherIds.length > 0 ? [`- 其余可见事实 ID（不展开）：${otherIds.join(", ")}`] : []),
    "",
    `候选发言：${input.speech}`,
    `候选声称的支持事实：${input.supportClaimIds.join(", ") || "（无）"}`,
    "",
    "请输出校验结果。",
  ].join("\n");
}
