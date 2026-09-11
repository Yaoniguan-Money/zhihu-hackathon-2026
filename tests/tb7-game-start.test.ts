import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
} from "./helpers/convex-local.js";
import { clearUserModelConfig } from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * TB7 集成（默认无模型）：game.start 幂等、阶段门控、失败终止语义。
 * 真实五条开场见 tb7-model.test.ts（RUN_MODEL_INTEGRATION=1）。
 */

const GOLDEN = "case-demo-001";

function uuid(): string {
  return crypto.randomUUID();
}

describe("TB7 game.start（本地后端，无模型）", () => {
  test("前置：清空 AI 供应商注册表覆盖层", async () => {
    expect(await clearUserModelConfig(await signInAnonymous())).toBe(true);
  });
  beforeAll(async () => {
    await seedGoldenCaseViaAdmin();
  });

  test("start → opening_statements；幂等重放；重复 start → SESSION_PHASE_CONFLICT", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const sessionId = created.value.session_id;

    const actionId = uuid();
    const first = await callConvex<{ session_id: string; phase: string }>(
      "mutation",
      "game:start",
      { session_id: sessionId, client_action_id: actionId },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.phase).toBe("opening_statements");

    const replay = await callConvex<{ session_id: string; phase: string }>(
      "mutation",
      "game:start",
      { session_id: sessionId, client_action_id: actionId },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value).toEqual(first.value);

    const again = await callConvex(
      "mutation",
      "game:start",
      { session_id: sessionId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(again.ok).toBe(false);
    expect(errorText(again)).toContain("SESSION_PHASE_CONFLICT");
  });

  test("无模型：开场失败 → Session failed + terminal_error + 历史保留", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    if (!created.ok) return;
    const sessionId = created.value.session_id;

    const started = await callConvex(
      "mutation",
      "game:start",
      { session_id: sessionId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(started.ok).toBe(true);

    // 等待开场 worker 终止（无 AI_* → SERVICE_NOT_CONFIGURED）
    const deadline = Date.now() + 30_000;
    let view: {
      phase: string;
      terminal_error?: { code: string };
      allowed_actions: string[];
    } | null = null;
    while (Date.now() < deadline) {
      const result = await callConvex<{
        phase: string;
        terminal_error?: { code: string };
        allowed_actions: string[];
      }>("query", "sessions:getPublic", { session_id: sessionId }, {
        bearer: token,
      });
      if (result.ok && result.value && result.value.phase === "failed") {
        view = result.value;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(view).not.toBeNull();
    expect(view!.phase).toBe("failed");
    expect(view!.terminal_error?.code).toBe("SERVICE_NOT_CONFIGURED");
    expect(view!.allowed_actions).toEqual([]);

    // 历史保留：事件仍可恢复（session_created、game_started、session_failed）
    const events = await callConvex<{ sequence: number; payload: { type: string } }[]>(
      "query",
      "events:listPublic",
      { session_id: sessionId, after_sequence: 0 },
      { bearer: token },
    );
    expect(events.ok).toBe(true);
    if (events.ok) {
      const types = events.value.map((event) => event.payload.type);
      expect(types).toContain("game_started");
      expect(types).toContain("session_failed");
      expect(types.indexOf("game_started")).toBeLessThan(
        types.indexOf("session_failed")!,
      );
    }

    // 失败后同 ID 重放 game.start 仍返回首次结果
    // （该用例的 actionId 未保存，语义由 TB3/TB4 幂等测试覆盖）
  });

  test("死亡排水：首条开场失败后，其余在飞开场取消且不再逐条发事件", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    if (!created.ok) return;
    const sessionId = created.value.session_id;

    const started = await callConvex(
      "mutation",
      "game:start",
      { session_id: sessionId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(started.ok).toBe(true);

    // 无模型：首条开场快速失败（SERVICE_NOT_CONFIGURED）→ Session failed。
    const deadline = Date.now() + 30_000;
    let failed = false;
    while (Date.now() < deadline) {
      const result = await callConvex<{ phase: string }>(
        "query",
        "sessions:getPublic",
        { session_id: sessionId },
        { bearer: token },
      );
      if (result.ok && result.value && result.value.phase === "failed") {
        failed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(failed).toBe(true);

    // 等剩余 4 条错峰调度的 worker 全部开工：应被排水取消（无事件），
    // 而不是各自再走 finalizeTurnFailure 发 role_turn_failed。
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const events = await callConvex<
      { sequence: number; payload: { type: string } }[]
    >("query", "events:listPublic", { session_id: sessionId, after_sequence: 0 }, {
      bearer: token,
    });
    expect(events.ok).toBe(true);
    if (!events.ok) return;
    const types = events.value.map((event) => event.payload.type);
    expect(types.filter((t) => t === "role_turn_failed")).toHaveLength(1);
    expect(types.filter((t) => t === "session_failed")).toHaveLength(1);
    expect(types).not.toContain("role_message_published");
    expect(types).not.toContain("evidence_unlocked");
  }, 20_000);

  test("错误语义：非 briefing 阶段 / 不存在 Session / 无身份", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    if (!created.ok) return;
    await callConvex(
      "mutation",
      "admin:forcePhase",
      { session_key: created.value.session_id, phase: "investigation" },
      { admin: true },
    );
    const wrongPhase = await callConvex(
      "mutation",
      "game:start",
      { session_id: created.value.session_id, client_action_id: uuid() },
      { bearer: token },
    );
    expect(wrongPhase.ok).toBe(false);
    expect(errorText(wrongPhase)).toContain("SESSION_PHASE_CONFLICT");

    const missing = await callConvex(
      "mutation",
      "game:start",
      { session_id: "no-such-session", client_action_id: uuid() },
      { bearer: token },
    );
    expect(missing.ok).toBe(false);
    expect(errorText(missing)).toContain("SESSION_NOT_FOUND");

    const noAuth = await callConvex(
      "mutation",
      "game:start",
      { session_id: created.value.session_id, client_action_id: uuid() },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");
  });
});
