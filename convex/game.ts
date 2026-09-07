import { v } from "convex/values";
import { z } from "zod";
import { action, mutation, query } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  gameEventPayloadSchema,
  revealResultSchema,
  roleMessagePublicSchema,
  type RevealResult,
} from "@contracts/public/index.js";
import {
  rolePrivatePolicySchema,
  evidenceGraphPrivateSchema,
  type PrivateFailure,
} from "@contracts/private/index.js";
import { sha256Hex } from "@server/cases/hash.js";
import { canonicalJson } from "@server/cases/idempotency.js";
import { ModelRequestFailedError } from "@server/model-gateway/openai-compatible-gateway.js";
import { ModelConfigMissingError as ConfigMissingError } from "@server/model-gateway/config.js";
import { modelGatewayFor } from "./aiRuntime";
import {
  runGenerationAttempts,
  type TurnAuditEvent,
} from "@server/turn-engine/run-turn.js";
import { internal as internalApi } from "./_generated/api";
import { throwPublicError, convexErrorCode } from "./publicErrors.js";

/**
 * TB7：game.start 与五条开场（CONTRACTS 11，ENGINEERING_SPEC 5.2）。
 * briefing → opening_statements：按 CasePublic.roles 固定顺序串行五条开场；
 * 一次只存在一个活动 Ticket：worker 成功后才创建下一条（禁止预建队列）；
 * 五条全部批准才进入 investigation；任一失败 Session 进入 failed，历史保留。
 * TB10：开场 Ticket 同样持有 lease 并写入私有审计。
 */

const OPERATION_START = "game.start";
const uuidSchema = z.uuid();
const TICKET_LEASE_MS = 10 * 60_000;

async function insertEvent(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
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
}

export const start = mutation({
  args: { session_id: v.string(), client_action_id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    const identityToken = identity.tokenIdentifier;
    const payloadHash = await sha256Hex(
      canonicalJson({ session_id: args.session_id }),
    );

    // 幂等命中先于阶段校验：失败后的同 ID 重放返回首次结果。
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", identityToken)
          .eq("operation_name", OPERATION_START)
          .eq("scope_id", args.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
      }
      return JSON.parse(existing.result_json) as {
        session_id: string;
        phase: string;
      };
    }

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== identityToken) {
      throwPublicError("SESSION_NOT_FOUND", "对局不存在或不可访问");
    }
    if (session.phase !== "briefing") {
      throwPublicError("SESSION_PHASE_CONFLICT", "当前阶段不能开始游戏");
    }

    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const casePublic = caseDoc?.public_json
      ? (JSON.parse(caseDoc.public_json) as { roles: { role_id: string }[] })
      : null;
    if (!casePublic || casePublic.roles.length !== 5) {
      throwPublicError("CASE_NOT_READY", "案件尚未就绪");
    }

    const nowMs = Date.now();
    await ctx.db.patch(session._id, {
      phase: "opening_statements",
      updated_at_ms: nowMs,
    });
    await insertEvent(ctx, args.session_id, { type: "game_started" });

    // 第一条开场 Ticket；后续由 worker 链式创建（一次只有一个活动 Ticket）。
    const requestId = `req-${crypto.randomUUID()}`;
    await ctx.db.insert("role_turn_tickets", {
      request_id: requestId,
      session_id: args.session_id,
      role_id: casePublic.roles[0]!.role_id,
      kind: "opening_statement",
      status: "accepted",
      lease_expires_at_ms: nowMs + TICKET_LEASE_MS,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });

    const result = { session_id: args.session_id, phase: "opening_statements" };
    await ctx.db.insert("idempotency_records", {
      identity_token: identityToken,
      operation_name: OPERATION_START,
      scope_id: args.session_id,
      client_action_id: args.client_action_id,
      payload_hash: payloadHash,
      result_json: JSON.stringify(result),
      created_at_ms: nowMs,
    });
    await ctx.scheduler.runAfter(0, internal.game.openingWorker, {
      request_id: requestId,
      role_index: 0,
    });
    return result;
  },
});

// ---------------------------------------------------------------------------
// 内部：开场 Ticket 链与 worker

export const openingTicketFor = internalMutation({
  args: { session_id: v.string(), role_index: v.number() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.phase !== "opening_statements") {
      return null; // Session 已终结或被推进：不再创建
    }
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const casePublic = caseDoc?.public_json
      ? (JSON.parse(caseDoc.public_json) as { roles: { role_id: string }[] })
      : null;
    const role = casePublic?.roles[args.role_index];
    if (!role) return null;
    const nowMs = Date.now();
    const requestId = `req-${crypto.randomUUID()}`;
    await ctx.db.insert("role_turn_tickets", {
      request_id: requestId,
      session_id: args.session_id,
      role_id: role.role_id,
      kind: "opening_statement",
      status: "accepted",
      lease_expires_at_ms: nowMs + TICKET_LEASE_MS,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    await ctx.scheduler.runAfter(0, internal.game.openingWorker, {
      request_id: requestId,
      role_index: args.role_index,
    });
    return { request_id: requestId };
  },
});

export const openingContextInternal = internalQuery({
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
    if (!caseDoc?.public_json) return null;
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
    const casePublic = JSON.parse(caseDoc.public_json) as {
      roles: { role_id: string; display_name: string }[];
    };
    const displayName =
      casePublic.roles.find((role) => role.role_id === ticket.role_id)
        ?.display_name ?? ticket.role_id;
    const historyDocs = await ctx.db
      .query("messages")
      .withIndex("by_session_created", (q) =>
        q.eq("session_id", ticket.session_id),
      )
      .order("asc")
      .collect();
    const history = historyDocs.map((doc) => {
      const message = JSON.parse(doc.payload_json);
      const speaker =
        message.speaker_type === "player" ? "玩家" : message.speaker_id;
      return `${speaker}: ${message.exact_text}`;
    });
    return {
      session_id: ticket.session_id,
      case_id: session.case_id,
      role_id: ticket.role_id,
      displayName,
      policy,
      visibleClaims: graph.claims
        .filter((claim) => policy.visible_claim_ids.includes(claim.claim_id))
        .map((claim) => ({ claim_id: claim.claim_id, proposition: claim.proposition })),
      history,
    };
  },
});

function toPrivateFailure(error: unknown): PrivateFailure {
  if (error instanceof ModelRequestFailedError) return error.failure;
  if (error instanceof ConfigMissingError) return error.failure;
  return {
    code: "INTERNAL_INVARIANT_VIOLATION",
    incident_id: `opening:${Date.now().toString(36)}`,
    detail: error instanceof Error ? error.message : "未知开场错误",
  };
}

function openingFailurePublic(code: string): {
  code: string;
  message: string;
} {
  if (code === "MODEL_CONFIG_MISSING") {
    return { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，暂无法开始游戏" };
  }
  if (code === "INTERNAL_INVARIANT_VIOLATION") {
    return { code: "INTERNAL_INCIDENT", message: "服务内部错误，本次开始未生效" };
  }
  return { code: "ROLE_TURN_FAILED", message: "开场陈述失败，本局无法继续" };
}

export const openingWorker = internalAction({
  args: { request_id: v.string(), role_index: v.number() },
  handler: async (ctx, args) => {
    const accepted = await ctx.runQuery(internal.roleTurns.ticketInternal, {
      request_id: args.request_id,
    });
    if (!accepted) return;
    const context = await ctx.runQuery(internal.game.openingContextInternal, {
      request_id: args.request_id,
    });
    if (!context) {
      await failSessionAndTicket(ctx, args, {
        code: "INTERNAL_INVARIANT_VIOLATION",
        incident_id: `opening:${args.request_id}`,
        detail: "开场上下文缺失",
      });
      return;
    }
    await ctx.runMutation(internal.roleTurns.markTurnWorking, {
      request_id: args.request_id,
    });

    const emitTurnAudit = async (event: TurnAuditEvent): Promise<void> => {
      await ctx.runMutation(internalApi.audit.recordInternal, {
        event: event.type,
        case_id: context.case_id,
        session_id: context.session_id,
        request_id: args.request_id,
        ...("task" in event ? { task: event.task } : {}),
        ...("attempt_index" in event
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
      const gateway = await modelGatewayFor(ctx);
      const outcome = await runGenerationAttempts(
        gateway,
        {
          policy: context.policy,
          displayName: context.displayName,
          visibleClaims: context.visibleClaims,
          history: context.history,
          question: "（开场陈述）请向玩家做一段符合你身份与立场的开场陈述。",
          mode: "opening",
          incidentRef: args.request_id,
        },
        emitTurnAudit,
      );
      if (!outcome.ok) {
        await failSessionAndTicket(ctx, args, outcome.failure);
        return;
      }

      const nowMs = Date.now();
      const messageId = `msg-${crypto.randomUUID()}`;
      const roleMessage = roleMessagePublicSchema.parse({
        message_id: messageId,
        session_id: context.session_id,
        speaker_type: "role",
        speaker_id: context.role_id,
        exact_text: outcome.candidate.speech,
        stance: outcome.candidate.stance,
        emotion: outcome.candidate.emotion,
        created_at: new Date(nowMs).toISOString(),
      });
      const unlocked = await ctx.runQuery(internal.roleTurns.computeUnlocksInternal, {
        session_id: context.session_id,
        case_id: context.case_id,
        role_id: context.role_id,
        support_claim_ids: outcome.candidate.support_claim_ids,
      });
      await ctx.runMutation(internal.roleTurns.finalizeTurnSuccess, {
        request_id: args.request_id,
        speech: outcome.candidate.speech,
        stance: outcome.candidate.stance,
        emotion: outcome.candidate.emotion,
        support_claim_ids: outcome.candidate.support_claim_ids,
        unlocked_ids: unlocked,
        validation_json: JSON.stringify({
          status: outcome.validation.status,
          detected_distortion_types: outcome.validation.detected_distortion_types,
          unsupported_spans: outcome.validation.unsupported_spans,
          referenced_claim_ids: outcome.validation.referenced_claim_ids,
          support_claim_ids: outcome.candidate.support_claim_ids,
        }),
      });

      if (args.role_index + 1 < 5) {
        await ctx.runMutation(internal.game.openingTicketFor, {
          session_id: context.session_id,
          role_index: args.role_index + 1,
        });
      } else {
        await ctx.runMutation(internal.game.enterInvestigation, {
          session_id: context.session_id,
        });
      }
      void roleMessage;
    } catch (error) {
      await failSessionAndTicket(ctx, args, toPrivateFailure(error));
    }
  },
});

async function failSessionAndTicket(
  ctx: {
    runMutation: import("./_generated/server").ActionCtx["runMutation"];
  },
  args: { request_id: string; role_index: number },
  failure: PrivateFailure,
): Promise<void> {
  const publicError = openingFailurePublic(failure.code);
  await ctx.runMutation(internal.roleTurns.finalizeTurnFailure, {
    request_id: args.request_id,
    failure_json: JSON.stringify(failure),
  });
  await ctx.runMutation(internal.game.failSessionInternal, {
    request_id: args.request_id,
    public_error_json: JSON.stringify(publicError),
  });
}

export const failSessionInternal = internalMutation({
  args: { request_id: v.string(), public_error_json: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_request_id", (q) => q.eq("request_id", args.request_id))
      .unique();
    if (!ticket) return;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", ticket.session_id))
      .unique();
    if (!session) return;
    if (session.phase === "failed") return; // 幂等
    const publicError = JSON.parse(args.public_error_json);
    const nowMs = Date.now();
    await ctx.db.patch(session._id, {
      phase: "failed",
      terminal_error_json: JSON.stringify(publicError),
      updated_at_ms: nowMs,
    });
    await insertEvent(ctx, session.session_key, {
      type: "session_failed",
      error: publicError,
    });
  },
});

export const enterInvestigation = internalMutation({
  args: { session_id: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.phase !== "opening_statements") return; // 幂等
    await ctx.db.patch(session._id, {
      phase: "investigation",
      updated_at_ms: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// TB9 公开入口：game.accuse / game.getReveal（实现见 reveal.ts）

export const accuse = action({
  args: {
    session_id: v.string(),
    suspect_role_id: v.string(),
    distortion_types: v.array(v.string()),
    evidence_ids: v.array(v.string()),
    note: v.optional(v.string()),
    client_action_id: v.string(),
  },
  handler: async (ctx, args): Promise<{ session_id: string; phase: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    try {
      return await ctx.runAction(internal.reveal.accuseCore, {
        identity_token: identity.tokenIdentifier,
        session_id: args.session_id,
        suspect_role_id: args.suspect_role_id,
        distortion_types: args.distortion_types,
        evidence_ids: args.evidence_ids,
        note: args.note,
        client_action_id: args.client_action_id,
      });
    } catch (error) {
      // Reveal gate 拒绝审计（SPEC 11）：action 层独立事务落库。
      const code = convexErrorCode(error);
      if (
        code === "SESSION_PHASE_CONFLICT" ||
        code === "EVIDENCE_UNAVAILABLE" ||
        code === "ROLE_NOT_FOUND"
      ) {
        await ctx.runMutation(internal.audit.recordInternal, {
          event: "reveal_gate_rejected",
          session_id: args.session_id,
          client_action_id: args.client_action_id,
          detail_code: code,
        });
      }
      throw error;
    }
  },
});

export const getReveal = query({
  args: { session_id: v.string() },
  handler: async (ctx, args): Promise<RevealResult | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    return ctx.runQuery(internal.reveal.getRevealInternal, {
      session_id: args.session_id,
      identity_token: identity.tokenIdentifier,
    });
  },
});
