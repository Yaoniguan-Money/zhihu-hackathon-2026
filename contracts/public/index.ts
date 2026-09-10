import { z } from "zod";
import {
  caseIdSchema,
  claimIdSchema,
  clientActionIdSchema,
  distortionTypeSchema,
  evidenceIdSchema,
  eventIdSchema,
  isoDateTimeSchema,
  messageIdSchema,
  requestIdSchema,
  roleIdSchema,
  sessionIdSchema,
  sha256DigestSchema,
  sourceIdSchema,
} from "../shared/index";

/**
 * contracts/public — Browser、B 端页面和 XState 唯一可以导入的类型。
 * 事实来源：docs/developer-a/CONTRACTS.md 第 4.2、4.4、5、6、7、8.1、10、13.1、14 节。
 * 禁止出现 fidelity、可见/支持 Claim、Role Policy、Validator 结果、Prompt、候选。
 */

// ---------------------------------------------------------------------------
// 公共错误（13.1）

export const publicErrorCodeSchema = z.enum([
  "INVALID_ARGUMENT",
  "AUTH_REQUIRED",
  "CASE_CREATION_NOT_ALLOWED",
  "RATE_LIMITED",
  "SOURCE_TOO_LONG",
  "SOURCE_INVALID",
  "CASE_NOT_FOUND",
  "CASE_NOT_READY",
  "CASE_COMPILE_FAILED",
  "SESSION_NOT_FOUND",
  "ROLE_NOT_FOUND",
  "SESSION_PHASE_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "ROLE_TURN_BUSY",
  "EVIDENCE_UNAVAILABLE",
  "BOARD_REVISION_CONFLICT",
  "ROLE_TURN_FAILED",
  "REVEAL_UNAVAILABLE",
  "REVEAL_FAILED",
  "VOICE_AUDIO_TOO_LONG",
  "VOICE_NO_SPEECH",
  "VOICE_ASR_FAILED",
  "VOICE_TTS_FAILED",
  "SERVICE_NOT_CONFIGURED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_INCIDENT",
]);

export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>;

export const publicErrorSchema = z.strictObject({
  code: publicErrorCodeSchema,
  message: z.string().min(1),
  incident_id: z.string().min(1).optional(),
});

export type PublicError = z.infer<typeof publicErrorSchema>;

// ---------------------------------------------------------------------------
// 案件（4.2 / 4.4）

export const rolePublicSchema = z.strictObject({
  role_id: roleIdSchema,
  display_name: z.string().min(1),
  public_bio: z.string().min(1),
  persona_key: z.string().min(1),
  voice_id: z.string().min(1),
});

export type RolePublic = z.infer<typeof rolePublicSchema>;

export const casePublicSchema = z.strictObject({
  case_id: caseIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  source_url: z.url({ protocol: /^https$/ }),
  theme: z.string().min(1),
  roles: z.array(rolePublicSchema).length(5),
});

export type CasePublic = z.infer<typeof casePublicSchema>;

export const caseCatalogItemPublicSchema = z.strictObject({
  case_id: caseIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  theme: z.string().min(1),
  source_url: z.url({ protocol: /^https$/ }),
});

export type CaseCatalogItemPublic = z.infer<typeof caseCatalogItemPublicSchema>;

export const caseCompilationStatusSchema = z.enum([
  "accepted",
  "working",
  "succeeded",
  "failed",
]);

export type CaseCompilationStatus = z.infer<typeof caseCompilationStatusSchema>;

export const caseCompileReceiptSchema = z.strictObject({
  case_id: caseIdSchema,
  status: z.literal("accepted"),
});

export type CaseCompileReceipt = z.infer<typeof caseCompileReceiptSchema>;

export const caseCompilationStatusPublicSchema = z
  .strictObject({
    case_id: caseIdSchema,
    status: caseCompilationStatusSchema,
    error: publicErrorSchema.optional(),
  })
  .refine(
    (value) => (value.status === "failed") === (value.error !== undefined),
    { message: "error 当且仅当 status 为 failed" },
  );

export type CaseCompilationStatusPublic = z.infer<
  typeof caseCompilationStatusPublicSchema
>;

export const sourceDocumentPublicSchema = z.strictObject({
  source_id: sourceIdSchema,
  case_id: caseIdSchema,
  source_url: z.url({ protocol: /^https$/ }),
  canonical_text: z.string().min(1),
  content_sha256: sha256DigestSchema,
});

export type SourceDocumentPublic = z.infer<typeof sourceDocumentPublicSchema>;

// ---------------------------------------------------------------------------
// 消息（5）

export const questionModeSchema = z.enum(["gentle", "direct", "pressure"]);
export type QuestionMode = z.infer<typeof questionModeSchema>;

export const questionSourceSchema = z.enum(["keyboard", "asr"]);
export type QuestionSource = z.infer<typeof questionSourceSchema>;

export const roleStanceSchema = z.enum([
  "answer",
  "deny",
  "challenge",
  "clarify",
  "evade",
]);
export type RoleStance = z.infer<typeof roleStanceSchema>;

export const roleEmotionSchema = z.enum([
  "calm",
  "uneasy",
  "defensive",
  "agitated",
]);
export type RoleEmotion = z.infer<typeof roleEmotionSchema>;

export const roleProsodySchema = z.strictObject({
  pace: z.enum(["slow", "normal", "fast"]),
  intensity: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
});

export type RoleProsody = z.infer<typeof roleProsodySchema>;

export const playerMessagePublicSchema = z.strictObject({
  message_id: messageIdSchema,
  session_id: sessionIdSchema,
  speaker_type: z.literal("player"),
  exact_text: z.string().min(1),
  target_role_id: roleIdSchema,
  mode: questionModeSchema,
  source: questionSourceSchema,
  created_at: isoDateTimeSchema,
});

export type PlayerMessagePublic = z.infer<typeof playerMessagePublicSchema>;

export const roleMessagePublicSchema = z.strictObject({
  message_id: messageIdSchema,
  session_id: sessionIdSchema,
  speaker_type: z.literal("role"),
  speaker_id: roleIdSchema,
  exact_text: z.string().min(1),
  stance: roleStanceSchema,
  emotion: roleEmotionSchema,
  target_role_id: roleIdSchema.optional(),
  rebuttal_to_message_id: messageIdSchema.optional(),
  prosody: roleProsodySchema.optional(),
  audio_ref: z.string().min(1).optional(),
  created_at: isoDateTimeSchema,
});

export type RoleMessagePublic = z.infer<typeof roleMessagePublicSchema>;

export const gmMessagePublicSchema = z.strictObject({
  message_id: messageIdSchema,
  session_id: sessionIdSchema,
  speaker_type: z.literal("gm"),
  exact_text: z.string().min(1),
  created_at: isoDateTimeSchema,
});

export type GmMessagePublic = z.infer<typeof gmMessagePublicSchema>;

export const messagePublicSchema = z.discriminatedUnion("speaker_type", [
  playerMessagePublicSchema,
  roleMessagePublicSchema,
  gmMessagePublicSchema,
]);

export type MessagePublic = z.infer<typeof messagePublicSchema>;

// ---------------------------------------------------------------------------
// Evidence 与 Board（6）

export const evidenceTypeSchema = z.enum([
  "quote",
  "claim",
  "source",
  "timeline",
  "contradiction",
]);

export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const evidenceFragmentPublicSchema = z.strictObject({
  evidence_id: evidenceIdSchema,
  type: evidenceTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  source_message_id: messageIdSchema.optional(),
  public_claim_refs: z.array(claimIdSchema),
  conflicts_with: z.array(evidenceIdSchema),
  audio_ref: z.string().min(1).optional(),
  unlocked_at: isoDateTimeSchema,
});

export type EvidenceFragmentPublic = z.infer<
  typeof evidenceFragmentPublicSchema
>;

export const boardLaneSchema = z.enum([
  "source",
  "retelling",
  "timeline",
  "scope",
  "causal",
  "condition",
]);

export type BoardLane = z.infer<typeof boardLaneSchema>;

export const boardPlacementSchema = z.strictObject({
  evidence_id: evidenceIdSchema,
  lane: boardLaneSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type BoardPlacement = z.infer<typeof boardPlacementSchema>;

export const boardLinkRelationSchema = z.enum([
  "supports",
  "contradicts",
  "before",
  "after",
  "qualifies",
  "claims_causal",
]);

export const boardLinkSchema = z
  .strictObject({
    link_id: z.string().min(1),
    from_evidence_id: evidenceIdSchema,
    to_evidence_id: evidenceIdSchema,
    relation: boardLinkRelationSchema,
  })
  .refine((link) => link.from_evidence_id !== link.to_evidence_id, {
    message: "Link 两端不得相同",
  });

export type BoardLink = z.infer<typeof boardLinkSchema>;

export const boardStateSchema = z.strictObject({
  session_id: sessionIdSchema,
  revision: z.number().int().min(0),
  placements: z.array(boardPlacementSchema),
  links: z.array(boardLinkSchema),
  updated_at: isoDateTimeSchema,
});

export type BoardState = z.infer<typeof boardStateSchema>;

// ---------------------------------------------------------------------------
// SessionView 与公开事件（7）

export const sessionPhaseSchema = z.enum([
  "briefing",
  "opening_statements",
  "investigation",
  "judging",
  "revealed",
  "failed",
]);

export type SessionPhase = z.infer<typeof sessionPhaseSchema>;

export const allowedSessionActionSchema = z.enum([
  "start",
  "ask",
  "save_recording",
  "present_recording",
  "update_board",
  "accuse",
]);

export type AllowedSessionAction = z.infer<typeof allowedSessionActionSchema>;

export const finalAccusationSchema = z
  .strictObject({
    suspect_role_id: roleIdSchema,
    distortion_types: z.array(distortionTypeSchema).min(1),
    evidence_ids: z.array(evidenceIdSchema).min(1),
    note: z.string().min(1).optional(),
  })
  .refine(
    (accusation) =>
      new Set(accusation.distortion_types).size ===
        accusation.distortion_types.length &&
      new Set(accusation.evidence_ids).size === accusation.evidence_ids.length,
    { message: "Distortion Type 与 Evidence 均不得重复" },
  );

export type FinalAccusation = z.infer<typeof finalAccusationSchema>;

export const sessionViewSchema = z
  .strictObject({
    session_id: sessionIdSchema,
    case_id: caseIdSchema,
    phase: sessionPhaseSchema,
    allowed_actions: z.array(allowedSessionActionSchema),
    active_role_turn_request_id: requestIdSchema.optional(),
    board: boardStateSchema,
    submitted_accusation: finalAccusationSchema.optional(),
    reveal_available: z.boolean(),
    last_event_sequence: z.number().int().min(0),
    terminal_error: publicErrorSchema.optional(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .refine(
    (view) =>
      (view.phase === "revealed") === view.reveal_available &&
      (view.phase === "failed") === (view.terminal_error !== undefined),
    {
      message:
        "reveal_available 当且仅当 phase=revealed；terminal_error 当且仅当 phase=failed",
    },
  );

export type SessionView = z.infer<typeof sessionViewSchema>;

export const gameEventPayloadSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("session_created") }),
  z.strictObject({ type: z.literal("game_started") }),
  z.strictObject({
    type: z.literal("opening_statement_published"),
    role_id: roleIdSchema,
    message_id: messageIdSchema,
  }),
  z.strictObject({
    type: z.literal("player_question_submitted"),
    message_id: messageIdSchema,
    request_id: requestIdSchema,
    target_role_id: roleIdSchema,
    mode: questionModeSchema,
    source: questionSourceSchema,
  }),
  z.strictObject({
    type: z.literal("role_turn_working"),
    request_id: requestIdSchema,
    role_id: roleIdSchema,
  }),
  z.strictObject({
    type: z.literal("role_message_published"),
    request_id: requestIdSchema,
    message_id: messageIdSchema,
    role_id: roleIdSchema,
  }),
  z.strictObject({
    type: z.literal("role_turn_failed"),
    request_id: requestIdSchema,
    role_id: roleIdSchema,
    error: publicErrorSchema,
  }),
  z.strictObject({
    type: z.literal("evidence_unlocked"),
    evidence_ids: z.array(evidenceIdSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("recording_saved"),
    evidence_id: evidenceIdSchema,
    message_id: messageIdSchema,
  }),
  z.strictObject({
    type: z.literal("recording_presented"),
    evidence_id: evidenceIdSchema,
    target_role_id: roleIdSchema,
    request_id: requestIdSchema,
  }),
  z.strictObject({
    type: z.literal("board_updated"),
    revision: z.number().int().min(0),
  }),
  z.strictObject({
    type: z.literal("accusation_submitted"),
    accusation_id: z.string().min(1),
  }),
  z.strictObject({ type: z.literal("reveal_published") }),
  z.strictObject({
    type: z.literal("session_failed"),
    error: publicErrorSchema,
  }),
]);

export type GameEventPayload = z.infer<typeof gameEventPayloadSchema>;

export const gameEventPublicSchema = z.strictObject({
  event_id: eventIdSchema,
  session_id: sessionIdSchema,
  sequence: z.number().int().min(1),
  occurred_at: isoDateTimeSchema,
  payload: gameEventPayloadSchema,
});

export type GameEventPublic = z.infer<typeof gameEventPublicSchema>;

// ---------------------------------------------------------------------------
// Durable Role Ticket（8.1）

export const askRoleArgsSchema = z.strictObject({
  session_id: sessionIdSchema,
  role_id: roleIdSchema,
  mode: questionModeSchema,
  text: z.string().min(1),
  source: questionSourceSchema,
  client_action_id: clientActionIdSchema,
});

export type AskRoleArgs = z.infer<typeof askRoleArgsSchema>;

export const presentRecordingArgsSchema = z.strictObject({
  session_id: sessionIdSchema,
  evidence_id: evidenceIdSchema,
  target_role_id: roleIdSchema,
  client_action_id: clientActionIdSchema,
});

export type PresentRecordingArgs = z.infer<typeof presentRecordingArgsSchema>;

export const roleTurnReceiptSchema = z.strictObject({
  request_id: requestIdSchema,
});

export type RoleTurnReceipt = z.infer<typeof roleTurnReceiptSchema>;

export const roleTurnKindSchema = z.enum([
  "ask",
  "present_recording",
  "opening_statement",
]);

export type RoleTurnKind = z.infer<typeof roleTurnKindSchema>;

const publicRoleTurnBase = {
  request_id: requestIdSchema,
  session_id: sessionIdSchema,
  role_id: roleIdSchema,
  kind: roleTurnKindSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
};

export const publicRoleTurnSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...publicRoleTurnBase, status: z.literal("accepted") }),
  z.strictObject({ ...publicRoleTurnBase, status: z.literal("working") }),
  z.strictObject({
    ...publicRoleTurnBase,
    status: z.literal("succeeded"),
    message: roleMessagePublicSchema,
    newly_unlocked_evidence_ids: z.array(evidenceIdSchema),
  }),
  z.strictObject({
    ...publicRoleTurnBase,
    status: z.literal("failed"),
    error: publicErrorSchema,
  }),
]);

export type PublicRoleTurn = z.infer<typeof publicRoleTurnSchema>;

// ---------------------------------------------------------------------------
// Reveal（10）

export const revealResultSchema = z
  .strictObject({
    correct_role_id: roleIdSchema,
    distortion_types: z.array(distortionTypeSchema).min(1),
    player_correct: z.boolean(),
    truth_chain: z
      .array(
        z.strictObject({
          order: z.number().int().min(1),
          claim_id: claimIdSchema,
          label: z.string().min(1),
        }),
      )
      .min(1),
    altered_links: z.array(
      z.strictObject({
        original: z.string().min(1),
        distorted: z.string().min(1),
        distortion_type: distortionTypeSchema,
      }),
    ),
    evidence_score: z.number().int().min(0).max(100),
    questioning_score: z.number().int().min(0).max(100),
    explanation: z.string().min(1),
    reality_mapping: z.array(z.string().min(1)),
  })
  .refine((reveal) => {
    const orders = reveal.truth_chain.map((entry) => entry.order);
    return orders.every((order, index) => order === index + 1);
  }, { message: "truth_chain.order 必须从 1 开始、连续且唯一" });

export type RevealResult = z.infer<typeof revealResultSchema>;

// ---------------------------------------------------------------------------
// Voice 公开部分（14）

export const transcriptResultPublicSchema = z.strictObject({
  text: z.string().min(1),
  is_final: z.literal(true),
  confidence: z.number().min(0).max(1).optional(),
  language: z.literal("zh"),
  duration_ms: z.number().int().min(0),
});

export type TranscriptResultPublic = z.infer<
  typeof transcriptResultPublicSchema
>;

// ---------------------------------------------------------------------------
// Voice Stream 流式语音管线（14.5，ADR 0006）
//
// 同源 Route 与 Browser 之间的流式帧形状。上行是浏览器持续推送的原始
// PCM16LE 16k 单声道音频帧（二进制体，X-Stream-Id / X-Seq 定位），下行是
// 本 schema 的事件流（JSON lines，每行一个 voiceStreamFrameSchema）。
// 部分转写只存在于流式会话内存与浏览器输入框；只有 asr_final 文本会经
// roleTurns.ask 进入权威数据。TTS 只从服务端 Approved Speech Envelope 合成。

export const voiceStreamStageSchema = z.enum(["asr", "vad", "tts", "pipeline"]);

export type VoiceStreamStage = z.infer<typeof voiceStreamStageSchema>;

/** 流建立/回合提交时的预检投影：客户端据此提前禁用或放行自动提交。 */
export const voicePreflightSchema = z.strictObject({
  phase: sessionPhaseSchema,
  ask_allowed: z.boolean(),
  worker_ready: z.boolean(),
});

export type VoicePreflight = z.infer<typeof voicePreflightSchema>;

export const voiceStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("stream_ready"),
    stream_id: z.string().min(1),
    preflight: voicePreflightSchema,
  }),
  z.strictObject({
    type: z.literal("session_preflight"),
    preflight: voicePreflightSchema,
  }),
  /** 已闭合句段的稳定累积转写（前缀单调追加，不回改）。 */
  z.strictObject({
    type: z.literal("asr_partial"),
    text: z.string(),
    segment_index: z.number().int().min(0),
    speech_ms: z.number().int().min(0),
  }),
  /** 端点判定通过，进入最终确认（客户端留有短暂 turn_resumed 窗口）。 */
  z.strictObject({ type: z.literal("turn_committed") }),
  /** 提交宽限窗口内检测到继续说话，本轮继续。 */
  z.strictObject({ type: z.literal("turn_resumed") }),
  /** 本轮最终确认转写（已闭合句段文本按序拼接 + 尾段补转写）。 */
  z.strictObject({
    type: z.literal("asr_final"),
    text: z.string().min(1),
    segments: z.array(z.string()),
    duration_ms: z.number().int().min(0),
    /** 本轮存在句段失败或超长截断时为 true：客户端不得自动提交。 */
    degraded: z.boolean(),
  }),
  /** 回合播放中检测到用户重新说话（barge-in）。 */
  z.strictObject({ type: z.literal("interruption") }),
  z.strictObject({
    type: z.literal("tts_started"),
    message_id: messageIdSchema,
    segment_total: z.number().int().min(1),
  }),
  z.strictObject({
    type: z.literal("tts_audio"),
    message_id: messageIdSchema,
    index: z.number().int().min(0),
    wav_base64: z.string().min(1),
    sample_rate: z.number().int().min(8000),
    duration_ms: z.number().int().min(0),
  }),
  z.strictObject({ type: z.literal("tts_finished"), message_id: messageIdSchema }),
  z.strictObject({ type: z.literal("tts_aborted"), message_id: messageIdSchema }),
  /** 单段合成失败：显式上报后跳过该段继续后续段（文字内容不受影响）。 */
  z.strictObject({
    type: z.literal("tts_segment_failed"),
    message_id: messageIdSchema,
    index: z.number().int().min(0),
    error: publicErrorSchema,
  }),
  /** 管线某阶段的显式 typed failure；流不终止，键盘路径不受影响。 */
  z.strictObject({
    type: z.literal("voice_stream_error"),
    stage: voiceStreamStageSchema,
    error: publicErrorSchema,
  }),
]);

export type VoiceStreamEvent = z.infer<typeof voiceStreamEventSchema>;

/** 下行 JSON lines 帧包装：seq 单调递增，客户端断线后按 after_seq 续传。 */
export const voiceStreamFrameSchema = z.strictObject({
  seq: z.number().int().min(0),
  at: isoDateTimeSchema,
  event: voiceStreamEventSchema,
});

export type VoiceStreamFrame = z.infer<typeof voiceStreamFrameSchema>;

/** 上行控制动作（POST /api/voice/stream/control 的 body）。 */
export const voiceStreamControlSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("speak"),
    stream_id: z.string().min(1),
    session_id: sessionIdSchema,
    message_id: messageIdSchema,
  }),
  z.strictObject({
    action: z.literal("stop_speak"),
    stream_id: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal("abort"),
    stream_id: z.string().min(1),
  }),
]);

export type VoiceStreamControl = z.infer<typeof voiceStreamControlSchema>;
