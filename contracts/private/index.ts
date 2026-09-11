import { z } from "zod";
import {
  claimIdSchema,
  distortionTypeSchema,
  evidenceIdSchema,
  messageIdSchema,
  relationTypeSchema,
  requestIdSchema,
  roleIdSchema,
  sha256DigestSchema,
  sourceIdSchema,
  caseIdSchema,
  sourceSpanSchema,
  isoDateTimeSchema,
  eventIdSchema,
} from "../shared/index";
import {
  evidenceTypeSchema,
  questionModeSchema,
  questionSourceSchema,
  roleEmotionSchema,
  roleProsodySchema,
  roleStanceSchema,
} from "../public/index";

/**
 * contracts/private — 只允许 Convex internal functions、AI Orchestrator、
 * Validator、GM 与 Voice 实现导入。事实来源：CONTRACTS.md 第 4.1、4.2、6、8.2、9、13.2、14 节。
 */

// ---------------------------------------------------------------------------
// Evidence Graph（4.1）

export const claimPrivateSchema = z.strictObject({
  claim_id: claimIdSchema,
  proposition: z.string().min(1),
  subject: z.string().min(1).optional(),
  predicate: z.string().min(1).optional(),
  object: z.string().min(1).optional(),
  time: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  modality: z.string().min(1).optional(),
  source_span: sourceSpanSchema,
  source_ref: sourceIdSchema,
  confidence: z.number().min(0).max(1),
});

export type ClaimPrivate = z.infer<typeof claimPrivateSchema>;

export const claimRelationPrivateSchema = z
  .strictObject({
    relation_id: z.string().min(1),
    from_claim_id: claimIdSchema,
    to_claim_id: claimIdSchema,
    type: relationTypeSchema,
  })
  .refine((relation) => relation.from_claim_id !== relation.to_claim_id, {
    message: "Relation 端点不得自指",
  });

export type ClaimRelationPrivate = z.infer<typeof claimRelationPrivateSchema>;

export const evidenceGraphPrivateSchema = z.strictObject({
  case_id: caseIdSchema,
  source_id: sourceIdSchema,
  claims: z.array(claimPrivateSchema),
  relations: z.array(claimRelationPrivateSchema),
});

export type EvidenceGraphPrivate = z.infer<typeof evidenceGraphPrivateSchema>;

/** 图谱不变量：Claim ID 案件内唯一；每条 Relation 端点存在且不自指（自指已由 schema 拒绝）。 */
export function assertEvidenceGraphInvariants(
  graph: EvidenceGraphPrivate,
): void {
  const claimIds = new Set(graph.claims.map((claim) => claim.claim_id));
  if (claimIds.size !== graph.claims.length) {
    throw new Error("Claim ID 在案件内不唯一");
  }
  for (const relation of graph.relations) {
    if (!claimIds.has(relation.from_claim_id)) {
      throw new Error(`Relation 端点不存在: ${relation.from_claim_id}`);
    }
    if (!claimIds.has(relation.to_claim_id)) {
      throw new Error(`Relation 端点不存在: ${relation.to_claim_id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Case Private（4.2 / 6）

export const fidelitySchema = z.enum(["faithful", "distorted"]);
export type Fidelity = z.infer<typeof fidelitySchema>;

export const rolePrivatePolicySchema = z.strictObject({
  role_id: roleIdSchema,
  fidelity: fidelitySchema,
  visible_claim_ids: z.array(claimIdSchema),
  goal: z.string().min(1),
  allowed_distortion_types: z.array(distortionTypeSchema),
});

export type RolePrivatePolicy = z.infer<typeof rolePrivatePolicySchema>;

export const goldenAnswerPrivateSchema = z.strictObject({
  distortion_owner_role_id: roleIdSchema,
  answer_distortion_types: z.array(distortionTypeSchema).min(1),
  truth_claim_ids: z.array(claimIdSchema).min(1),
});

export type GoldenAnswerPrivate = z.infer<typeof goldenAnswerPrivateSchema>;

export const evidenceUnlockRulePrivateSchema = z.strictObject({
  rule_id: z.string().min(1),
  evidence_id: evidenceIdSchema,
  required_claim_ids: z.array(claimIdSchema),
  allowed_role_ids: z.array(roleIdSchema),
});

export type EvidenceUnlockRulePrivate = z.infer<
  typeof evidenceUnlockRulePrivateSchema
>;

export const evidenceCatalogItemPrivateSchema = z.strictObject({
  evidence_id: evidenceIdSchema,
  type: evidenceTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  public_claim_refs: z.array(claimIdSchema),
  conflicts_with: z.array(evidenceIdSchema),
});

export type EvidenceCatalogItemPrivate = z.infer<
  typeof evidenceCatalogItemPrivateSchema
>;

export const casePrivateSchema = z.strictObject({
  case_id: caseIdSchema,
  graph: evidenceGraphPrivateSchema,
  role_policies: z.array(rolePrivatePolicySchema).length(5),
  golden_answer: goldenAnswerPrivateSchema,
  evidence_catalog: z.array(evidenceCatalogItemPrivateSchema),
  evidence_unlock_rules: z.array(evidenceUnlockRulePrivateSchema),
});

export type CasePrivate = z.infer<typeof casePrivateSchema>;

/**
 * 可玩案件不变量（CONTRACTS 4.2）。任一失败抛错，调用方必须将整个编译判为失败。
 */
export function assertPlayableCaseInvariants(casePrivate: CasePrivate): void {
  assertEvidenceGraphInvariants(casePrivate.graph);

  const claimIds = new Set(
    casePrivate.graph.claims.map((claim) => claim.claim_id),
  );
  const policyRoleIds = casePrivate.role_policies.map(
    (policy) => policy.role_id,
  );
  if (new Set(policyRoleIds).size !== policyRoleIds.length) {
    throw new Error("Role Policy 的 role_id 不唯一");
  }

  const faithful = casePrivate.role_policies.filter(
    (policy) => policy.fidelity === "faithful",
  );
  const distorted = casePrivate.role_policies.filter(
    (policy) => policy.fidelity === "distorted",
  );
  if (faithful.length !== 4 || distorted.length !== 1) {
    throw new Error("案件必须恰有四个 faithful 与一个 distorted Role");
  }

  for (const policy of faithful) {
    if (policy.allowed_distortion_types.length !== 0) {
      throw new Error("Faithful Role 的获准 Distortion Type 集合必须为空");
    }
  }

  const distortedPolicy = distorted[0];
  if (distortedPolicy.allowed_distortion_types.length === 0) {
    throw new Error("Distorted Role 的获准集合必须非空");
  }
  if (
    casePrivate.golden_answer.distortion_owner_role_id !==
    distortedPolicy.role_id
  ) {
    throw new Error("答案归属必须是 Distorted Role");
  }
  const allowedSet = new Set(distortedPolicy.allowed_distortion_types);
  for (const answerType of casePrivate.golden_answer.answer_distortion_types) {
    if (!allowedSet.has(answerType)) {
      throw new Error("answer_distortion_types 必须是获准集合的子集");
    }
  }

  const catalogIds = new Set(
    casePrivate.evidence_catalog.map((item) => item.evidence_id),
  );
  if (catalogIds.size !== casePrivate.evidence_catalog.length) {
    throw new Error("Evidence Catalog 条目不唯一");
  }
  for (const rule of casePrivate.evidence_unlock_rules) {
    if (!catalogIds.has(rule.evidence_id)) {
      throw new Error("Unlock Rule 引用了 Catalog 之外的 Evidence");
    }
  }
  for (const item of casePrivate.evidence_catalog) {
    for (const claimId of item.public_claim_refs) {
      if (!claimIds.has(claimId)) {
        throw new Error(`Catalog 条目引用了不存在的 Claim: ${claimId}`);
      }
    }
    for (const evidenceId of item.conflicts_with) {
      if (!catalogIds.has(evidenceId)) {
        throw new Error(`Catalog 冲突引用不存在条目: ${evidenceId}`);
      }
    }
  }
  for (const policy of casePrivate.role_policies) {
    for (const claimId of policy.visible_claim_ids) {
      if (!claimIds.has(claimId)) {
        throw new Error(`可见 Claim 不属于当前案件: ${claimId}`);
      }
    }
  }
  for (const claimId of casePrivate.golden_answer.truth_claim_ids) {
    if (!claimIds.has(claimId)) {
      throw new Error(`Truth Claim 不属于当前案件: ${claimId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 私有段落（3.3）

export const canonicalParagraphPrivateSchema = z
  .strictObject({
    paragraph_index: z.number().int().min(0),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    is_quote: z.boolean(),
  })
  .refine((paragraph) => paragraph.start < paragraph.end, {
    message: "段落区间必须满足 start < end",
  });

export type CanonicalParagraphPrivate = z.infer<
  typeof canonicalParagraphPrivateSchema
>;

// ---------------------------------------------------------------------------
// 候选、Validator 与批准信封（9）

/**
 * 模型输出面 schema：z.object（剥离未知字段）而非 strictObject——
 * 模型偶发附带解释/注释类多余键不应整份候选作废（2026-09-11 实测
 * NoObjectGeneratedError 主因）；语义字段（枚举/必填/长度）照旧严格，
 * 存证与传输类 schema 仍为 strictObject。
 */
export const roleCandidatePayloadPrivateSchema = z.object({
  speech: z.string().min(1),
  support_claim_ids: z.array(claimIdSchema),
  stance: roleStanceSchema,
  emotion: roleEmotionSchema,
  target_role_id: roleIdSchema.optional(),
  rebuttal_to_message_id: messageIdSchema.optional(),
  prosody: roleProsodySchema.optional(),
});

export type RoleCandidatePayloadPrivate = z.infer<
  typeof roleCandidatePayloadPrivateSchema
>;

export const candidateTextSpanPrivateSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    text: z.string().min(1),
  })
  .refine((span) => span.start < span.end, {
    message: "候选文本区间必须满足 start < end",
  });

export type CandidateTextSpanPrivate = z.infer<
  typeof candidateTextSpanPrivateSchema
>;

export const validationResultPrivateSchema = z.object({
  status: z.enum(["entailed", "distorted", "invalid"]),
  detected_distortion_types: z.array(distortionTypeSchema),
  unsupported_spans: z.array(candidateTextSpanPrivateSchema),
  referenced_claim_ids: z.array(claimIdSchema),
  confidence: z.number().min(0).max(1),
});

export type ValidationResultPrivate = z.infer<
  typeof validationResultPrivateSchema
>;

export const validationAttemptPrivateSchema = z.strictObject({
  validation_id: z.string().min(1),
  request_id: requestIdSchema,
  attempt_index: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
  ]),
  candidate: roleCandidatePayloadPrivateSchema,
  result: validationResultPrivateSchema,
  created_at: isoDateTimeSchema,
});

export type ValidationAttemptPrivate = z.infer<
  typeof validationAttemptPrivateSchema
>;

export const approvedSpeechEnvelopePrivateSchema = z.strictObject({
  request_id: requestIdSchema,
  message_id: messageIdSchema,
  role_id: roleIdSchema,
  exact_text: z.string().min(1),
  exact_text_sha256: sha256DigestSchema,
  support_claim_ids: z.array(claimIdSchema),
  validation_id: z.string().min(1),
  voice_id: z.string().min(1),
  prosody: roleProsodySchema.optional(),
});

export type ApprovedSpeechEnvelopePrivate = z.infer<
  typeof approvedSpeechEnvelopePrivateSchema
>;

// ---------------------------------------------------------------------------
// 私有 Turn Intent（8.2）— role_confrontation 已删除；P1 对质仅由 presentRecording 触发。

export const turnIntentPrivateSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("player_question"),
    question_message_id: messageIdSchema,
    target_role_id: roleIdSchema,
    mode: questionModeSchema,
    source: questionSourceSchema,
  }),
  z.strictObject({
    kind: z.literal("recording_presented"),
    evidence_id: evidenceIdSchema,
    target_role_id: roleIdSchema,
  }),
  z.strictObject({
    kind: z.literal("opening_statement"),
    role_id: roleIdSchema,
    trigger_event_id: eventIdSchema,
  }),
]);

export type TurnIntentPrivate = z.infer<typeof turnIntentPrivateSchema>;

// ---------------------------------------------------------------------------
// Evidence 解锁决策（6）

export const evidenceUnlockDecisionPrivateSchema = z.strictObject({
  rule_ids: z.array(z.string().min(1)),
  approved_evidence_ids: z.array(evidenceIdSchema),
  rejected_evidence_ids: z.array(evidenceIdSchema),
});

export type EvidenceUnlockDecisionPrivate = z.infer<
  typeof evidenceUnlockDecisionPrivateSchema
>;

// ---------------------------------------------------------------------------
// 私有失败（13.2）

export const privateFailureCodeSchema = z.enum([
  "INPUT_SCHEMA_INVALID",
  "AUTH_CONTEXT_MISSING",
  "INVITE_CODE_REJECTED",
  "CREATION_QUOTA_EXCEEDED",
  "SOURCE_URL_INVALID",
  "SOURCE_TEXT_EMPTY",
  "SOURCE_TOO_LONG",
  "SOURCE_PARSE_FAILED",
  "SOURCE_SPAN_INVALID",
  "CASE_INVARIANT_FAILED",
  "MODEL_CONFIG_MISSING",
  "MODEL_REQUEST_FAILED",
  "MODEL_PROTOCOL_INVALID",
  "VALIDATOR_REQUEST_FAILED",
  "VALIDATOR_PROTOCOL_INVALID",
  "VALIDATION_EXHAUSTED",
  "DISTORTION_POLICY_VIOLATION",
  "NEW_FACT_INTRODUCED",
  "PRIVATE_PROJECTION_VIOLATION",
  "TURN_LEASE_EXPIRED",
  "REVEAL_JUDGE_FAILED",
  "ASR_PROVIDER_FAILED",
  "TTS_PROVIDER_FAILED",
  "INTERNAL_INVARIANT_VIOLATION",
]);

export type PrivateFailureCode = z.infer<typeof privateFailureCodeSchema>;

/** 带脱敏 incident 关联的私有失败；错误对象不含 retryable 等触发自动行为的标志。 */
export interface PrivateFailure {
  code: PrivateFailureCode;
  incident_id: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Voice 私有输入/输出（14）

export const supportedAudioMimeTypeSchema = z.enum([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
]);

export type SupportedAudioMimeType = z.infer<
  typeof supportedAudioMimeTypeSchema
>;

export const asrInputPrivateSchema = z.strictObject({
  audio: z.instanceof(Uint8Array),
  mime_type: supportedAudioMimeTypeSchema,
  language: z.literal("zh"),
});

export type AsrInputPrivate = z.infer<typeof asrInputPrivateSchema>;

export const synthesizedAudioPrivateSchema = z.strictObject({
  bytes: z.instanceof(Uint8Array),
  mime_type: z.literal("audio/wav"),
  content_sha256: sha256DigestSchema,
  duration_ms: z.number().int().min(0),
});

export type SynthesizedAudioPrivate = z.infer<
  typeof synthesizedAudioPrivateSchema
>;

export const ttsInputPrivateSchema = z.strictObject({
  approved_speech: approvedSpeechEnvelopePrivateSchema,
});

export type TtsInputPrivate = z.infer<typeof ttsInputPrivateSchema>;
