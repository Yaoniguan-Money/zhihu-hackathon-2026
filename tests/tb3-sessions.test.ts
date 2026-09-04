import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTerminal,
} from "./helpers/convex-local.js";
import { sessionViewSchema } from "@contracts/public/index.js";

/**
 * TB3 集成：Session Authority（sessions.create/getPublic、
 * messages.listPublic、events.listPublic）。
 * 前置：Golden 系统案件已由 tb2-golden 种子。
 */

const GOLDEN = "case-demo-001";

interface SessionView {
  session_id: string;
  case_id: string;
  phase: string;
  allowed_actions: string[];
  board: { session_id: string; revision: number; placements: unknown[]; links: unknown[] };
  reveal_available: boolean;
  last_event_sequence: number;
  created_at: string;
  updated_at: string;
}

function uuid(): string {
  return crypto.randomUUID();
}

describe("TB3 Session Authority（本地后端）", () => {
  beforeAll(async () => {
    // 清空历史全局日额度记账，避免跨运行累积导致 RATE_LIMITED 假失败。
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
  });

  test("create → briefing 初始视图；重放同 ID 返回同一 Session", async () => {
    const token = await signInAnonymous();
    const actionId = uuid();
    const first = await callConvex<SessionView>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: actionId },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const view = sessionViewSchema.parse(first.value);
    expect(view.phase).toBe("briefing");
    expect(view.allowed_actions).toEqual(["start"]);
    expect(view.board.revision).toBe(0);
    expect(view.reveal_available).toBe(false);
    expect(view.last_event_sequence).toBe(1);

    const replay = await callConvex<SessionView>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: actionId },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.session_id).toBe(view.session_id);
    }

    // 同 action_id + 不同 case_id：键含 case_id，彼此独立（CONTRACTS 12）
    const otherCaseAction = await callConvex<SessionView>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    expect(otherCaseAction.ok).toBe(true);
  });

  test("getPublic：Owner 可读，他人与不存在 → null", async () => {
    const tokenA = await signInAnonymous();
    const created = await callConvex<SessionView>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: tokenA },
    );
    if (!created.ok) return;
    const sessionId = created.value.session_id;

    const ownerView = await callConvex<SessionView | null>(
      "query",
      "sessions:getPublic",
      { session_id: sessionId },
      { bearer: tokenA },
    );
    expect(ownerView.ok).toBe(true);
    if (ownerView.ok && ownerView.value) {
      expect(ownerView.value.session_id).toBe(sessionId);
    }

    const tokenB = await signInAnonymous();
    const foreign = await callConvex<SessionView | null>(
      "query",
      "sessions:getPublic",
      { session_id: sessionId },
      { bearer: tokenB },
    );
    expect(foreign.ok).toBe(true);
    if (foreign.ok) expect(foreign.value).toBeNull();

    const missing = await callConvex<SessionView | null>(
      "query",
      "sessions:getPublic",
      { session_id: "no-such-session" },
      { bearer: tokenB },
    );
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value).toBeNull();
  });

  test("events/messages：session_created 事件与空消息列表；增量恢复", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<SessionView>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    if (!created.ok) return;
    const sessionId = created.value.session_id;

    const events = await callConvex<
      { sequence: number; payload: { type: string } }[]
    >("query", "events:listPublic", { session_id: sessionId, after_sequence: 0 }, {
      bearer: token,
    });
    expect(events.ok).toBe(true);
    if (events.ok) {
      expect(events.value).toHaveLength(1);
      expect(events.value[0]!.sequence).toBe(1);
      expect(events.value[0]!.payload.type).toBe("session_created");
    }
    const incremental = await callConvex<unknown[]>(
      "query",
      "events:listPublic",
      { session_id: sessionId, after_sequence: 1 },
      { bearer: token },
    );
    expect(incremental.ok).toBe(true);
    if (incremental.ok) expect(incremental.value).toHaveLength(0);

    const messages = await callConvex<unknown[]>(
      "query",
      "messages:listPublic",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(messages.ok).toBe(true);
    if (messages.ok) expect(messages.value).toHaveLength(0);

    // 他人视角：事件与消息均返回空数组（同一安全结果）
    const tokenB = await signInAnonymous();
    const foreignEvents = await callConvex<unknown[]>(
      "query",
      "events:listPublic",
      { session_id: sessionId, after_sequence: 0 },
      { bearer: tokenB },
    );
    expect(foreignEvents.ok).toBe(true);
    if (foreignEvents.ok) expect(foreignEvents.value).toHaveLength(0);
  });

  test("错误语义：无身份 / 非法 UUID / CASE_NOT_FOUND / CASE_NOT_READY", async () => {
    const noAuth = await callConvex(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const badUuid = await callConvex(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: "nope" },
      { bearer: token },
    );
    expect(badUuid.ok).toBe(false);
    expect(errorText(badUuid)).toContain("INVALID_ARGUMENT");

    const notFound = await callConvex(
      "mutation",
      "sessions:create",
      { case_id: "no-such-case", client_action_id: uuid() },
      { bearer: token },
    );
    expect(notFound.ok).toBe(false);
    expect(errorText(notFound)).toContain("CASE_NOT_FOUND");

    // 编译失败（本地后端未配置 AI_*）的用户案件 → CASE_NOT_READY
    const invite = `tb3-invite-${uuid()}`;
    await callConvex("mutation", "admin:createInviteCode", {
      code: invite,
      max_uses: 5,
    }, { admin: true });
    const caseCreated = await callConvex<{ case_id: string }>(
      "action",
      "cases:createFromSource",
      {
        source_url: "https://example.com/tb3/1",
        source_text: "TB3 not-ready case body.",
        invite_code: invite,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(caseCreated.ok).toBe(true);
    if (!caseCreated.ok) return;
    const terminal = await waitForTerminal(token, caseCreated.value.case_id);
    expect(terminal.status).toBe("failed");
    const notReady = await callConvex(
      "mutation",
      "sessions:create",
      { case_id: caseCreated.value.case_id, client_action_id: uuid() },
      { bearer: token },
    );
    expect(notReady.ok).toBe(false);
    expect(errorText(notReady)).toContain("CASE_NOT_READY");
  });
});
