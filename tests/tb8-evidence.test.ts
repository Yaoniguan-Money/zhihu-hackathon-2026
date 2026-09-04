import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
} from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * TB8 集成（默认无模型）：evidence.getAll / evidence.updateBoard、
 * Board CAS、SessionView 动态 allowed_actions 与 active_role_turn_request_id。
 * 证据解锁状态由 admin:seedUnlockedEvidence 直接构造（生产路径只能由
 * 服务器经 Unlock Rule 计算，见 convex/roleTurns.ts computeUnlocksInternal）。
 */

const GOLDEN = "case-demo-001";

function uuid(): string {
  return crypto.randomUUID();
}

interface BoardStateLike {
  session_id: string;
  revision: number;
  placements: { evidence_id: string; lane: string; x: number; y: number }[];
  links: {
    link_id: string;
    from_evidence_id: string;
    to_evidence_id: string;
    relation: string;
  }[];
  updated_at: string;
}

async function createSession(token: string): Promise<string> {
  const created = await callConvex<{ session_id: string }>(
    "mutation",
    "sessions:create",
    { case_id: GOLDEN, client_action_id: uuid() },
    { bearer: token },
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(errorText(created));
  return created.value.session_id;
}

async function forceInvestigation(sessionId: string): Promise<void> {
  const result = await callConvex(
    "mutation",
    "admin:forcePhase",
    { session_key: sessionId, phase: "investigation" },
    { admin: true },
  );
  expect(result.ok).toBe(true);
}

describe("TB8 Evidence 与 Board（本地后端，无模型）", () => {
  beforeAll(async () => {
    await seedGoldenCaseViaAdmin();
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
  });

  test("evidence.getAll：AUTH_REQUIRED / 安全空数组 / Catalog 投影与泄漏扫描", async () => {
    const noAuth = await callConvex(
      "query",
      "evidence:getAll",
      { session_id: "s" },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const missing = await callConvex(
      "query",
      "evidence:getAll",
      { session_id: "no-such-session" },
      { bearer: token },
    );
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value).toEqual([]);

    const sessionId = await createSession(token);
    const empty = await callConvex<{ length: number }>(
      "query",
      "evidence:getAll",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value).toEqual([]);

    const seeded = await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      {
        session_id: sessionId,
        evidence_ids: ["ev-gatekeeper-condition", "ev-meta-quote"],
      },
      { admin: true },
    );
    expect(seeded.ok).toBe(true);

    const fragments = await callConvex<
      {
        evidence_id: string;
        type: string;
        title: string;
        body: string;
        public_claim_refs: string[];
        conflicts_with: string[];
        unlocked_at: string;
      }[]
    >("query", "evidence:getAll", { session_id: sessionId }, { bearer: token });
    expect(fragments.ok).toBe(true);
    if (!fragments.ok) return;
    // 同毫秒解锁按 evidence_id 字典序稳定排序
    expect(fragments.value.map((f) => f.evidence_id)).toEqual([
      "ev-gatekeeper-condition",
      "ev-meta-quote",
    ]);
    const meta = fragments.value.find((f) => f.evidence_id === "ev-meta-quote")!;
    expect(meta.type).toBe("quote");
    expect(meta.title).toBe("Meta 裁员数据");
    expect(meta.public_claim_refs).toEqual(["cl-004"]);
    expect(meta.conflicts_with).toEqual([]);
    expect(meta.unlocked_at).toContain("T");

    // 公开投影不得携带私有字段（CONTRACTS 1 / 6）
    const raw = JSON.stringify(fragments.value);
    expect(raw).not.toContain("fidelity");
    expect(raw).not.toContain("visible_claim_ids");
    expect(raw).not.toContain("support_claim_ids");

    // 越权与不存在同一安全结果（CONTRACTS 4.3）
    const other = await signInAnonymous();
    const foreign = await callConvex(
      "query",
      "evidence:getAll",
      { session_id: sessionId },
      { bearer: other },
    );
    expect(foreign.ok).toBe(true);
    if (foreign.ok) expect(foreign.value).toEqual([]);
  });

  test("updateBoard：鉴权与输入 schema 拒绝（UUID/lane/坐标/自连/重复 placement）", async () => {
    const noAuth = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: "s",
        placements: [],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const sessionId = await createSession(token);
    await forceInvestigation(sessionId);

    const badUuid = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [],
        links: [],
        expected_revision: 0,
        client_action_id: "nope",
      },
      { bearer: token },
    );
    expect(badUuid.ok).toBe(false);
    expect(errorText(badUuid)).toContain("INVALID_ARGUMENT");

    const badLane = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "nonsense", x: 0.1, y: 0.1 },
        ],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(badLane.ok).toBe(false);
    expect(errorText(badLane)).toContain("INVALID_ARGUMENT");

    const outOfRange = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 1.5, y: 0.1 },
        ],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(outOfRange.ok).toBe(false);
    expect(errorText(outOfRange)).toContain("INVALID_ARGUMENT");

    const selfLink = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.1, y: 0.1 },
        ],
        links: [
          {
            link_id: "ln-1",
            from_evidence_id: "ev-meta-quote",
            to_evidence_id: "ev-meta-quote",
            relation: "supports",
          },
        ],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(selfLink.ok).toBe(false);
    expect(errorText(selfLink)).toContain("INVALID_ARGUMENT");

    // 重复 placement 属结构不合法（与解锁状态无关的检查需先解锁该证据）
    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: ["ev-meta-quote"] },
      { admin: true },
    );
    const duplicate = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.1, y: 0.1 },
          { evidence_id: "ev-meta-quote", lane: "retelling", x: 0.4, y: 0.4 },
        ],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(duplicate.ok).toBe(false);
    expect(errorText(duplicate)).toContain("INVALID_ARGUMENT");
  });

  test("updateBoard：SESSION_NOT_FOUND / 越权 / 阶段门控", async () => {
    const token = await signInAnonymous();
    const missing = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: "no-such-session",
        placements: [],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(missing.ok).toBe(false);
    expect(errorText(missing)).toContain("SESSION_NOT_FOUND");

    const foreignSessionId = await createSession(await signInAnonymous());
    const foreign = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: foreignSessionId,
        placements: [],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(foreign.ok).toBe(false);
    expect(errorText(foreign)).toContain("SESSION_NOT_FOUND");

    const sessionId = await createSession(token);
    const inBriefing = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(inBriefing.ok).toBe(false);
    expect(errorText(inBriefing)).toContain("SESSION_PHASE_CONFLICT");
  });

  test("updateBoard：CAS 版本冲突与证据约束（未解锁/跨 Session/未放置 link）", async () => {
    const token = await signInAnonymous();
    const sessionId = await createSession(token);
    await forceInvestigation(sessionId);

    // 版本冲突先于内容校验：expected_revision 与当前 revision 不一致
    const stale = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.1, y: 0.1 },
        ],
        links: [],
        expected_revision: 3,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(stale.ok).toBe(false);
    expect(errorText(stale)).toContain("BOARD_REVISION_CONFLICT");

    // 未解锁的 Evidence 不得上板（含跨 Session/陌生 ID）
    const locked = await callConvex(
      "mutation",
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
    );
    expect(locked.ok).toBe(false);
    expect(errorText(locked)).toContain("EVIDENCE_UNAVAILABLE");

    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: ["ev-meta-quote"] },
      { admin: true },
    );

    // link 两端必须都已放置
    const unplacedLink = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.1, y: 0.1 },
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
    expect(unplacedLink.ok).toBe(false);
    expect(errorText(unplacedLink)).toContain("EVIDENCE_UNAVAILABLE");
  });

  test("updateBoard：成功、全量替换、board_updated 事件与 SessionView 联动", async () => {
    const token = await signInAnonymous();
    const sessionId = await createSession(token);
    await forceInvestigation(sessionId);

    // 未解锁证据时 investigation 仅开放 ask（CONTRACTS 7.1 资源前置条件）
    const viewBefore = await callConvex<{
      allowed_actions: string[];
      active_role_turn_request_id?: string;
    }>("query", "sessions:getPublic", { session_id: sessionId }, {
      bearer: token,
    });
    expect(viewBefore.ok).toBe(true);
    if (viewBefore.ok) {
      expect(viewBefore.value.allowed_actions).toEqual(["ask"]);
      expect(viewBefore.value.active_role_turn_request_id).toBeUndefined();
    }

    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      {
        session_id: sessionId,
        evidence_ids: ["ev-meta-quote", "ev-gatekeeper-condition"],
      },
      { admin: true },
    );

    const first = await callConvex<BoardStateLike>(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.2, y: 0.3 },
          {
            evidence_id: "ev-gatekeeper-condition",
            lane: "condition",
            x: 0.6,
            y: 0.7,
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
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.revision).toBe(1);
    expect(first.value.placements).toHaveLength(2);
    expect(first.value.links).toHaveLength(1);
    expect(first.value.session_id).toBe(sessionId);

    // 全量替换：rev1 → rev2 只保留一个 placement、无 link
    const second = await callConvex<BoardStateLike>(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "source", x: 0.5, y: 0.5 },
        ],
        links: [],
        expected_revision: 1,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.revision).toBe(2);
      expect(second.value.placements).toHaveLength(1);
      expect(second.value.links).toEqual([]);
    }

    // board_updated 事件按公开序列追加
    const events = await callConvex<
      { payload: { type: string; revision?: number } }[]
    >(
      "query",
      "events:listPublic",
      { session_id: sessionId, after_sequence: 1 },
      { bearer: token },
    );
    expect(events.ok).toBe(true);
    if (events.ok) {
      const boardEvents = events.value.filter(
        (e) => e.payload.type === "board_updated",
      );
      expect(boardEvents.map((e) => e.payload.revision)).toEqual([1, 2]);
    }

    // SessionView：board 已更新；解锁证据后动态开放 update_board / accuse
    const view = await callConvex<{
      board: BoardStateLike;
      allowed_actions: string[];
    }>("query", "sessions:getPublic", { session_id: sessionId }, {
      bearer: token,
    });
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value.board.revision).toBe(2);
      expect(view.value.board.placements).toHaveLength(1);
      expect(view.value.allowed_actions).toEqual([
        "ask",
        "update_board",
        "accuse",
      ]);
    }
  });

  test("updateBoard：幂等重放返回同一 BoardState；同 ID 不同载荷冲突", async () => {
    const token = await signInAnonymous();
    const sessionId = await createSession(token);
    await forceInvestigation(sessionId);
    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: ["ev-meta-quote"] },
      { admin: true },
    );

    const actionId = uuid();
    const placements = [
      { evidence_id: "ev-meta-quote", lane: "source", x: 0.2, y: 0.2 },
    ];
    const first = await callConvex<BoardStateLike>(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements,
        links: [],
        expected_revision: 0,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.revision).toBe(1);

    const replay = await callConvex<BoardStateLike>(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements,
        links: [],
        expected_revision: 0,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value).toEqual(first.value);
    }

    const conflict = await callConvex(
      "mutation",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          { evidence_id: "ev-meta-quote", lane: "retelling", x: 0.9, y: 0.9 },
        ],
        links: [],
        expected_revision: 0,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(conflict.ok).toBe(false);
    expect(errorText(conflict)).toContain("IDEMPOTENCY_CONFLICT");
  });

  test("SessionView：active_role_turn_request_id 反映活动 Ticket", async () => {
    const token = await signInAnonymous();
    const sessionId = await createSession(token);
    await forceInvestigation(sessionId);

    const seeded = await callConvex<{ request_id: string }>(
      "mutation",
      "admin:seedActiveTicket",
      { session_id: sessionId },
      { admin: true },
    );
    expect(seeded.ok).toBe(true);

    const view = await callConvex<{
      allowed_actions: string[];
      active_role_turn_request_id?: string;
    }>("query", "sessions:getPublic", { session_id: sessionId }, {
      bearer: token,
    });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    if (!seeded.ok) return;
    expect(view.value.active_role_turn_request_id).toBe(
      seeded.value.request_id,
    );
    // 活动期间 ask 仍可见（BUSY 由运行时返回，不由 allowed_actions 隐藏）
    expect(view.value.allowed_actions).toEqual(["ask"]);
  });
});
