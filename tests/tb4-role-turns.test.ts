import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTurnTerminal,
} from "./helpers/convex-local.js";
import { publicRoleTurnSchema } from "@contracts/public/index.js";

/**
 * TB4 集成：角色回合（ask/observe）——阶段、Role、排他锁、幂等与
 * 终态错误映射。默认不含模型调用（SERVICE_NOT_CONFIGURED 即被断言的
 * 契约行为）；真实生成见 tb4-model.test.ts（RUN_MODEL_INTEGRATION=1）。
 * 进入 investigation 使用 admin:forcePhase（生产唯一路径是 TB7 game.start）。
 */

const GOLDEN = "case-demo-001";

function uuid(): string {
  return crypto.randomUUID();
}

interface Receipt {
  request_id: string;
}

async function createInvestigationSession(): Promise<{
  token: string;
  sessionId: string;
}> {
  const token = await signInAnonymous();
  const created = await callConvex<{ session_id: string }>(
    "mutation",
    "sessions:create",
    { case_id: GOLDEN, client_action_id: uuid() },
    { bearer: token },
  );
  if (!created.ok) {
    throw new Error(`sessions.create 失败: ${errorText(created)}`);
  }
  const sessionId = created.value.session_id;
  const forced = await callConvex(
    "mutation",
    "admin:forcePhase",
    { session_key: sessionId, phase: "investigation" },
    { admin: true },
  );
  if (!forced.ok) {
    throw new Error(`forcePhase 失败: ${errorText(forced)}`);
  }
  return { token, sessionId };
}

describe("TB4 角色回合（本地后端，无模型）", () => {
  test("briefing 阶段 ask → SESSION_PHASE_CONFLICT", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: created.value.session_id,
        role_id: "role-observer",
        mode: "direct",
        text: "Meta 裁员了多少人？",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("SESSION_PHASE_CONFLICT");
  });

  test("未知 Role → ROLE_NOT_FOUND；investigation 正常受理并幂等", async () => {
    const { token, sessionId } = await createInvestigationSession();

    const unknownRole = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-nobody",
        mode: "direct",
        text: "在吗？",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(unknownRole.ok).toBe(false);
    expect(errorText(unknownRole)).toContain("ROLE_NOT_FOUND");

    const actionId = uuid();
    const first = await callConvex<Receipt>(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "direct",
        text: "Meta 计划裁减多少员工？",
        source: "keyboard",
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const receipt = first.value;
    expect(receipt.request_id.length).toBeGreaterThan(0);

    const replay = await callConvex<Receipt>(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "direct",
        text: "Meta 计划裁减多少员工？",
        source: "keyboard",
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value).toEqual(receipt);

    const conflict = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "gentle",
        text: "换个问法：Meta 裁多少？",
        source: "keyboard",
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(conflict.ok).toBe(false);
    expect(errorText(conflict)).toContain("IDEMPOTENCY_CONFLICT");

    // 玩家消息与事件已持久化
    const messages = await callConvex<unknown[]>(
      "query",
      "messages:listPublic",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(messages.ok).toBe(true);
    if (messages.ok) expect(messages.value.length).toBe(1);
  });

  test("排他锁：存在活动 Ticket → ROLE_TURN_BUSY；无身份 → AUTH_REQUIRED", async () => {
    const { token, sessionId } = await createInvestigationSession();
    await callConvex(
      "mutation",
      "admin:seedActiveTicket",
      { session_id: sessionId },
      { admin: true },
    );
    const busy = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "direct",
        text: "现在能回答吗？",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(busy.ok).toBe(false);
    expect(errorText(busy)).toContain("ROLE_TURN_BUSY");

    const noAuth = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "direct",
        text: "无身份提问",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");
  });

  test("终态：后端未配置 AI_* → 回合失败 SERVICE_NOT_CONFIGURED；observe 隔离", async () => {
    const { token, sessionId } = await createInvestigationSession();
    const created = await callConvex<Receipt>(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: "role-observer",
        mode: "direct",
        text: "亚马逊累计裁员多少？",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const requestId = created.value.request_id;

    const terminal = await waitForTurnTerminal(token, requestId);
    expect(terminal.status).toBe("failed");
    expect(terminal.error?.code).toBe("SERVICE_NOT_CONFIGURED");

    // observe 对其他用户与不存在请求返回 null
    const tokenB = await signInAnonymous();
    const foreign = await callConvex<unknown>(
      "query",
      "roleTurns:observe",
      { request_id: requestId },
      { bearer: tokenB },
    );
    expect(foreign.ok).toBe(true);
    if (foreign.ok) expect(foreign.value).toBeNull();
    const missing = await callConvex<unknown>(
      "query",
      "roleTurns:observe",
      { request_id: "req-none" },
      { bearer: tokenB },
    );
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value).toBeNull();
  }, 60_000);
});
