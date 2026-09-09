import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTerminal,
} from "./helpers/convex-local.js";
import { clearUserModelConfig } from "./helpers/convex-local.js";
import { SOURCE_MAX_UTF16_CODE_UNITS } from "@server/source/normalize.js";
import { utcDayKey } from "@server/cases/quota.js";

/**
 * TB1 集成测试：本地 Convex 后端 + 匿名身份（真实 DB、真实调度）。
 * 默认不含任何模型调用：后端未配置 AI_* 时，完整编译以
 * SERVICE_NOT_CONFIGURED 显式失败——这本身是被断言的契约行为。
 * 真实模型编译见 tb1-compile-model.test.ts（显式 RUN_MODEL_INTEGRATION=1）。
 */

const VALID_URL = "https://example.com/article/1";
const SOURCE_TEXT = "Paragraph one about layoffs.\n\nParagraph two about AI.";

function uuid(): string {
  return crypto.randomUUID();
}

interface Receipt {
  case_id: string;
  status: "accepted";
}

async function seedInvite(code: string, maxUses = 5): Promise<void> {
  const result = await callConvex(
    "mutation",
    "admin:createInviteCode",
    { code, max_uses: maxUses },
    { admin: true },
  );
  if (!result.ok) {
    throw new Error(`seedInviteCode 失败: ${errorText(result)}`);
  }
}

describe("TB1 建案域集成（本地后端）", () => {
  test("前置：清空 AI 供应商注册表覆盖层", async () => {
    expect(await clearUserModelConfig(await signInAnonymous())).toBe(true);
  });
  beforeAll(async () => {
    // 每轮集成测试从干净额度状态开始（跨运行的全局日计数会累积）。
    const reset = await callConvex(
      "mutation",
      "admin:resetQuotaState",
      {},
      { admin: true },
    );
    if (!reset.ok) {
      throw new Error(`resetQuotaState 失败: ${errorText(reset)}`);
    }
  });

  test("cases.listPublic 返回数组（当前无系统案件）", async () => {
    const result = await callConvex<unknown[]>(
      "query",
      "cases:listPublic",
      {},
      { admin: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  test("无用户身份调用 createFromSource → AUTH_REQUIRED", async () => {
    const result = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: "any",
        client_action_id: uuid(),
      },
      { admin: true },
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("AUTH_REQUIRED");
  });

  test("非法 client_action_id → INVALID_ARGUMENT", async () => {
    const token = await signInAnonymous();
    const result = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: "any",
        client_action_id: "not-a-uuid",
      },
      { bearer: token },
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("INVALID_ARGUMENT");
  });

  test("非法 URL / 空正文 → SOURCE_INVALID", async () => {
    const token = await signInAnonymous();
    for (const args of [
      {
        source_url: "http://example.com/insecure",
        source_text: SOURCE_TEXT,
        invite_code: "any",
        client_action_id: uuid(),
      },
      {
        source_url: VALID_URL,
        source_text: "   \n\t",
        invite_code: "any",
        client_action_id: uuid(),
      },
    ]) {
      const result = await callConvex(
        "action",
        "cases:createFromSource",
        args,
        { bearer: token },
      );
      expect(result.ok).toBe(false);
      expect(errorText(result)).toContain("SOURCE_INVALID");
    }
  });

  test("超长正文 → SOURCE_TOO_LONG（不截断）", async () => {
    const token = await signInAnonymous();
    const result = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: "字".repeat(SOURCE_MAX_UTF16_CODE_UNITS + 1),
        invite_code: "any",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("SOURCE_TOO_LONG");
  });

  test("无效邀请码 → CASE_CREATION_NOT_ALLOWED（不泄露原因）", async () => {
    const token = await signInAnonymous();
    const result = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: `wrong-${uuid()}`,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("CASE_CREATION_NOT_ALLOWED");
  });

  test("有效邀请码：receipt、幂等重放、Owner 隔离、终态失败与失败重放", async () => {
    const invite = `invite-${uuid()}`;
    await seedInvite(invite);
    const tokenA = await signInAnonymous();
    const actionId = uuid();

    const first = await callConvex<Receipt>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: actionId,
      },
      { bearer: tokenA },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const receipt = first.value;
    expect(receipt.status).toBe("accepted");
    expect(receipt.case_id.length).toBeGreaterThan(0);

    // 同键同哈希重放：返回首次持久化的同一 receipt
    const replay = await callConvex<Receipt>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: actionId,
      },
      { bearer: tokenA },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value).toEqual(receipt);

    // 同键不同哈希 → IDEMPOTENCY_CONFLICT
    const conflict = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT + "不同内容",
        invite_code: invite,
        client_action_id: actionId,
      },
      { bearer: tokenA },
    );
    expect(conflict.ok).toBe(false);
    expect(errorText(conflict)).toContain("IDEMPOTENCY_CONFLICT");

    // Owner 隔离：B 观察 A 的案件 → null；A 观察 → 状态对象
    const tokenB = await signInAnonymous();
    const observeB = await callConvex(
      "query",
      "cases:observeCompilation",
      { case_id: receipt.case_id },
      { bearer: tokenB },
    );
    expect(observeB.ok).toBe(true);
    if (observeB.ok) expect(observeB.value).toBeNull();
    const observeA = await callConvex<Record<string, unknown>>(
      "query",
      "cases:observeCompilation",
      { case_id: receipt.case_id },
      { bearer: tokenA },
    );
    expect(observeA.ok).toBe(true);

    // 终态：后端未配置 AI_* → 编译以 SERVICE_NOT_CONFIGURED 显式失败，
    // 且失败后同键同哈希重放仍返回首次的 accepted receipt。
    const terminal = await waitForTerminal(tokenA, receipt.case_id);
    expect(terminal.status).toBe("failed");
    expect(terminal.error?.code).toBe("SERVICE_NOT_CONFIGURED");
    const replayAfterFailure = await callConvex<Receipt>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: actionId,
      },
      { bearer: tokenA },
    );
    expect(replayAfterFailure.ok).toBe(true);
    if (replayAfterFailure.ok) {
      expect(replayAfterFailure.value).toEqual(receipt);
    }
  });

  test("滚动 24 小时额度：第 4 次建案 → RATE_LIMITED", async () => {
    const invite = `invite-${uuid()}`;
    await seedInvite(invite);
    const token = await signInAnonymous();
    const actionId = uuid();
    const first = await callConvex<Receipt>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const owner = await callConvex<{
      owner_identity: string | null;
    }>("query", "admin:caseOwnerInternal", { case_key: first.value.case_id }, {
      admin: true,
    });
    expect(owner.ok).toBe(true);
    if (!owner.ok || !owner.value.owner_identity) return;
    const identity = owner.value.owner_identity;

    // 已有 1 条真实 usage；补 2 条到窗口内 → 共 3 条 → 触达上限
    await callConvex(
      "mutation",
      "admin:seedCreationUsage",
      { identity_token: identity, count: 2 },
      { admin: true },
    );
    const fourth = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(fourth.ok).toBe(false);
    expect(errorText(fourth)).toContain("RATE_LIMITED");
  });

  test("并发编译占用：已有 compiling 案件 → RATE_LIMITED", async () => {
    const invite = `invite-${uuid()}`;
    await seedInvite(invite);
    const token = await signInAnonymous();
    const actionId = uuid();
    const first = await callConvex<Receipt>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const owner = await callConvex<{ owner_identity: string | null }>(
      "query",
      "admin:caseOwnerInternal",
      { case_key: first.value.case_id },
      { admin: true },
    );
    if (!owner.ok || !owner.value.owner_identity) return;
    await callConvex(
      "mutation",
      "admin:seedCompilingCase",
      { identity_token: owner.value.owner_identity },
      { admin: true },
    );
    const second = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(second.ok).toBe(false);
    expect(errorText(second)).toContain("RATE_LIMITED");
  });

  test("全站 UTC 日额度：seed 满 50 后 → RATE_LIMITED（放最后，污染当日全局计数）", async () => {
    await callConvex(
      "mutation",
      "admin:seedCreationUsage",
      {
        identity_token: `global-seed-${uuid()}`,
        count: 50,
        utc_day: utcDayKey(Date.now()),
      },
      { admin: true },
    );
    const invite = `invite-${uuid()}`;
    await seedInvite(invite);
    const token = await signInAnonymous();
    const result = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: invite,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("RATE_LIMITED");
  });
});
