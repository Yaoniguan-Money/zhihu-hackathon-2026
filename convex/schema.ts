import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// TB1：建案域业务表（CONTRACTS 4.4 / 4.5 / 12，ADR 0004）。
// 结构化契约数据（CasePrivate 图谱、段落索引、PublicError）以 canonical JSON
// 字符串存储，写入与读取边界均经 contracts 的 zod runtime schema 校验；
// 单一校验层避免 zod 契约与 Convex validator 双份维护漂移。
export default defineSchema({
  ...authTables,
  cases: defineTable({
    case_key: v.string(), // 不透明公开 CaseId，全局唯一
    visibility: v.union(v.literal("system"), v.literal("user")),
    owner_identity: v.optional(v.string()), // tokenIdentifier；系统案件为空
    status: v.union(
      v.literal("compiling"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    theme: v.optional(v.string()),
    source_url: v.optional(v.string()),
    public_json: v.optional(v.string()), // CasePublic（zod 校验后序列化），ready 时存在
    created_at_ms: v.number(),
    updated_at_ms: v.number(),
  })
    .index("by_case_key", ["case_key"])
    .index("by_owner_status", ["owner_identity", "status"]),

  compilation_tickets: defineTable({
    case_key: v.string(),
    // 公开状态仅限 CONTRACTS 4.4 的 accepted / working / succeeded / failed
    status: v.union(
      v.literal("accepted"),
      v.literal("working"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    error_json: v.optional(v.string()), // PublicError payload，仅 failed 时存在
    created_at_ms: v.number(),
    updated_at_ms: v.number(),
  }).index("by_case_key", ["case_key"]),

  idempotency_records: defineTable({
    identity_token: v.string(),
    operation_name: v.string(),
    // 幂等键的作用域（CONTRACTS 12）：建案为空串、sessions.create 为 case_id、
    // Session 范围写操作为 session_id。TB1 早期行无此字段（可选以兼容本地开发数据），
    // 新写入一律携带。
    scope_id: v.optional(v.string()),
    client_action_id: v.string(), // 调用方 UUID
    payload_hash: v.string(),
    result_json: v.string(), // 首次持久化的 receipt / SessionView / request 等
    created_at_ms: v.number(),
  }).index("by_key", [
    "identity_token",
    "operation_name",
    "scope_id",
    "client_action_id",
  ]),

  invite_codes: defineTable({
    code_hash: v.string(), // 只存 SHA-256；明文绝不入库（CONTRACTS 4.5）
    expires_at_ms: v.optional(v.number()), // 缺省为永不过期
    revoked: v.boolean(),
    max_uses: v.number(),
    used_count: v.number(),
    created_at_ms: v.number(),
  }).index("by_code_hash", ["code_hash"]),

  creation_usage: defineTable({
    identity_token: v.string(),
    utc_day: v.string(), // YYYY-MM-DD，全站日额度分桶
    created_at_ms: v.number(),
  })
    .index("by_identity_created", ["identity_token", "created_at_ms"])
    .index("by_day", ["utc_day"]),

  source_documents: defineTable({
    case_key: v.string(),
    source_url: v.string(),
    canonical_text: v.string(),
    content_sha256: v.string(),
    paragraphs_json: v.string(), // CanonicalParagraphPrivate[]，zod 校验后序列化
    created_at_ms: v.number(),
  }).index("by_case_key", ["case_key"]),

  case_private: defineTable({
    case_key: v.string(),
    graph_json: v.string(), // EvidenceGraphPrivate，zod 校验后序列化
    policies_json: v.optional(v.string()), // RolePrivatePolicy[]（4+1）
    golden_answer_json: v.optional(v.string()), // GoldenAnswerPrivate
    catalog_json: v.optional(v.string()), // EvidenceCatalogItemPrivate[]
    rules_json: v.optional(v.string()), // EvidenceUnlockRulePrivate[]
    rubric_json: v.optional(v.string()), // evidence_score 加权 criteria
    compiler_version: v.string(), // 模型输入/输出 schema 版本（CONTRACTS 9.3）
    created_at_ms: v.number(),
  }).index("by_case_key", ["case_key"]),

  // TB3：Session Authority（CONTRACTS 5 / 6 / 7 / 12）。
  sessions: defineTable({
    session_key: v.string(),
    case_id: v.string(),
    owner_identity: v.string(),
    phase: v.union(
      v.literal("briefing"),
      v.literal("opening_statements"),
      v.literal("investigation"),
      v.literal("judging"),
      v.literal("revealed"),
      v.literal("failed"),
    ),
    board_json: v.string(), // BoardState，zod 校验后序列化
    submitted_accusation_json: v.optional(v.string()), // FinalAccusation
    reveal_available: v.boolean(),
    terminal_error_json: v.optional(v.string()), // PublicError，仅 failed
    created_at_ms: v.number(),
    updated_at_ms: v.number(),
  })
    .index("by_session_key", ["session_key"])
    .index("by_owner", ["owner_identity"]),

  messages: defineTable({
    session_id: v.string(),
    message_id: v.string(),
    payload_json: v.string(), // MessagePublic 判别联合，zod 校验后序列化
    created_at_ms: v.number(),
  }).index("by_session_created", ["session_id", "created_at_ms"]),

  events: defineTable({
    session_id: v.string(),
    sequence: v.number(), // 从 1 开始连续（公开事件独立序列）
    payload_json: v.string(), // GameEventPayload，zod 校验后序列化
    occurred_at_ms: v.number(),
  }).index("by_session_sequence", ["session_id", "sequence"]),

  // TB4：Durable Role Ticket（CONTRACTS 8）。
  role_turn_tickets: defineTable({
    request_id: v.string(),
    session_id: v.string(),
    role_id: v.string(),
    kind: v.union(
      v.literal("ask"),
      v.literal("present_recording"),
      v.literal("opening_statement"),
    ),
    // 公开状态：accepted / working / succeeded / failed
    status: v.union(
      v.literal("accepted"),
      v.literal("working"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    message_json: v.optional(v.string()), // succeeded：RoleMessagePublic
    unlocked_ids_json: v.optional(v.string()), // succeeded：新解锁 EvidenceId[]
    validation_json: v.optional(v.string()), // succeeded：Validator 结果摘要（Reveal 构建用）
    error_json: v.optional(v.string()), // failed：PublicError
    // TB10：lease。accepted/working Ticket 持有 Session 排他锁直至终态或过期；
    // 过期锁在下一个写操作的事务中被显式判失败（TURN_LEASE_EXPIRED），
    // 不自动重新调用模型。缺省（旧数据/seed）视为未过期。
    lease_expires_at_ms: v.optional(v.number()),
    created_at_ms: v.number(),
    updated_at_ms: v.number(),
  })
    .index("by_request_id", ["request_id"])
    .index("by_session_status", ["session_id", "status"]),

  // TB10：私有审计事件（CONTRACTS 15 / SPEC 11）。独立于公开事件序列，
  // 不设全局连续 sequence（公开编号缺口不泄露私有步骤）。
  // 只记录 ID、任务名、attempt、错误码与计数；禁止 Prompt、候选原文、完整正文。
  private_audit: defineTable({
    event: v.string(), // model_call_started/completed/failed、candidate_generated、
    // validation_completed、rewrite_started、distortion_policy_checked、
    // evidence_unlock_evaluated、reveal_judged、turn_lease_expired、
    // role_turn_busy/succeeded/failed、idempotency_conflict、
    // board_revision_conflict、case_compile_succeeded/failed
    case_id: v.optional(v.string()),
    session_id: v.optional(v.string()),
    request_id: v.optional(v.string()),
    client_action_id: v.optional(v.string()),
    task: v.optional(v.string()), // claim / case / role / validator / reveal
    attempt_index: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    detail_code: v.optional(v.string()), // 仅错误码/状态码，不含文本体
    created_at_ms: v.number(),
  })
    .index("by_event", ["event"])
    .index("by_session_created", ["session_id", "created_at_ms"]),

  // TB4：Session 已解锁 Evidence（服务器规则计算，CONTRACTS 6）。
  session_evidence_unlocked: defineTable({
    session_id: v.string(),
    evidence_id: v.string(),
    via_kind: v.optional(v.string()), // 产生解锁的回合 kind（questioning 评分用）
    unlocked_at_ms: v.number(),
  }).index("by_session", ["session_id", "evidence_id"]),

  // TB9：Reveal（CONTRACTS 10）。
  reveals: defineTable({
    session_id: v.string(),
    reveal_json: v.string(), // RevealResult，zod 校验后序列化
    created_at_ms: v.number(),
  }).index("by_session", ["session_id"]),
});
