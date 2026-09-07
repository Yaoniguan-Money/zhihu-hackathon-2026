import { v } from "convex/values";
import { z } from "zod";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  finalAccusationSchema,
  gameEventPayloadSchema,
  revealResultSchema,
  type RevealResult,
} from "@contracts/public/index.js";
import {
  evidenceCatalogItemPrivateSchema,
  goldenAnswerPrivateSchema,
  evidenceGraphPrivateSchema,
  type PrivateFailure,
} from "@contracts/private/index.js";
import { sha256Hex } from "@server/cases/hash.js";
import { canonicalJson } from "@server/cases/idempotency.js";
import { ModelRequestFailedError } from "@server/model-gateway/openai-compatible-gateway.js";
import { modelGatewayFor } from "./aiRuntime";
import { ModelConfigMissingError as ConfigMissingError } from "@server/model-gateway/config.js";
import {
  REVEAL_SCHEMA_VERSION,
  revealExplanationModelSchema,
  revealSystemPrompt,
  revealUserPrompt,
} from "@server/model/schemas/reveal.js";
import { throwPublicError } from "./publicErrors.js";

/**
 * TB9：Final Accusation 与 Reveal（CONTRACTS 10，ENGINEERING_SPEC 5.5）。
 * 正确性、两项分数、truth chain、altered links 全部服务器确定；
 * Reveal 模型只产生解释与 Reality Mapping 候选（校验失败→整个 Reveal 失败）。
 * accuse 返回前完成完整持久化：judging（瞬态）→ revealed。
 */

const OPERATION_ACCUSE = "game.accuse";

interface AccusationInit {
  replayedFailure: boolean;
  result: { session_id: string; phase: string } | null;
  golden: {
    distortion_owner_role_id: string;
    answer_distortion_types: string[];
    truth_claim_ids: string[];
  } | null;
  playerCorrect: boolean;
  evidenceScore: number;
  questioningScore: number;
}
const uuidSchema = z.uuid();

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

export const accuseCore = internalAction({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    suspect_role_id: v.string(),
    distortion_types: v.array(v.string()),
    evidence_ids: v.array(v.string()),
    note: v.optional(v.string()),
    client_action_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identityToken = args.identity_token;
    const payloadHash = await sha256Hex(
      canonicalJson({
        session_id: args.session_id,
        suspect_role_id: args.suspect_role_id,
        distortion_types: [...args.distortion_types].sort(),
        evidence_ids: [...args.evidence_ids].sort(),
      }),
    );

    // 权威判定（幂等、Owner、阶段、指控校验、评分、judging）单事务完成；
    // 失败后的同 ID 重放返回同一失败（CONTRACTS 12）。
    const initialized: AccusationInit = await ctx.runMutation(
      internal.reveal.initializeAccusation,
      {
      identity_token: args.identity_token,
      session_id: args.session_id,
      client_action_id: args.client_action_id,
      payload_hash: payloadHash,
      suspect_role_id: args.suspect_role_id,
      distortion_types: args.distortion_types,
      evidence_ids: args.evidence_ids,
      note: args.note,
    });
    if (initialized.replayedFailure) {
      throwPublicError('REVEAL_FAILED', '真相揭晓失败，本局无法继续');
    }
    if (initialized.result) {
      return initialized.result;
    }
    const golden = initialized.golden;
    if (!golden) {
      throwPublicError('REVEAL_FAILED', '真相揭晓失败，本局无法继续');
    }

    try {
      const gateway = await modelGatewayFor(ctx);
      const context = await ctx.runQuery(internal.reveal.revealContextInternal, {
        session_id: args.session_id,
      });
      if (!context) {
        throwPublicError('REVEAL_FAILED', '真相揭晓失败，本局无法继续');
      }
      const explanation = await gateway.generateStructured({
        task: 'reveal',
        schemaName: REVEAL_SCHEMA_VERSION,
        system: revealSystemPrompt(),
        prompt: revealUserPrompt({
          correctRoleId: golden.distortion_owner_role_id,
          distortionTypes: golden.answer_distortion_types,
          truthChain: context.truthChain,
          playerCorrect: initialized.playerCorrect,
          accusedRoleId: args.suspect_role_id,
          accusedTypes: args.distortion_types,
          evidenceTitles: context.evidenceTitles,
          alteredLinks: context.alteredLinks,
        }),
        schema: revealExplanationModelSchema,
      });
      const claimIds = new Set(context.allClaimIds);
      if (!explanation.referenced_claim_ids.every((id) => claimIds.has(id))) {
        throwPublicError('REVEAL_FAILED', '真相揭晓失败，本局无法继续');
      }

      const reveal: RevealResult = revealResultSchema.parse({
        correct_role_id: golden.distortion_owner_role_id,
        distortion_types: golden.answer_distortion_types,
        player_correct: initialized.playerCorrect,
        truth_chain: golden.truth_claim_ids.map((claimId, index) => ({
          order: index + 1,
          claim_id: claimId,
          label: context.propositionById[claimId] ?? claimId,
        })),
        altered_links: context.alteredLinks.map((link: { original: string; distorted: string; distortion_type: string }) => ({
          original: link.original,
          distorted: link.distorted,
          distortion_type: link.distortion_type,
        })),
        evidence_score: initialized.evidenceScore,
        questioning_score: initialized.questioningScore,
        explanation: explanation.explanation,
        reality_mapping: explanation.reality_mapping,
      });

      await ctx.runMutation(internal.reveal.finalizeRevealed, {
        session_id: args.session_id,
        reveal_json: JSON.stringify(reveal),
        client_action_id: args.client_action_id,
        payload_hash: payloadHash,
      });
      return { session_id: args.session_id, phase: 'revealed' };
    } catch (error) {
      const failure: PrivateFailure =
        error instanceof ModelRequestFailedError
          ? error.failure
          : error instanceof ConfigMissingError
            ? error.failure
            : {
                code: 'REVEAL_JUDGE_FAILED',
                incident_id: `reveal:${args.client_action_id}`,
                detail: error instanceof Error ? error.message : '未知 Reveal 错误',
              };
      await ctx.runMutation(internal.reveal.failRevealInternal, {
        session_id: args.session_id,
        failure_code: failure.code,
        client_action_id: args.client_action_id,
        payload_hash: payloadHash,
      });
      throwPublicError('REVEAL_FAILED', '真相揭晓失败，本局无法继续');
    }
  },
});

export const initializeAccusation = internalMutation({
  args: {
    identity_token: v.string(),
    session_id: v.string(),
    client_action_id: v.string(),
    payload_hash: v.string(),
    suspect_role_id: v.string(),
    distortion_types: v.array(v.string()),
    evidence_ids: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AccusationInit> => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== args.identity_token) {
      throwPublicError("SESSION_NOT_FOUND", "对局不存在或不可访问");
    }

    // 幂等命中先于阶段校验：revealed 返回首次结果，失败返回同一失败。
    const existing = await ctx.db
      .query("idempotency_records")
      .withIndex("by_key", (q) =>
        q
          .eq("identity_token", args.identity_token)
          .eq("operation_name", OPERATION_ACCUSE)
          .eq("scope_id", args.session_id)
          .eq("client_action_id", args.client_action_id),
      )
      .unique();
    if (existing) {
      if (existing.payload_hash !== args.payload_hash) {
        throwPublicError("IDEMPOTENCY_CONFLICT", "同一操作 ID 已被不同内容使用");
      }
      const stored = JSON.parse(existing.result_json) as {
        failed?: boolean;
        session_id: string;
        phase: string;
      };
      if (stored.failed) {
        return {
          replayedFailure: true,
          result: null,
          golden: null,
          playerCorrect: false,
          evidenceScore: 0,
          questioningScore: 0,
        };
      }
      return {
        replayedFailure: false,
        result: { session_id: stored.session_id, phase: stored.phase },
        golden: null,
        playerCorrect: false,
        evidenceScore: 0,
        questioningScore: 0,
      };
    }

    if (session.phase !== "investigation") {
      throwPublicError("SESSION_PHASE_CONFLICT", "当前阶段不能提交指控");
    }

    const parsedAccusation = finalAccusationSchema.safeParse({
      suspect_role_id: args.suspect_role_id,
      distortion_types: args.distortion_types,
      evidence_ids: args.evidence_ids,
      ...(args.note !== undefined && { note: args.note }),
    });
    if (!parsedAccusation.success) {
      throwPublicError("INVALID_ARGUMENT", "指控结构不合法");
    }
    const accusation = parsedAccusation.data;

    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const privateDoc = caseDoc
      ? await ctx.db
          .query("case_private")
          .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
          .unique()
      : null;
    if (!caseDoc || !privateDoc) {
      throwPublicError("CASE_NOT_FOUND", "案件不存在或不可访问");
    }
    const casePublic = JSON.parse(caseDoc.public_json ?? "{}") as {
      roles: { role_id: string }[];
    };
    const golden = goldenAnswerPrivateSchema.parse(
      JSON.parse(privateDoc.golden_answer_json ?? "{}"),
    );

    if (!casePublic.roles.some((role) => role.role_id === accusation.suspect_role_id)) {
      throwPublicError("ROLE_NOT_FOUND", "角色不存在");
    }
    const unlockedRows = await ctx.db
      .query("session_evidence_unlocked")
      .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
      .collect();
    const unlockedSet = new Set(unlockedRows.map((row) => row.evidence_id));
    if (!accusation.evidence_ids.every((id) => unlockedSet.has(id))) {
      throwPublicError("EVIDENCE_UNAVAILABLE", "引用了尚未解锁的证据");
    }

    const scores = await ctx.runQuery(internal.reveal.computeScoresInternal, {
      session_id: args.session_id,
      case_key: session.case_id,
      evidence_ids: accusation.evidence_ids,
    });
    const playerCorrect =
      accusation.suspect_role_id === golden.distortion_owner_role_id &&
      accusation.distortion_types.length ===
        golden.answer_distortion_types.length &&
      [...accusation.distortion_types].sort().join("|") ===
        [...golden.answer_distortion_types].sort().join("|");
    // TB10：Reveal 判定审计（CONTRACTS 15）——只记录正确性与引用计数。
    await ctx.runMutation(internal.audit.recordInternal, {
      event: "reveal_judged",
      case_id: session.case_id,
      session_id: args.session_id,
      client_action_id: args.client_action_id,
      detail_code: playerCorrect ? "correct" : "incorrect",
    });

    // 进入 judging（瞬态）。
    await ctx.db.patch(session._id, {
      phase: "judging",
      submitted_accusation_json: JSON.stringify(accusation),
      updated_at_ms: Date.now(),
    });
    const last = await ctx.db
      .query("events")
      .withIndex("by_session_sequence", (q) =>
        q.eq("session_id", args.session_id),
      )
      .order("desc")
      .first();
    await ctx.db.insert("events", {
      session_id: args.session_id,
      sequence: (last?.sequence ?? 0) + 1,
      payload_json: JSON.stringify(
        gameEventPayloadSchema.parse({
          type: "accusation_submitted",
          accusation_id: `acc-${args.client_action_id}`,
        }),
      ),
      occurred_at_ms: Date.now(),
    });

    return {
      replayedFailure: false,
      result: null,
      golden: {
        distortion_owner_role_id: golden.distortion_owner_role_id,
        answer_distortion_types: golden.answer_distortion_types,
        truth_claim_ids: golden.truth_claim_ids,
      },
      playerCorrect,
      evidenceScore: scores.evidenceScore,
      questioningScore: scores.questioningScore,
    };
  },
});

export const getRevealInternal = internalQuery({
  args: { session_id: v.string(), identity_token: v.string() },
  handler: async (ctx, args): Promise<RevealResult | null> => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== args.identity_token) {
      return null;
    }
    if (session.phase !== "revealed" || !session.reveal_available) return null;
    const reveal = await ctx.db
      .query("reveals")
      .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
      .unique();
    if (!reveal) return null;
    return revealResultSchema.parse(JSON.parse(reveal.reveal_json));
  },
});

// ---------------------------------------------------------------------------
// 内部：评分、判定与状态迁移

export const computeScoresInternal = internalQuery({
  args: {
    session_id: v.string(),
    case_key: v.string(),
    evidence_ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", args.case_key))
      .unique();
    if (!privateDoc) return { evidenceScore: 0, questioningScore: 0 };
    const catalog = z
      .array(evidenceCatalogItemPrivateSchema)
      .parse(JSON.parse(privateDoc.catalog_json ?? "[]"));
    const rubric = JSON.parse(privateDoc.rubric_json ?? "{}") as {
      criteria?: {
        weight: number;
        allowed_types: string[];
        claim_ids: string[];
      }[];
    };
    const byId = new Map(catalog.map((item) => [item.evidence_id, item]));
    // P1-1：Recording Evidence 按其 type 与推导后的 public_claim_refs 参与命中
    //（CONTRACTS 6.1 / 10.1）。
    const recordings = await ctx.db
      .query("recordings")
      .withIndex("by_session_evidence", (q) =>
        q.eq("session_id", args.session_id),
      )
      .collect();
    for (const recording of recordings) {
      byId.set(recording.evidence_id, {
        evidence_id: recording.evidence_id,
        type: "quote",
        title: recording.title,
        body: recording.body,
        public_claim_refs: JSON.parse(recording.public_claim_refs_json),
        conflicts_with: [],
      });
    }
    let evidenceScore = 0;
    for (const criterion of rubric.criteria ?? []) {
      const hit = args.evidence_ids.some((id) => {
        const item = byId.get(id);
        return (
          item !== undefined &&
          criterion.allowed_types.includes(item.type) &&
          item.public_claim_refs.some((claim) =>
            criterion.claim_ids.includes(claim),
          )
        );
      });
      if (hit) evidenceScore += criterion.weight;
    }

    // questioning：覆盖每个不同 Role 首问 8 分（≤40）；同 Role 追问 10 分（≤30）；
    // 审讯产生新 Evidence 每次 10 分（≤30）。
    const tickets = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "succeeded"),
      )
      .collect();
    const perRole = new Map<string, number>();
    for (const ticket of tickets) {
      if (ticket.kind !== "ask") continue;
      perRole.set(ticket.role_id, (perRole.get(ticket.role_id) ?? 0) + 1);
    }
    const distinctRoles = perRole.size;
    const followUps = [...perRole.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    );
    const unlockedViaAsk = (
      await ctx.db
        .query("session_evidence_unlocked")
        .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
        .collect()
    ).filter((row) => row.via_kind === "ask").length;
    const questioningScore =
      Math.min(distinctRoles * 8, 40) +
      Math.min(followUps * 10, 30) +
      Math.min(unlockedViaAsk * 10, 30);
    return {
      evidenceScore: Math.min(evidenceScore, 100),
      questioningScore: Math.min(questioningScore, 100),
    };
  },
});

export const revealContextInternal = internalQuery({
  args: { session_id: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session) return null;
    const caseDoc = await ctx.db
      .query("cases")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    const privateDoc = await ctx.db
      .query("case_private")
      .withIndex("by_case_key", (q) => q.eq("case_key", session.case_id))
      .unique();
    if (!caseDoc || !privateDoc) return null;
    const graph = evidenceGraphPrivateSchema.parse(
      JSON.parse(privateDoc.graph_json),
    );
    const catalog = z
      .array(evidenceCatalogItemPrivateSchema)
      .parse(JSON.parse(privateDoc.catalog_json ?? "[]"));
    const propositionById: Record<string, string> = Object.fromEntries(
      graph.claims.map((claim) => [claim.claim_id, claim.proposition]),
    );
    const evidenceTitles = catalog.map((item) => item.title);

    // altered links：从成功回合的校验记录取被检出的篡改；original 取其
    // 引用的第一条事实命题（服务器可回溯，非模型输出）。
    const alteredLinks: {
      original: string;
      distorted: string;
      distortion_type: string;
    }[] = [];
    const tickets = await ctx.db
      .query("role_turn_tickets")
      .withIndex("by_session_status", (q) =>
        q.eq("session_id", args.session_id).eq("status", "succeeded"),
      )
      .collect();
    for (const ticket of tickets) {
      if (!ticket.validation_json || !ticket.message_json) continue;
      const validation = JSON.parse(ticket.validation_json) as {
        detected_distortion_types: string[];
        referenced_claim_ids: string[];
      };
      const message = JSON.parse(ticket.message_json);
      const original =
        propositionById[validation.referenced_claim_ids[0] ?? ""] ??
        "（见揭晓说明中的对应事实）";
      for (const type of validation.detected_distortion_types) {
        alteredLinks.push({
          original,
          distorted: message.exact_text,
          distortion_type: type,
        });
      }
    }
    const truthClaimIds = (
      JSON.parse(privateDoc.golden_answer_json ?? "{}") as {
        truth_claim_ids?: string[];
      }
    ).truth_claim_ids ?? [];
    const truthChain = truthClaimIds.map((claimId) => ({
      claim_id: claimId,
      proposition: propositionById[claimId] ?? claimId,
    }));
    return {
      truthChain,
      allClaimIds: graph.claims.map((claim) => claim.claim_id),
      propositionById,
      evidenceTitles,
      alteredLinks,
    };
  },
});

export const finalizeRevealed = internalMutation({
  args: {
    session_id: v.string(),
    reveal_json: v.string(),
    client_action_id: v.string(),
    payload_hash: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.phase === "revealed") return; // 幂等
    const reveal = revealResultSchema.parse(JSON.parse(args.reveal_json));
    const nowMs = Date.now();
    await ctx.db.insert("reveals", {
      session_id: args.session_id,
      reveal_json: JSON.stringify(reveal),
      created_at_ms: nowMs,
    });
    await ctx.db.patch(session._id, {
      phase: "revealed",
      reveal_available: true,
      updated_at_ms: nowMs,
    });
    await insertEvent(ctx, args.session_id, { type: "reveal_published" });
    await ctx.db.insert("idempotency_records", {
      identity_token: session.owner_identity,
      operation_name: OPERATION_ACCUSE,
      scope_id: args.session_id,
      client_action_id: args.client_action_id,
      payload_hash: args.payload_hash,
      result_json: JSON.stringify({
        session_id: args.session_id,
        phase: "revealed",
      }),
      created_at_ms: nowMs,
    });
  },
});

export const failRevealInternal = internalMutation({
  args: {
    session_id: v.string(),
    failure_code: v.string(),
    client_action_id: v.string(),
    payload_hash: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.phase === "revealed") return;
    const nowMs = Date.now();
    const publicError =
      args.failure_code === "MODEL_CONFIG_MISSING"
        ? { code: "SERVICE_NOT_CONFIGURED", message: "服务未配置，无法生成揭晓" }
        : { code: "REVEAL_FAILED", message: "真相揭晓失败，本局无法继续" };
    await ctx.db.patch(session._id, {
      phase: "failed",
      terminal_error_json: JSON.stringify(publicError),
      updated_at_ms: nowMs,
    });
    await insertEvent(ctx, args.session_id, {
      type: "session_failed",
      error: publicError,
    });
  },
});
