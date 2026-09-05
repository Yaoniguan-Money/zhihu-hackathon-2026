import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { z } from "zod";
import {
  action,
  internalMutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  boardLinkSchema,
  boardPlacementSchema,
  boardStateSchema,
  evidenceFragmentPublicSchema,
  type BoardState,
  type EvidenceFragmentPublic,
} from "@contracts/public/index.js";
import { clientActionIdSchema } from "@contracts/shared/index.js";
import { evidenceCatalogItemPrivateSchema } from "@contracts/private/index.js";
import { canonicalJson, sha256Hex } from "@server/cases/idempotency.js";
import { throwPublicError, convexErrorCode } from "./publicErrors.js";
import { gameEventPayloadSchema } from "@contracts/public/index.js";

/**
 * TB8：Evidence 与 Board（CONTRACTS 6 / 7.1 / 11 / 12）。
 * evidence.getAll 只投影当前 Session 已解锁 Evidence 的公开 Fragment；
 * 投影在服务端以 public schema 独立构造，不返回私有 Catalog 对象。
 * evidence.updateBoard 是带 expected_revision 的全量替换（CAS）：
 * 版本不一致返回 BOARD_REVISION_CONFLICT，不自动合并、不 last-write-wins。
 */

const OPERATION_UPDATE_BOARD = "evidence.updateBoard";

const updateBoardInputSchema = z.strictObject({
  session_id: z.string().min(1),
  placements: z.array(boardPlacementSchema),
  links: z.array(boardLinkSchema),
  expected_revision: z.number().int().min(0),
  client_action_id: clientActionIdSchema,
});

export const getAll = query({
  args: { session_id: v.string() },
  handler: async (ctx, args): Promise<EvidenceFragmentPublic[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    // 不存在与越权返回同一安全空数组（CONTRACTS 4.3，同 messages/events）。
    if (!session || session.owner_identity !== identity.tokenIdentifier) {
      return [];
    }
    const unlocked = await ctx.db
      .query("session_evidence_unlocked")
      .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
      .collect();
    if (unlocked.length === 0) return [];
    unlocked.sort((a, b) =>
      a.unlocked_at_ms === b.unlocked_at_ms
        ? a.evidence_id < b.evidence_id
          ? -1
          : 1
        : a.unlocked_at_ms - b.unlocked_at_ms,
    );
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const catalog = privateDoc?.catalog_json
      ? z
          .array(evidenceCatalogItemPrivateSchema)
          .parse(JSON.parse(privateDoc.catalog_json))
      : [];
    const byId = new Map(catalog.map((item) => [item.evidence_id, item]));
    const fragments: EvidenceFragmentPublic[] = [];
    for (const row of unlocked) {
      const item = byId.get(row.evidence_id);
      if (!item) {
        // 解锁记录只能来自引用 Catalog 条目的 Unlock Rule；出现悬空引用即内部不变量违规。
        throwPublicError(
          "INTERNAL_INCIDENT",
          "服务内部错误，本次查询未生效",
        );
      }
      fragments.push(
        evidenceFragmentPublicSchema.parse({
          evidence_id: item.evidence_id,
          type: item.type,
          title: item.title,
          body: item.body,
          public_claim_refs: item.public_claim_refs,
          conflicts_with: item.conflicts_with,
          unlocked_at: new Date(row.unlocked_at_ms).toISOString(),
        }),
      );
    }
    return fragments;
  },
});

export const updateBoard = action({
  args: {
    session_id: v.string(),
    placements: v.array(
      v.object({
        evidence_id: v.string(),
        lane: v.string(),
        x: v.number(),
        y: v.number(),
      }),
    ),
    links: v.array(
      v.object({
        link_id: v.string(),
        from_evidence_id: v.string(),
        to_evidence_id: v.string(),
        relation: v.string(),
      }),
    ),
    expected_revision: v.number(),
    client_action_id: v.string(),
  },
  handler: async (ctx, args): Promise<BoardState> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    try {
      return await ctx.runMutation(internal.evidence.updateBoardCore, {
        identity_token: identity.tokenIdentifier,
        ...args,
      });
    } catch (error) {
      // 拒绝类审计在 action 层落库：mutation 事务会随 throw 回滚，
      // 审计必须写入独立提交的事务（CONTRACTS 15 / SPEC 11）。
      const code = convexErrorCode(error);
      if (
        code === "BOARD_REVISION_CONFLICT" ||
        code === "IDEMPOTENCY_CONFLICT" ||
        code === "EVIDENCE_UNAVAILABLE"
      ) {
        await ctx.runMutation(internal.audit.recordInternal, {
          event:
            code === "BOARD_REVISION_CONFLICT"
              ? "board_revision_conflict"
              : code === "IDEMPOTENCY_CONFLICT"
                ? "idempotency_conflict"
                : "board_evidence_rejected",
          session_id: args.session_id,
          client_action_id: args.client_action_id,
          detail_code: code,
        });
      }
      throw error;
    }
  },
});

export const updateBoardCore = internalMutation({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    placements: v.array(
      v.object({
        evidence_id: v.string(),
        lane: v.string(),
        x: v.number(),
        y: v.number(),
      }),
    ),
    links: v.array(
      v.object({
        link_id: v.string(),
        from_evidence_id: v.string(),
        to_evidence_id: v.string(),
        relation: v.string(),
      }),
    ),
    expected_revision: v.number(),
    client_action_id: v.string(),
  },
  handler: async (ctx, args): Promise<BoardState> => {
    // client_action_id 属于输入 schema（缺失/非 UUID 一律 INVALID_ARGUMENT，CONTRACTS 12）
    const { identity_token: identityToken, ...input_args } = args;
    const parsed = updateBoardInputSchema.safeParse(input_args);
    if (!parsed.success) {
      throwPublicError("INVALID_ARGUMENT", "请求参数不合法");
    }
    const input = parsed.data;

    const payloadHash = await sha256Hex(
      canonicalJson({
        session_id: input.session_id,
        placements: input.placements,
        links: input.links,
        expected_revision: input.expected_revision,
      }),
    );

    // 幂等命中先于阶段校验（CONTRACTS 12）；重放返回首次保存的同一 BoardState。
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", identityToken)
          .eq("operation_name", OPERATION_UPDATE_BOARD)
          .eq("scope_id", input.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
      }
      return boardStateSchema.parse(JSON.parse(existing.result_json));
    }

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) =>
        q.eq("session_key", input.session_id),
      )
      .unique();
    if (!session || session.owner_identity !== identityToken) {
      throwPublicError("SESSION_NOT_FOUND", "对局不存在或不可访问");
    }
    // 阶段矩阵（CONTRACTS 7.1）：仅 investigation 允许 update_board。
    if (session.phase !== "investigation") {
      throwPublicError("SESSION_PHASE_CONFLICT", "当前阶段不能修改证据板");
    }

    const currentBoard = boardStateSchema.parse(
      JSON.parse(session.board_json),
    );
    // CAS：先于内容约束；基线过期时内容无关紧要。
    if (input.expected_revision !== currentBoard.revision) {
      throwPublicError("BOARD_REVISION_CONFLICT", "证据板已被修改，请刷新后重试");
    }

    const unlockedRows = await ctx.db
      .query("session_evidence_unlocked")
      .withIndex("by_session", (q) => q.eq("session_id", input.session_id))
      .collect();
    const unlocked = new Set(unlockedRows.map((row) => row.evidence_id));

    // Board 规则（CONTRACTS 6）：每个 Evidence 最多一个 placement；
    // Link 两端不同（schema 拒绝自连）且都已解锁、已放置。
    const placed = new Set<string>();
    for (const placement of input.placements) {
      if (placed.has(placement.evidence_id)) {
        throwPublicError("INVALID_ARGUMENT", "每个证据最多一个摆放");
      }
      placed.add(placement.evidence_id);
      if (!unlocked.has(placement.evidence_id)) {
        throwPublicError("EVIDENCE_UNAVAILABLE", "引用了尚未解锁的证据");
      }
    }
    const linkIds = new Set<string>();
    for (const link of input.links) {
      if (linkIds.has(link.link_id)) {
        throwPublicError("INVALID_ARGUMENT", "link_id 不得重复");
      }
      linkIds.add(link.link_id);
      if (!unlocked.has(link.from_evidence_id) || !unlocked.has(link.to_evidence_id)) {
        throwPublicError("EVIDENCE_UNAVAILABLE", "关联引用了尚未解锁的证据");
      }
      if (!placed.has(link.from_evidence_id) || !placed.has(link.to_evidence_id)) {
        throwPublicError("EVIDENCE_UNAVAILABLE", "关联两端必须已放置在证据板上");
      }
    }

    const nowMs = Date.now();
    const nextBoard = boardStateSchema.parse({
      session_id: input.session_id,
      revision: currentBoard.revision + 1,
      placements: input.placements,
      links: input.links,
      updated_at: new Date(nowMs).toISOString(),
    });
    await ctx.db.patch(session._id, {
      board_json: JSON.stringify(nextBoard),
      updated_at_ms: nowMs,
    });
    const last = await ctx.db
      .query("events")
      .withIndex("by_session_sequence", (q) =>
        q.eq("session_id", input.session_id),
      )
      .order("desc")
      .first();
    await ctx.db.insert("events", {
      session_id: input.session_id,
      sequence: (last?.sequence ?? 0) + 1,
      payload_json: JSON.stringify(
        gameEventPayloadSchema.parse({
          type: "board_updated",
          revision: nextBoard.revision,
        }),
      ),
      occurred_at_ms: nowMs,
    });
    await ctx.db.insert("idempotency_records", {
      identity_token: identityToken,
      operation_name: OPERATION_UPDATE_BOARD,
      scope_id: input.session_id,
      client_action_id: args.client_action_id,
      payload_hash: payloadHash,
      result_json: JSON.stringify(nextBoard),
      created_at_ms: nowMs,
    });
    return nextBoard;
  },
});
