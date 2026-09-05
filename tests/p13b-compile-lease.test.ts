import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTerminal,
} from "./helpers/convex-local.js";

/**
 * P1-3b 编译 lease 自愈（本地后端，无模型）：
 * 编译 action 进程死亡会遗留 compiling 案件 + accepted/working 票据；
 * 「同一身份同时最多 1 次进行中编译」的并发计数只看案件 status，
 * 不清账即永久拒绝该身份的新建案。修复语义（SPEC 8 原则）：
 *  - 票据持 lease（建票即发、worker 续期）；
 *  - 同一身份下一次 createFromSource 事务里，把 lease 已过期的票据
 *    显式判失败（CASE_COMPILE_FAILED），并发占用随之释放；
 *  - 存活 lease 仍占用并发额度（不被误清）；
 *  - 已判失败的票据不接受迟到的成功写入（防复活，由 finalize 守卫）。
 */

const SOURCE_TEXT =
  "这是一段用于编译 lease 测试的极短正文。它包含两个段落。\n\n第二段内容足够让解析器产生段块即可。";
const VALID_URL = "https://example.com/lease-test";

function uuid(): string {
  return crypto.randomUUID();
}

async function createInvite(): Promise<string> {
  const code = uuid();
  const seeded = await callConvex(
    "mutation",
    "admin:createInviteCode",
    { code, max_uses: 5 },
    { admin: true },
  );
  expect(seeded.ok).toBe(true);
  return code;
}

describe("P1-3b 编译 lease 自愈（本地后端，无模型）", () => {
  beforeAll(async () => {
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
  });

  test("过期 lease 票据在下一次建案事务中被清账，身份恢复可建案", async () => {
    const token = await signInAnonymous();

    // 1) 先产生一次真实建案（无 AI 配置 → worker 阶段显式失败），
    //    借其案件行取得该身份的 tokenIdentifier。
    const first = await callConvex<{ case_id: string }>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: await createInvite(),
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(errorText(first));
    const terminal = await waitForTerminal(token, first.value.case_id, 30_000);
    expect(terminal.status).toBe("failed");
    const owner = await callConvex<{ owner_identity: string | null }>(
      "query",
      "admin:caseOwnerInternal",
      { case_key: first.value.case_id },
      { admin: true },
    );
    expect(owner.ok).toBe(true);
    if (!owner.ok || !owner.value.owner_identity) {
      throw new Error("无法取得身份 tokenIdentifier");
    }
    const identity = owner.value.owner_identity;

    // 2) 种一个 lease 已过期的孤儿案件（working 票据）。
    const staleKey = `seed-lease-${uuid()}`;
    await callConvex(
      "mutation",
      "admin:seedStaleCompilation",
      {
        identity_token: identity,
        case_key: staleKey,
        lease_expires_at_ms: Date.now() - 3_600_000,
        ticket_status: "working",
      },
      { admin: true },
    );
    const before = await callConvex<{ status: string }>(
      "query",
      "cases:observeCompilation",
      { case_id: staleKey },
      { bearer: token },
    );
    expect(before.ok).toBe(true);
    if (before.ok) expect(before.value?.status).toBe("working");

    // 3) 同一身份再次建案：initialize 事务清账过期票据，并发额度释放，
    //    建案正常受理（后续 worker 仍会因无 AI 配置显式失败）。
    const second = await callConvex<{ case_id: string }>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: await createInvite(),
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error(`建案被拒绝（清账未生效）: ${errorText(second)}`);
    }

    // 4) 旧票据已被显式判失败，公开错误为 CASE_COMPILE_FAILED。
    const healed = await callConvex<{
      status: string;
      error?: { code: string };
    }>("query", "cases:observeCompilation", { case_id: staleKey }, {
      bearer: token,
    });
    expect(healed.ok).toBe(true);
    if (healed.ok) {
      expect(healed.value?.status).toBe("failed");
      expect(healed.value?.error?.code).toBe("CASE_COMPILE_FAILED");
    }

    // 5) 审计留痕。
    const audit = await callConvex<
      { event: string; case_id: string | null; detail_code: string | null }[]
    >("query", "admin:recentAuditInternal", { limit: 15 }, { admin: true });
    expect(audit.ok).toBe(true);
    if (audit.ok) {
      expect(
        audit.value.some(
          (row) =>
            row.event === "case_compile_lease_expired" &&
            row.case_id === staleKey,
        ),
      ).toBe(true);
    }
  });

  test("RATE_LIMITED：同身份 live 编译期间新建案被并发上限拒绝", async () => {
    // 真实身份占位：先建案（failed 也算历史；并发只数 compiling），
    // 因此这里用 seed 在「真实身份」上放一个 live compiling 案件：
    // 先取得真实身份（借上一种方式），再种 live 票据，再建案 → RATE_LIMITED。
    const token = await signInAnonymous();
    const probe = await callConvex<{ case_id: string }>(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: await createInvite(),
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(probe.ok).toBe(true);
    if (!probe.ok) return;
    const owner = await callConvex<{ owner_identity: string | null }>(
      "query",
      "admin:caseOwnerInternal",
      { case_key: probe.value.case_id },
      { admin: true },
    );
    if (!owner.ok || !owner.value.owner_identity) return;
    const identity = owner.value.owner_identity;

    await callConvex(
      "mutation",
      "admin:seedStaleCompilation",
      {
        identity_token: identity,
        case_key: `seed-live-${uuid()}`,
        lease_expires_at_ms: Date.now() + 600_000,
        ticket_status: "working",
      },
      { admin: true },
    );

    const blocked = await callConvex(
      "action",
      "cases:createFromSource",
      {
        source_url: VALID_URL,
        source_text: SOURCE_TEXT,
        invite_code: await createInvite(),
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(blocked.ok).toBe(false);
    expect(errorText(blocked)).toContain("RATE_LIMITED");
  }, 60_000);
});
