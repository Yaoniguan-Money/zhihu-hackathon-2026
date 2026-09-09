import { v } from "convex/values";
import { z } from "zod";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  askRoleArgsSchema,
  gameEventPayloadSchema,
  presentRecordingArgsSchema,
  publicRoleTurnSchema,
  roleMessagePublicSchema,
  type PublicRoleTurn,
  type RoleTurnReceipt,
} from "@contracts/public/index.js";
import {
  evidenceUnlockRulePrivateSchema,
  rolePrivatePolicySchema,
  approvedSpeechEnvelopePrivateSchema,
  type ClaimPrivate,
  type PrivateFailure,
} from "@contracts/private/index.js";
import { evidenceGraphPrivateSchema } from "@contracts/private/index.js";
import { sha256Hex } from "@server/cases/hash.js";
import { canonicalJson } from "@server/cases/idempotency.js";
import { ModelRequestFailedError } from "@server/model-gateway/openai-compatible-gateway.js";
import { modelGatewayFor } from "./aiRuntime";
import { ModelConfigMissingError as ConfigMissingError } from "@server/model-gateway/config.js";
import {
  runGenerationAttempts,
  type TurnAuditEvent,
} from "@server/turn-engine/run-turn.js";
import { internal as internalApi } from "./_generated/api";
import { throwPublicError, convexErrorCode } from "./publicErrors.js";

/**
 * TB4：角色回合（CONTRACTS 5 / 8 / 9，ENGINEERING_SPEC 5.2 / 7）。
 * ask 是薄 action：auth/schema 后全部权威判定（阶段、Role、排他锁、幂等）
 * 在 initializeAskTurn 单事务内完成；模型调用在 worker（maxRetries=0）。
 * 忠实角色只发布 Validator 判为 entailed 的完整消息；最多两次语义重写。
 * TB10：Ticket 持有 lease；过期锁在下一个写操作事务中被显式判失败
 * （TURN_LEASE_EXPIRED），不自动重新调用模型。
 * P1-1：presentRecording 触发对质回合（CONTRACTS 8.2），与 ask 共用
 * 排他锁/幂等键规则；回应消息由服务器设置 rebuttal_to_message_id。
 */

const OPERATION_ASK = "roleTurns.ask";
const OPERATION_PRESENT_RECORDING = "roleTurns.presentRecording";
const uuidSchema = z.uuid();
const TICKET_LEASE_MS = 10 * 60_000;

function newOpaqueId(prefix: string): string {
  try {
    return prefix + crypto.randomUUID();
  } catch {
    return (
      prefix +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }
}

// ---------------------------------------------------------------------------
// 公开 Interface

export const ask = action({
  args: {
    session_id: v.string(),
    role_id: v.string(),
    mode: v.union(
      v.literal("gentle"),
      v.literal("direct"),
      v.literal("pressure"),
    ),
    text: v.string(),
    source: v.union(v.literal("keyboard"), v.literal("asr")),
    client_action_id: v.string(),
  },
  handler: async (ctx, args): Promise<RoleTurnReceipt> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    const parsed = askRoleArgsSchema.safeParse({
      ...args,
      text: args.text,
    });
    if (!parsed.success || args.text.trim() === "") {
      throwPublicError("INVALID_ARGUMENT", "请求参数不合法");
    }
    try {
      const { receipt } = await ctx.runMutation(
        internal.roleTurns.initializeAskTurn,
        {
          identity_token: identity.tokenIdentifier,
          session_id: args.session_id,
          role_id: args.role_id,
          mode: args.mode,
          text: args.text,
          source: args.source,
          client_action_id: args.client_action_id,
        },
      );
      return receipt;
    } catch (error) {
      // 拒绝类审计在 action 层落库：mutation 事务随 throw 回滚，
      // 审计必须写入独立提交的事务（CONTRACTS 15 / SPEC 11）。
      const code = convexErrorCode(error);
      if (code === "ROLE_TURN_BUSY" || code === "IDEMPOTENCY_CONFLICT") {
        await ctx.runMutation(internal.audit.recordInternal, {
          event:
            code === "ROLE_TURN_BUSY"
              ? "role_turn_busy"
              : "idempotency_conflict",
          session_id: args.session_id,
          client_action_id: args.client_action_id,
          detail_code: code,
        });
      }
      throw error;
    }
  },
});

/**
 * P1-1：对质回合（CONTRACTS 8.2 / ENGINEERING_SPEC 5.3）。
 * 与 ask 相同的薄 action 模式：auth/schema → initializePresentRecordingTurn
 * 单事务权威判定（阶段、Recording 解锁、Role、排他锁、幂等）→ worker。
 */
export const presentRecording = action({
  args: {
    session_id: v.string(),
    evidence_id: v.string(),
    target_role_id: v.string(),
    client_action_id: v.string(),
  },
  handler: async (ctx, args): Promise<RoleTurnReceipt> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    const parsed = presentRecordingArgsSchema.safeParse(args);
    if (!parsed.success) {
      throwPublicError("INVALID_ARGUMENT", "请求参数不合法");
    }
    try {
      const { receipt } = await ctx.runMutation(
        internal.roleTurns.initializePresentRecordingTurn,
        {
          identity_token: identity.tokenIdentifier,
          session_id: args.session_id,
          evidence_id: args.evidence_id,
          target_role_id: args.target_role_id,
          client_action_id: args.client_action_id,
        },
      );
      return receipt;
    } catch (error) {
      const code = convexErrorCode(error);
      if (code === "ROLE_TURN_BUSY" || code === "IDEMPOTENCY_CONFLICT") {
        await ctx.runMutation(internal.audit.recordInternal, {
          event:
            code === "ROLE_TURN_BUSY"
              ? "role_turn_busy"
              : "idempotency_conflict",
          session_id: args.session_id,
          client_action_id: args.client_action_id,
          detail_code: code,
        });
      }
      throw error;
    }
  },
});
export const observe = query({
  args: { request_id: v.string() },
  handler: async (ctx, args): Promise<PublicRoleTurn | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    // 不存在与越权同一安全结果：null（CONTRACTS 8.1 / 4.3）。
    if (!ticket) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", ticket.session_id))
      .unique();
    if (!session || session.owner_identity !== identity.tokenIdentifier) {
      return null;
    }
    const base = {
      request_id: ticket.request_id,
      session_id: ticket.session_id,
      role_id: ticket.role_id,
      kind: ticket.kind,
      created_at: new Date(ticket.created_at_ms).toISOString(),
      updated_at: new Date(ticket.updated_at_ms).toISOString(),
    };
    if (ticket.status === "succeeded") {
      return publicRoleTurnSchema.parse({
        ...base,
        status: "succeeded",
        message: JSON.parse(ticket.message_json ?? "{}"),
        newly_unlocked_evidence_ids: ticket.unlocked_ids_json
          ? JSON.parse(ticket.unlocked_ids_json)
          : [],
      });
    }
    if (ticket.status === "failed") {
      return publicRoleTurnSchema.parse({
        ...base,
        status: "failed",
        error: ticket.error_json
          ? JSON.parse(ticket.error_json)
          : { code: "ROLE_TURN_FAILED", message: "角色回合失败" },
      });
    }
    return publicRoleTurnSchema.parse({
      ...base,
      status: ticket.status,
    });
  },
});

// ---------------------------------------------------------------------------
// 内部：回合初始化（幂等 → 阶段/Role/锁 → 原子写玩家消息+事件+Ticket）

export const initializeAskTurn = internalMutation({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    role_id: v.string(),
    mode: v.union(
      v.literal("gentle"),
      v.literal("direct"),
      v.literal("pressure"),
    ),
    text: v.string(),
    source: v.union(v.literal("keyboard"), v.literal("asr")),
    client_action_id: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    // Owner 隔离：他人 Session 与不存在返回同一公开结果。
    if (!session || session.owner_identity !== args.identity_token) {
      throwPublicError("SESSION_NOT_FOUND", "对局不存在或不可访问");
    }

    const payloadHash = await sha256Hex(
      canonicalJson({
        session_id: args.session_id,
        role_id: args.role_id,
        mode: args.mode,
        text: args.text,
        source: args.source,
      }),
    );

    // 幂等命中先于阶段校验（CONTRACTS 12）。
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", args.identity_token)
          .eq("operation_name", OPERATION_ASK)
          .eq("scope_id", args.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
      }
      return { receipt: JSON.parse(existing.result_json) as RoleTurnReceipt };
    }

    // 阶段与动态动作（CONTRACTS 7.1）：仅 investigation 允许 ask。
    if (session.phase !== "investigation") {
      throwPublicError("SESSION_PHASE_CONFLICT", "当前阶段不能提问");
    }

    // Role 必须属于案件（ROLE_NOT_FOUND）。
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const casePublic = caseDoc?.public_json
      ? (JSON.parse(caseDoc.public_json) as { roles: { role_id: string }[] })
      : null;
    if (
      !casePublic ||
      !casePublic.roles.some((role) => role.role_id === args.role_id)
    ) {
      throwPublicError("ROLE_NOT_FOUND", "角色不存在");
    }

    // 排他锁（CONTRACTS 8.2）：先显式清出已过期的 accepted/working Ticket
    // （TURN_LEASE_EXPIRED，不自动重调模型），再检查存活锁。
    await expireStaleTickets(ctx, args.session_id);
    const active = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "accepted"),
      )
      .collect();
    const working = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "working"),
      )
      .collect();
    if (active.length + working.length > 0) {
      await ctx.runMutation(internalApi.audit.recordInternal, {
        event: "role_turn_busy",
        case_id: session.case_id,
        session_id: args.session_id,
        client_action_id: args.client_action_id,
      });
      throwPublicError("ROLE_TURN_BUSY", "已有角色回合正在进行");
    }

    const nowMs = Date.now();
    const messageId = newOpaqueId("msg-");
    const requestId = newOpaqueId("req-");
    const playerMessage = {
      message_id: messageId,
      session_id: args.session_id,
      speaker_type: "player",
      exact_text: args.text,
      target_role_id: args.role_id,
      mode: args.mode,
      source: args.source,
      created_at: new Date(nowMs).toISOString(),
    };
    await ctx.db.insert("messages", {
      session_id: args.session_id,
      message_id: messageId,
      payload_json: JSON.stringify(playerMessage),
      created_at_ms: nowMs,
    });
    await ctx.db.insert("role_turn_tickets", {
      request_id: requestId,
      session_id: args.session_id,
      role_id: args.role_id,
      kind: "ask",
      status: "accepted",
      lease_expires_at_ms: nowMs + TICKET_LEASE_MS,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    await insertEvent(ctx, args.session_id, {
      type: "player_question_submitted",
      message_id: messageId,
      request_id: requestId,
      target_role_id: args.role_id,
      mode: args.mode,
      source: args.source,
    });
    const receipt: RoleTurnReceipt = { request_id: requestId };
    await ctx.db.insert("idempotency_records", {
      identity_token: args.identity_token,
      operation_name: OPERATION_ASK,
      scope_id: args.session_id,
      client_action_id: args.client_action_id,
      payload_hash: payloadHash,
      result_json: JSON.stringify(receipt),
      created_at_ms: nowMs,
    });
    await ctx.scheduler.runAfter(0, internal.roleTurns.roleTurnWorker, {
      request_id: requestId,
      owner_identity: args.identity_token, // ADR 0005：按回合发起者解析模型配置
    });
    return { receipt };
  },
});

// ---------------------------------------------------------------------------
// 内部：对质回合初始化（幂等 → 阶段/Recording/Role/锁 → 原子写 Ticket+事件）

export const initializePresentRecordingTurn = internalMutation({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    evidence_id: v.string(),
    target_role_id: v.string(),
    client_action_id: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    // Owner 隔离：他人 Session 与不存在返回同一公开结果。
    if (!session || session.owner_identity !== args.identity_token) {
      throwPublicError("SESSION_NOT_FOUND", "对局不存在或不可访问");
    }

    const payloadHash = await sha256Hex(
      canonicalJson({
        session_id: args.session_id,
        evidence_id: args.evidence_id,
        target_role_id: args.target_role_id,
      }),
    );

    // 幂等命中先于阶段校验（CONTRACTS 12）。
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", args.identity_token)
          .eq("operation_name", OPERATION_PRESENT_RECORDING)
          .eq("scope_id", args.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
      }
      return { receipt: JSON.parse(existing.result_json) as RoleTurnReceipt };
    }

    // 阶段与动态动作（CONTRACTS 7.1）：仅 investigation 允许 present_recording。
    if (session.phase !== "investigation") {
      throwPublicError("SESSION_PHASE_CONFLICT", "当前阶段不能投递录音");
    }

    // 只能引用当前 Session 已解锁的 Recording Evidence（CONTRACTS 8.2）。
    const recording = await ctx.db
      .query("recordings")
      .withIndex("by_session_evidence", (q) =>
        q.eq("session_id", args.session_id).eq("evidence_id", args.evidence_id),
      )
      .unique();
    if (!recording) {
      throwPublicError("EVIDENCE_UNAVAILABLE", "引用的录音不存在或未解锁");
    }

    // 目标 Role 必须属于案件（ROLE_NOT_FOUND）。
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const casePublic = caseDoc?.public_json
      ? (JSON.parse(caseDoc.public_json) as { roles: { role_id: string }[] })
      : null;
    if (
      !casePublic ||
      !casePublic.roles.some((role) => role.role_id === args.target_role_id)
    ) {
      throwPublicError("ROLE_NOT_FOUND", "角色不存在");
    }

    // 排他锁与 ask / 开场共用（CONTRACTS 8.2 / SPEC 8）。
    await expireStaleTickets(ctx, args.session_id);
    const active = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "accepted"),
      )
      .collect();
    const working = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "working"),
      )
      .collect();
    if (active.length + working.length > 0) {
      await ctx.runMutation(internalApi.audit.recordInternal, {
        event: "role_turn_busy",
        case_id: session.case_id,
        session_id: args.session_id,
        client_action_id: args.client_action_id,
      });
      throwPublicError("ROLE_TURN_BUSY", "已有角色回合正在进行");
    }

    const nowMs = Date.now();
    const requestId = newOpaqueId("req-");
    await ctx.db.insert("role_turn_tickets", {
      request_id: requestId,
      session_id: args.session_id,
      role_id: args.target_role_id,
      kind: "present_recording",
      status: "accepted",
      confront_message_id: recording.message_id,
      lease_expires_at_ms: nowMs + TICKET_LEASE_MS,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    await insertEvent(ctx, args.session_id, {
      type: "recording_presented",
      evidence_id: args.evidence_id,
      target_role_id: args.target_role_id,
      request_id: requestId,
    });
    const receipt: RoleTurnReceipt = { request_id: requestId };
    await ctx.db.insert("idempotency_records", {
      identity_token: args.identity_token,
      operation_name: OPERATION_PRESENT_RECORDING,
      scope_id: args.session_id,
      client_action_id: args.client_action_id,
      payload_hash: payloadHash,
      result_json: JSON.stringify(receipt),
      created_at_ms: nowMs,
    });
    await ctx.scheduler.runAfter(0, internal.roleTurns.roleTurnWorker, {
      request_id: requestId,
      owner_identity: args.identity_token, // ADR 0005：按回合发起者解析模型配置
    });
    return { receipt };
  },
});

async function insertEvent(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const last = await ctx.db
    .query("events")
    .withIndex("by_session_sequence", (q) => q.eq("session_id", sessionId))
    .order("desc")
    .first();
  const sequence = (last?.sequence ?? 0) + 1;
  await ctx.db.insert("events", {
    session_id: sessionId,
    sequence,
    payload_json: JSON.stringify(gameEventPayloadSchema.parse(payload)),
    occurred_at_ms: Date.now(),
  });
  return sequence;
}

/**
 * TB10：把 lease 已过期的 accepted/working Ticket 显式判为失败
 * （CONTRACTS 8.2 / 13.2：TURN_LEASE_EXPIRED → ROLE_TURN_FAILED），
 * 释放排他锁；不自动重新调用模型。缺省 lease（旧数据/seed）视为未过期。
 */
async function expireStaleTickets(
  ctx: import("./_generated/server").MutationCtx,
  sessionId: string,
): Promise<void> {
  const nowMs = Date.now();
  for (const status of ["accepted", "working"] as const) {
    const tickets = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", sessionId).eq("status", status),
      )
      .collect();
    for (const ticket of tickets) {
      if (
        ticket.lease_expires_at_ms === undefined ||
        ticket.lease_expires_at_ms > nowMs
      ) {
        continue;
      }
      const publicError = {
        code: "ROLE_TURN_FAILED",
        message: "角色回合失败，可稍后重试",
      } as const;
      await insertEvent(ctx, sessionId, {
        type: "role_turn_failed",
        request_id: ticket.request_id,
        role_id: ticket.role_id,
        error: publicError,
      });
      await ctx.db.patch(ticket._id, {
        status: "failed",
        error_json: JSON.stringify(publicError),
        updated_at_ms: nowMs,
      });
      await ctx.runMutation(internalApi.audit.recordInternal, {
        event: "turn_lease_expired",
        session_id: sessionId,
        request_id: ticket.request_id,
        detail_code: "TURN_LEASE_EXPIRED",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 内部：worker（生成 → 校验 → 重写 → 原子发布）

function toPrivateFailure(error: unknown): PrivateFailure {
  if (error instanceof ModelRequestFailedError) return error.failure;
  if (error instanceof ConfigMissingError) return error.failure;
  return {
    code: "INTERNAL_INVARIANT_VIOLATION",
    incident_id: `turn:${Date.now().toString(36)}`,
    detail: error instanceof Error ? error.message : "未知回合错误",
  };
}

interface TurnContext {
  session_id: string;
  case_id: string;
  role_id: string;
  displayName: string;
  visibleClaims: ClaimPrivate[];
  policy: z.infer<typeof rolePrivatePolicySchema>;
  history: string[];
  question: string;
  mode: string;
  kind: "ask" | "present_recording";
  /** P1-1：对质回合的录音上下文（生成 prompt 用）。 */
  confrontation?: { speakerName: string; recordingText: string };
  /** P1-1：对质回应消息的 rebuttal_to_message_id（服务器权威）。 */
  rebuttalMessageId?: string;
}

export const roleTurnWorker = internalAction({
  args: {
    request_id: v.string(),
    owner_identity: v.string(), // ADR 0005：回合发起者的模型配置
  },
  handler: async (ctx, args) => {
    const accepted = await ctx.runQuery(internal.roleTurns.ticketInternal, {
      request_id: args.request_id,
    });
    if (!accepted) {
      return; // 防御：不重复处理
    }
    const loaded = await ctx.runQuery(internal.roleTurns.turnContextInternal, {
      request_id: args.request_id,
    });
    if (!loaded) {
      await ctx.runMutation(internal.roleTurns.finalizeTurnFailure, {
        request_id: args.request_id,
        failure_json: JSON.stringify({
          code: "INTERNAL_INVARIANT_VIOLATION",
          incident_id: `turn:${args.request_id}`,
          detail: "回合上下文缺失",
        } satisfies PrivateFailure),
      });
      return;
    }
    await ctx.runMutation(internal.roleTurns.markTurnWorking, {
      request_id: args.request_id,
    });

    const context = loaded as TurnContext;
    const emitTurnAudit = async (event: TurnAuditEvent): Promise<void> => {
      await ctx.runMutation(internalApi.audit.recordInternal, {
        event: event.type,
        case_id: context.case_id,
        session_id: context.session_id,
        request_id: args.request_id,
        ...("task" in event ? { task: event.task } : {}),
        ...( "attempt_index" in event
          ? { attempt_index: event.attempt_index }
          : {}),
        ...(event.type === "model_call_completed" ||
        event.type === "model_call_failed"
          ? { duration_ms: event.duration_ms }
          : {}),
        ...("detail_code" in event && event.detail_code !== undefined
          ? { detail_code: event.detail_code }
          : {}),
      });
    };
    try {
      // ADR 0005：按回合发起者实时解析其模型配置（保存后下一回合即生效）。
      const gateway = await modelGatewayFor(ctx, args.owner_identity);
      const outcome = await runGenerationAttempts(
        gateway,
        {
          policy: context.policy,
          displayName: context.displayName,
          visibleClaims: context.visibleClaims.map((claim) => ({
            claim_id: claim.claim_id,
            proposition: claim.proposition,
          })),
          history: context.history,
          question: context.question,
          mode: context.mode,
          // P1-1：对质回合要求候选引用非空且可见的 Claim（CONTRACTS 8.2）。
          requireSupportClaims: context.kind === "present_recording",
          ...(context.confrontation && {
            confrontation: context.confrontation,
          }),
          incidentRef: args.request_id,
        },
        emitTurnAudit,
      );

      if (!outcome.ok) {
        // 协议/校验器失败与语义耗尽都是终止结果；私有原因进 incident，公开只映射。
        await ctx.runMutation(internal.roleTurns.finalizeTurnFailure, {
          request_id: args.request_id,
          failure_json: JSON.stringify(outcome.failure),
        });
        return;
      }

      const approved = outcome;
      const supportIds = new Set(approved.candidate.support_claim_ids);
      const unlocked = await ctx.runQuery(
        internal.roleTurns.computeUnlocksInternal,
        {
          session_id: context.session_id,
          case_id: context.case_id,
          role_id: context.role_id,
          support_claim_ids: [...supportIds],
        },
      );

      await ctx.runMutation(internal.roleTurns.finalizeTurnSuccess, {
        request_id: args.request_id,
        speech: approved.candidate.speech,
        stance: approved.candidate.stance,
        emotion: approved.candidate.emotion,
        support_claim_ids: approved.candidate.support_claim_ids,
        unlocked_ids: unlocked,
        ...(context.kind === "present_recording" &&
          context.rebuttalMessageId && {
            rebuttal_to_message_id: context.rebuttalMessageId,
          }),
        validation_json: JSON.stringify({
          status: approved.validation.status,
          detected_distortion_types: approved.validation.detected_distortion_types,
          unsupported_spans: approved.validation.unsupported_spans,
          referenced_claim_ids: approved.validation.referenced_claim_ids,
          support_claim_ids: approved.candidate.support_claim_ids,
        }),
      });
    } catch (error) {
      const failure = toPrivateFailure(error);
      await ctx.runMutation(internal.roleTurns.finalizeTurnFailure, {
        request_id: args.request_id,
        failure_json: JSON.stringify(failure),
      });
    }
  },
});

// ---------------------------------------------------------------------------
// 内部：查询与状态迁移

export const ticketInternal = internalQuery({
  args: { request_id: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    return ticket?.status === "accepted";
  },
});

export const turnContextInternal = internalQuery({
  args: { request_id: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    if (!ticket) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", ticket.session_id))
      .unique();
    if (!session) return null;
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    if (!caseDoc) return null;
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    if (!privateDoc) return null;
    const graph = evidenceGraphPrivateSchema.parse(
      JSON.parse(privateDoc.graph_json),
    );
    const policies = z
      .array(rolePrivatePolicySchema)
      .parse(JSON.parse(privateDoc.policies_json ?? "[]"));
    const policy = policies.find((p) => p.role_id === ticket.role_id);
    if (!policy) return null;
    const visibleClaims = graph.claims.filter((claim) =>
      policy.visible_claim_ids.includes(claim.claim_id),
    );
    const historyDocs = await ctx.db
      .query("messages")
      .withIndex("by_session_created", (q) =>
        q.eq("session_id", ticket.session_id),
      )
      .order("asc")
      .collect();
    const history = historyDocs.slice(-10).map((doc) => {
      const message = JSON.parse(doc.payload_json);
      const speaker =
        message.speaker_type === "player" ? "玩家" : message.speaker_id;
      return `${speaker}: ${message.exact_text}`;
    });
    // 玩家问题原文与 mode 来自最后一条玩家消息（ask 初始化时已持久化）。
    let question = "";
    let mode = "direct";
    for (let i = historyDocs.length - 1; i >= 0; i -= 1) {
      const message = JSON.parse(historyDocs[i]!.payload_json);
      if (message.speaker_type === "player") {
        question = message.exact_text;
        mode = message.mode;
        break;
      }
    }
    const casePublic = caseDoc.public_json
      ? (JSON.parse(caseDoc.public_json) as {
          roles: { role_id: string; display_name: string }[];
        })
      : null;
    const displayName =
      casePublic?.roles.find((role) => role.role_id === ticket.role_id)
        ?.display_name ?? ticket.role_id;

    // P1-1：对质回合以录音内容构造生成上下文（CONTRACTS 8.2）。
    if (ticket.kind === "present_recording") {
      if (!ticket.confront_message_id) return null;
      const recording = await ctx.db
        .query("recordings")
        .withIndex("by_session_message", (q) =>
          q
            .eq("session_id", ticket.session_id)
            .eq("message_id", ticket.confront_message_id ?? ""),
        )
        .unique();
      if (!recording) return null;
      const speakerName =
        casePublic?.roles.find(
          (role) => role.role_id === recording.speaker_role_id,
        )?.display_name ?? recording.speaker_role_id;
      return {
        session_id: ticket.session_id,
        case_id: session.case_id,
        role_id: ticket.role_id,
        displayName,
        visibleClaims,
        policy,
        history,
        question: "",
        mode: "confrontation",
        kind: "present_recording",
        confrontation: {
          speakerName,
          recordingText: recording.body,
        },
        rebuttalMessageId: recording.message_id,
      } satisfies TurnContext;
    }

    return {
      session_id: ticket.session_id,
      case_id: session.case_id,
      role_id: ticket.role_id,
      displayName,
      visibleClaims,
      policy,
      history,
      question,
      mode,
      kind: "ask",
    } satisfies TurnContext;
  },
});

export const caseIdForSession = internalQuery({
  args: { session_id: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    return session?.case_id ?? "";
  },
});

export const computeUnlocksInternal = internalQuery({
  args: {
    session_id: v.string(),
    case_id: v.string(),
    role_id: v.string(),
    support_claim_ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    if (!privateDoc?.rules_json) return [];
    const rules = z
      .array(evidenceUnlockRulePrivateSchema)
      .parse(JSON.parse(privateDoc.rules_json));
    const already = new Set(
      (
        await ctx.db
          .query("session_evidence_unlocked")
          .withIndex("by_session", (q) =>
            q.eq("session_id", args.session_id),
          )
          .collect()
      ).map((row) => row.evidence_id),
    );
    const supportSet = new Set(args.support_claim_ids);
    const approved: string[] = [];
    for (const rule of rules) {
      if (already.has(rule.evidence_id)) continue;
      if (!rule.allowed_role_ids.includes(args.role_id)) continue;
      if (!rule.required_claim_ids.every((id) => supportSet.has(id))) continue;
      approved.push(rule.evidence_id);
    }
    return approved;
  },
});

export const markTurnWorking = internalMutation({
  args: { request_id: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    if (!ticket || ticket.status !== "accepted") return;
    await ctx.db.patch(ticket._id, {
      status: "working",
      lease_expires_at_ms: Date.now() + TICKET_LEASE_MS,
      updated_at_ms: Date.now(),
    });
    await insertEvent(ctx, ticket.session_id, {
      type: "role_turn_working",
      request_id: ticket.request_id,
      role_id: ticket.role_id,
    });
  },
});

export const finalizeTurnSuccess = internalMutation({
  args: {
    request_id: v.string(),
    speech: v.string(),
    stance: v.union(
      v.literal("answer"),
      v.literal("deny"),
      v.literal("challenge"),
      v.literal("clarify"),
      v.literal("evade"),
    ),
    emotion: v.union(
      v.literal("calm"),
      v.literal("uneasy"),
      v.literal("defensive"),
      v.literal("agitated"),
    ),
    support_claim_ids: v.array(v.string()),
    unlocked_ids: v.array(v.string()),
    // P1-1：对质回应消息指向被对质录音的来源 Message（服务器权威，CONTRACTS 8.2）。
    rebuttal_to_message_id: v.optional(v.string()),
    validation_json: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    if (!ticket || ticket.status !== "working") return; // 幂等：不重写终态

    const nowMs = Date.now();
    const messageId = newOpaqueId("msg-");

    // P1-2：持久化 Approved Speech Envelope（CONTRACTS 9 / 14）——
    // voice_id 来自案件公开 Role；TTS Route 只接受本信封。
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", ticket.session_id))
      .unique();
    const caseDoc = session
      ? await ctx.db
          .query("cases")
          .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
          .unique()
      : null;
    const casePublic = caseDoc?.public_json
      ? (JSON.parse(caseDoc.public_json) as {
          roles: { role_id: string; voice_id: string }[];
        })
      : null;
    const voiceId = casePublic?.roles.find(
      (role) => role.role_id === ticket.role_id,
    )?.voice_id;
    const envelope = approvedSpeechEnvelopePrivateSchema.parse({
      request_id: ticket.request_id,
      message_id: messageId,
      role_id: ticket.role_id,
      exact_text: args.speech,
      exact_text_sha256: `sha256:${await sha256Hex(args.speech)}`,
      support_claim_ids: args.support_claim_ids,
      validation_id: `val-${crypto.randomUUID()}`,
      ...(voiceId !== undefined && { voice_id: voiceId }),
    });

    const roleMessage = roleMessagePublicSchema.parse({
      message_id: messageId,
      session_id: ticket.session_id,
      speaker_type: "role",
      speaker_id: ticket.role_id,
      exact_text: args.speech,
      stance: args.stance,
      emotion: args.emotion,
      ...(args.rebuttal_to_message_id !== undefined && {
        rebuttal_to_message_id: args.rebuttal_to_message_id,
      }),
      created_at: new Date(nowMs).toISOString(),
    });
    await ctx.db.insert("messages", {
      session_id: ticket.session_id,
      message_id: messageId,
      payload_json: JSON.stringify(roleMessage),
      created_at_ms: nowMs,
    });
    const newlyUnlocked: string[] = [];
    for (const evidenceId of args.unlocked_ids) {
      const existing = await ctx.db
        .query("session_evidence_unlocked")
        .withIndex("by_session", (q) =>
          q
            .eq("session_id", ticket.session_id)
            .eq("evidence_id", evidenceId),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("session_evidence_unlocked", {
        session_id: ticket.session_id,
        evidence_id: evidenceId,
        via_kind: ticket.kind,
        unlocked_at_ms: nowMs,
      });
      newlyUnlocked.push(evidenceId);
    }
    if (newlyUnlocked.length > 0) {
      await insertEvent(ctx, ticket.session_id, {
        type: "evidence_unlocked",
        evidence_ids: newlyUnlocked,
      });
      await ctx.runMutation(internalApi.audit.recordInternal, {
        event: "evidence_unlock_evaluated",
        session_id: ticket.session_id,
        request_id: ticket.request_id,
        detail_code: `unlocked:${newlyUnlocked.length}`,
      });
    }
    await insertEvent(ctx, ticket.session_id, {
      type: "role_message_published",
      request_id: ticket.request_id,
      message_id: messageId,
      role_id: ticket.role_id,
    });
    await ctx.runMutation(internalApi.audit.recordInternal, {
      event: "role_turn_succeeded",
      session_id: ticket.session_id,
      request_id: ticket.request_id,
    });
    await ctx.db.patch(ticket._id, {
      status: "succeeded",
      message_json: JSON.stringify(roleMessage),
      unlocked_ids_json: JSON.stringify(newlyUnlocked),
      envelope_json: JSON.stringify(envelope),
      ...(args.validation_json !== undefined && {
        validation_json: args.validation_json,
      }),
      updated_at_ms: nowMs,
    });
  },
});

export const finalizeTurnFailure = internalMutation({
  args: { request_id: v.string(), failure_json: v.string() },
  handler: async (ctx, args) => {
    const failure = JSON.parse(args.failure_json) as PrivateFailure;
    // 私有失败 → 公开错误（CONTRACTS 13.3 角色回合列）。
    let publicError: { code: string; message: string };
    switch (failure.code) {
      case "MODEL_REQUEST_FAILED":
      case "MODEL_PROTOCOL_INVALID":
      case "VALIDATOR_REQUEST_FAILED":
      case "VALIDATOR_PROTOCOL_INVALID":
      case "VALIDATION_EXHAUSTED":
      case "DISTORTION_POLICY_VIOLATION":
      case "NEW_FACT_INTRODUCED":
      case "TURN_LEASE_EXPIRED":
        publicError = { code: "ROLE_TURN_FAILED", message: "角色回合失败，可稍后重试" };
        break;
      case "MODEL_CONFIG_MISSING":
        publicError = { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，暂无法进行角色回合" };
        break;
      default:
        publicError = { code: "INTERNAL_INCIDENT", message: "服务内部错误，本次回合未生效" };
    }
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    if (!ticket || ticket.status === "succeeded" || ticket.status === "failed") {
      return;
    }
    const nowMs = Date.now();
    await insertEvent(ctx, ticket.session_id, {
      type: "role_turn_failed",
      request_id: ticket.request_id,
      role_id: ticket.role_id,
      error: publicError,
    });
    await ctx.runMutation(internalApi.audit.recordInternal, {
      event: "role_turn_failed",
      session_id: ticket.session_id,
      request_id: ticket.request_id,
      detail_code: failure.code,
    });
    await ctx.db.patch(ticket._id, {
      status: "failed",
      error_json: JSON.stringify(publicError),
      updated_at_ms: nowMs,
    });
  },
});
