import { v } from "convex/values";
import { z } from "zod";
import { mutation, query } from "./_generated/server";
import {
  gameEventPayloadSchema,
  sessionViewSchema,
  type SessionView,
} from "@contracts/public/index.js";
import { boardStateSchema } from "@contracts/public/index.js";
import {
  canonicalJson,
} from "@server/cases/idempotency.js";
import { sha256Hex } from "@server/cases/hash.js";
import { throwPublicError } from "./publicErrors.js";

/**
 * TB3：Session Authority（CONTRACTS 7 / 12）。
 * sessions.create 是纯服务端 mutation（无外部调用），幂等键
 * (operation_name, case_id, client_action_id) 命中先于阶段校验。
 * messages.listPublic 与 events.listPublic 分别在 messages.ts / events.ts。
 */

const uuidSchema = z.uuid();
const OPERATION_CREATE_SESSION = "sessions.create";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export const create = mutation({
  args: { case_id: v.string(), client_action_id: v.string() },
  handler: async (ctx, args): Promise<SessionView> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!uuidSchema.safeParse(args.client_action_id).success) {
      throwPublicError("INVALID_ARGUMENT", "client_action_id 必须是 UUID");
    }
    const identityToken = identity.tokenIdentifier;
    const nowMs = Date.now();

    // 幂等命中先于阶段/存在性校验（CONTRACTS 12）
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", identityToken)
          .eq("operation_name", OPERATION_CREATE_SESSION)
          .eq("scope_id", args.case_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== (await payloadHash(args.case_id))) {
        throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
      }
      return sessionViewSchema.parse(JSON.parse(existing.result_json));
    }

    // Case 必须存在且当前身份可读（系统案件可玩不消耗建案额度）。
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_id))
      .unique();
    if (
      !caseDoc ||
      (caseDoc.visibility === "user" &&
        caseDoc.owner_identity !== identityToken)
    ) {
      throwPublicError("CASE_NOT_FOUND", "案件不存在或不可访问");
    }
    if (caseDoc.status !== "ready") {
      throwPublicError("CASE_NOT_READY", "案件尚未就绪");
    }

    const sessionKey = crypto.randomUUID();
    const board = boardStateSchema.parse({
      session_id: sessionKey,
      revision: 0,
      placements: [],
      links: [],
      updated_at: iso(nowMs),
    });
    const view: SessionView = sessionViewSchema.parse({
      session_id: sessionKey,
      case_id: args.case_id,
      phase: "briefing",
      allowed_actions: ["start"],
      board,
      reveal_available: false,
      last_event_sequence: 1,
      created_at: iso(nowMs),
      updated_at: iso(nowMs),
    });

    await ctx.db.insert("sessions", {
      session_key: sessionKey,
      case_id: args.case_id,
      owner_identity: identityToken,
      phase: "briefing",
      board_json: JSON.stringify(board),
      reveal_available: false,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    await ctx.db.insert("events", {
      session_id: sessionKey,
      sequence: 1,
      payload_json: JSON.stringify(
        gameEventPayloadSchema.parse({ type: "session_created" }),
      ),
      occurred_at_ms: nowMs,
    });
    await ctx.db.insert("idempotency_records", {
      identity_token: identityToken,
      operation_name: OPERATION_CREATE_SESSION,
      scope_id: args.case_id,
      client_action_id: args.client_action_id,
      payload_hash: await payloadHash(args.case_id),
      result_json: JSON.stringify(view),
      created_at_ms: nowMs,
    });
    return view;
  },
});

/** sessions.create 的载荷哈希：内容仅 case_id，canonical JSON → SHA-256（CONTRACTS 12）。 */
async function payloadHash(caseId: string): Promise<string> {
  return sha256Hex(canonicalJson({ case_id: caseId }));
}

export const getPublic = query({
  args: { session_id: v.string() },
  handler: async (ctx, args): Promise<SessionView | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== identity.tokenIdentifier) {
      return null;
    }
    const board = boardStateSchema.parse(JSON.parse(session.board_json));
    const lastEvent = await ctx.db
      .query("events")
      .withIndex("by_session_sequence", (q) =>
        q.eq("session_id", args.session_id),
      )
      .order("desc")
      .first();
    const terminalError =
      session.phase === "failed" && session.terminal_error_json
        ? (JSON.parse(session.terminal_error_json) as {
            code: string;
            message: string;
          })
        : undefined;
    const submitted =
      session.submitted_accusation_json
        ? JSON.parse(session.submitted_accusation_json)
        : undefined;
    return sessionViewSchema.parse({
      session_id: session.session_key,
      case_id: session.case_id,
      phase: session.phase,
      allowed_actions: allowedActionsFor(session.phase),
      board,
      ...(submitted !== undefined && { submitted_accusation: submitted }),
      reveal_available: session.reveal_available,
      last_event_sequence: lastEvent?.sequence ?? 0,
      ...(terminalError !== undefined && { terminal_error: terminalError }),
      created_at: iso(session.created_at_ms),
      updated_at: iso(session.updated_at_ms),
    });
  },
});

/** 阶段 → 玩家可执行动作（CONTRACTS 7.1；save/present_recording 属 P1）。 */
function allowedActionsFor(phase: string): string[] {
  switch (phase) {
    case "briefing":
      return ["start"];
    case "investigation":
      return ["ask", "update_board", "accuse"];
    case "opening_statements":
    case "judging":
    case "revealed":
    case "failed":
      return [];
    default:
      return [];
  }
}
