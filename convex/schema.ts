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
    client_action_id: v.string(), // 调用方 UUID
    payload_hash: v.string(),
    result_json: v.string(), // 首次持久化的 receipt（同键同哈希重放返回）
    created_at_ms: v.number(),
  })
    .index("by_key", [
      "identity_token",
      "operation_name",
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
    compiler_version: v.string(), // 模型输入/输出 schema 版本（CONTRACTS 9.3）
    created_at_ms: v.number(),
  }).index("by_case_key", ["case_key"]),
});
