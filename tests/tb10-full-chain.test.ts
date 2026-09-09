import { describe, expect, test, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTurnTerminal,
} from "./helpers/convex-local.js";
import { clearUserModelConfig } from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * TB10：P0 全链证明（默认无模型、确定性）。
 * 覆盖：并发 CAS、排他锁 BUSY、lease 过期显式失败、写接口幂等 sweep、
 * 公开表面泄漏扫描、刷新恢复（事件连续序列 + SessionView 一致）、
 * 私有审计事件与聚合指标（CONTRACTS 15 / SPEC 8 / 11）。
 * AI_* 在 beforeAll 中从部署移除：角色回合 worker 确定性走
 * MODEL_CONFIG_MISSING → SERVICE_NOT_CONFIGURED，不消耗真实模型。
 */

const GOLDEN = "case-demo-001";
const AI_KEYS = [
  "AI_PROVIDER_NAME",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_CLAIM_MODEL",
  "AI_CASE_MODEL",
  "AI_ROLE_MODEL",
  "AI_VALIDATOR_MODEL",
  "AI_REVEAL_MODEL",
] as const;

function uuid(): string {
  return crypto.randomUUID();
}

function removeAiEnv(): void {
  const cli = join(import.meta.dir, "..", "node_modules", "convex", "bin", "main.js");
  for (const key of AI_KEYS) {
    try {
      spawnSync(process.execPath, [cli, "env", "remove", key], {
        cwd: join(import.meta.dir, ".."),
        env: process.env,
        encoding: "utf8",
      });
    } catch {
      // 移除失败只影响可确定性，不阻塞测试。
    }
  }
}

interface BoardStateLike {
  session_id: string;
  revision: number;
  placements: unknown[];
  links: unknown[];
}

async function createInvestigationSession(
  token: string,
  evidenceIds: string[] = [],
): Promise<string> {
  const created = await callConvex<{ session_id: string }>(
    "mutation",
    "sessions:create",
    { case_id: GOLDEN, client_action_id: uuid() },
    { bearer: token },
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(errorText(created));
  const sessionId = created.value.session_id;
  const forced = await callConvex(
    "mutation",
    "admin:forcePhase",
    { session_key: sessionId, phase: "investigation" },
    { admin: true },
  );
  expect(forced.ok).toBe(true);
  if (evidenceIds.length > 0) {
    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: evidenceIds },
      { admin: true },
    );
  }
  return sessionId;
}

describe("TB10 P0 全链证明（本地后端，无模型）", () => {
  test("前置：清空 AI 供应商注册表覆盖层", async () => {
    expect(await clearUserModelConfig(await signInAnonymous())).toBe(true);
  });
  beforeAll(async () => {
    removeAiEnv();
    await seedGoldenCaseViaAdmin();
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
  }, 120_000);

  test("并发 CAS：同 revision 并发提交，恰好一成一冲突", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token, ["ev-meta-quote"]);

    const [a, b] = await Promise.all([
      callConvex<BoardStateLike>(
        "action",
        "evidence:updateBoard",
        {
          session_id: sessionId,
          placements: [
            { evidence_id: "ev-meta-quote", lane: "source", x: 0.1, y: 0.1 },
          ],
          links: [],
          expected_revision: 0,
          client_action_id: uuid(),
        },
        { bearer: token },
      ),
      callConvex<BoardStateLike>(
        "action",
        "evidence:updateBoard",
        {
          session_id: sessionId,
          placements: [
            {
              evidence_id: "ev-meta-quote",
              lane: "retelling",
              x: 0.9,
              y: 0.9,
            },
          ],
          links: [],
          expected_revision: 0,
          client_action_id: uuid(),
        },
        { bearer: token },
      ),
    ]);
    const outcomes = [a, b];
    const succeeded = outcomes.filter((r) => r.ok);
    const conflicted = outcomes.filter(
      (r) => !r.ok && errorText(r).includes("BOARD_REVISION_CONFLICT"),
    );
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);
    if (succeeded[0]!.ok) {
      expect(succeeded[0]!.value.revision).toBe(1);
    }

    const view = await callConvex<{ board: BoardStateLike }>(
      "query",
      "sessions:getPublic",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(view.ok).toBe(true);
    if (view.ok) expect(view.value.board.revision).toBe(1);
  });

  test("排他锁：活动 Ticket 期间 ask 立即 BUSY，且不落玩家消息", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);
    const seeded = await callConvex<{ request_id: string }>(
      "mutation",
      "admin:seedActiveTicket",
      { session_id: sessionId },
      { admin: true },
    );
    expect(seeded.ok).toBe(true);

    const busy = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "gentle",
        text: "请说明你的立场。",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(busy.ok).toBe(false);
    expect(errorText(busy)).toContain("ROLE_TURN_BUSY");

    const messages = await callConvex<unknown[]>(
      "query",
      "messages:listPublic",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(messages.ok).toBe(true);
    if (messages.ok) expect(messages.value).toHaveLength(0);
  });

  test("lease 过期：过期锁显式失败（ROLE_TURN_FAILED）并释放，不自动重调模型", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);
    const seeded = await callConvex<{ request_id: string }>(
      "mutation",
      "admin:seedActiveTicket",
      { session_id: sessionId, lease_expires_at_ms: Date.now() - 1000 },
      { admin: true },
    );
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    const staleRequestId = seeded.value.request_id;

    // 新 ask 成功：过期锁被清扫
    const asked = await callConvex<{ request_id: string }>(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "gentle",
        text: "过期锁应已释放。",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(asked.ok).toBe(true);

    // 过期 Ticket 显式失败（公开仅 ROLE_TURN_FAILED）
    const stale = await callConvex<{
      status: string;
      error?: { code: string };
    }>(
      "query",
      "roleTurns:observe",
      { request_id: staleRequestId },
      { bearer: token },
    );
    expect(stale.ok).toBe(true);
    if (stale.ok && stale.value) {
      expect(stale.value.status).toBe("failed");
      expect(stale.value.error?.code).toBe("ROLE_TURN_FAILED");
    }

    // 新 Ticket 的 worker 无模型配置 → 确定性失败 SERVICE_NOT_CONFIGURED
    if (asked.ok) {
      const turn = await waitForTurnTerminal(
        token,
        asked.value.request_id,
        30_000,
      );
      expect(turn.status).toBe("failed");
      expect(turn.error?.code).toBe("SERVICE_NOT_CONFIGURED");
    }
  });

  test("幂等 sweep：create/updateBoard 同键同哈希返回首次结果，异载荷冲突", async () => {
    const token = await signInAnonymous();
    const actionId = uuid();
    const first = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: actionId },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    const replay = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: actionId },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (first.ok && replay.ok) {
      expect(replay.value.session_id).toBe(first.value.session_id);
    }
    if (!first.ok) return;
    const sessionId = first.value.session_id;
    await callConvex(
      "mutation",
      "admin:forcePhase",
      { session_key: sessionId, phase: "investigation" },
      { admin: true },
    );
    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: ["ev-meta-quote"] },
      { admin: true },
    );

    const boardActionId = uuid();
    const placements = [
      { evidence_id: "ev-meta-quote", lane: "source", x: 0.3, y: 0.3 },
    ];
    const boardA = await callConvex<BoardStateLike>(
      "action",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements,
        links: [],
        expected_revision: 0,
        client_action_id: boardActionId,
      },
      { bearer: token },
    );
    expect(boardA.ok).toBe(true);
    const boardB = await callConvex<BoardStateLike>(
      "action",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements,
        links: [],
        expected_revision: 0,
        client_action_id: boardActionId,
      },
      { bearer: token },
    );
    expect(boardB.ok).toBe(true);
    if (boardA.ok && boardB.ok) {
      expect(boardB.value).toEqual(boardA.value);
    }
    const boardC = await callConvex(
      "action",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "timeline", x: 0.8, y: 0.8 },
        ],
        links: [],
        expected_revision: 0,
        client_action_id: boardActionId,
      },
      { bearer: token },
    );
    expect(boardC.ok).toBe(false);
    expect(errorText(boardC)).toContain("IDEMPOTENCY_CONFLICT");
  });

  test("泄漏扫描与刷新恢复：公开表面无私有字段，事件序列连续，SessionView 一致", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token, [
      "ev-meta-quote",
      "ev-gatekeeper-condition",
    ]);
    const board = await callConvex<BoardStateLike>(
      "action",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.2, y: 0.2 },
          {
            evidence_id: "ev-gatekeeper-condition",
            lane: "condition",
            x: 0.7,
            y: 0.6,
          },
        ],
        links: [
          {
            link_id: "ln-1",
            from_evidence_id: "ev-meta-quote",
            to_evidence_id: "ev-gatekeeper-condition",
            relation: "contradicts",
          },
        ],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(board.ok).toBe(true);

    // 公开表面泄漏扫描
    const surfaces = await Promise.all([
      callConvex("query", "sessions:getPublic", { session_id: sessionId }, { bearer: token }),
      callConvex("query", "messages:listPublic", { session_id: sessionId }, { bearer: token }),
      callConvex("query", "events:listPublic", { session_id: sessionId, after_sequence: 0 }, { bearer: token }),
      callConvex("query", "evidence:getAll", { session_id: sessionId }, { bearer: token }),
      callConvex("query", "cases:getSource", { case_id: GOLDEN }, { bearer: token }),
      callConvex("query", "cases:getPublic", { case_id: GOLDEN }, { bearer: token }),
    ]);
    const PRIVATE_MARKERS = [
      "fidelity",
      "visible_claim_ids",
      "support_claim_ids",
      "golden_answer",
      "distortion_owner_role_id",
      "rubric",
      "validation_",
      "allowed_distortion_types",
      "role_policies",
      "evidence_unlock_rules",
      "lease_expires_at_ms",
    ];
    for (const surface of surfaces) {
      const raw = JSON.stringify(surface);
      for (const marker of PRIVATE_MARKERS) {
        expect(raw).not.toContain(marker);
      }
    }

    // 恢复：事件 sequence 从 1 开始连续；last_event_sequence 与最大 sequence 一致
    const events = surfaces[2];
    expect(events!.ok).toBe(true);
    if (!events!.ok) return;
    const eventRows = (
      events!.value as { sequence: number; payload: { type: string } }[]
    );
    expect(eventRows.length).toBeGreaterThan(0);
    eventRows.forEach((event, index) => {
      expect(event.sequence).toBe(index + 1);
    });
    const view = surfaces[0];
    expect(view!.ok).toBe(true);
    if (!view!.ok) return;
    const sessionView = view!.value as {
      last_event_sequence: number;
      board: BoardStateLike;
      phase: string;
      allowed_actions: string[];
    };
    expect(sessionView.last_event_sequence).toBe(
      eventRows[eventRows.length - 1]!.sequence,
    );
    if (board.ok) {
      expect(sessionView.board.revision).toBe((board.value as BoardStateLike).revision);
      expect(sessionView.board.placements).toHaveLength(2);
    }
    expect(sessionView.phase).toBe("investigation");
    expect(sessionView.allowed_actions).toEqual([
      "ask",
      "update_board",
      "accuse",
    ]);
  });

  test("审计聚合：busy/revision 冲突/幂等冲突/lease 过期/回合失败均有计数", async () => {
    const metrics = await callConvex<{
      total: number;
      event_counts: Record<string, number>;
    }>("query", "audit:metricsInternal", {}, { admin: true });
    expect(metrics.ok).toBe(true);
    if (!metrics.ok) return;
    const counts = metrics.value.event_counts;
    expect(metrics.value.total).toBeGreaterThan(0);
    for (const event of [
      "role_turn_busy",
      "board_revision_conflict",
      "idempotency_conflict",
      "turn_lease_expired",
      "role_turn_failed",
    ]) {
      expect(counts[event] ?? 0).toBeGreaterThan(0);
    }
    // 回合失败审计的 detail_code 是私有失败码（MODEL_CONFIG_MISSING），
    // 成功回合的 evidence_unlock_evaluated / role_turn_succeeded 由模型套件覆盖。
  });
});
