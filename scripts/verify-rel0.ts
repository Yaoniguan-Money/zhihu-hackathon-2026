import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * REL0 生产验证脚本：对指定部署执行最小可观察验证。
 *   CONVEX_DEPLOY_KEY=... bun scripts/verify-rel0.ts <deployment-url>
 * 覆盖：系统案件目录、匿名认证签发、Session 创建与 Owner 隔离、
 * 邀请码保护路径（无效码 → CASE_CREATION_NOT_ALLOWED，不消耗模型）。
 */

const CASE_DIR = join(import.meta.dir, "..");

function uuid(): string {
  return crypto.randomUUID();
}

async function call<T>(
  url: string,
  kind: "query" | "mutation" | "action",
  path: string,
  args: Record<string, unknown>,
  auth: { admin?: string; bearer?: string },
): Promise<{ ok: true; value: T } | { ok: false; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.admin) headers.Authorization = `Convex ${auth.admin}`;
  else if (auth.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  const resp = await fetch(`${url}/api/${kind}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = (await resp.json()) as {
    status: string;
    value?: T;
    errorMessage?: string;
  };
  if (resp.status === 200 && body.status === "success") {
    return { ok: true, value: body.value as T };
  }
  return { ok: false, body };
}

async function main(): Promise<void> {
  const url = process.argv[2];
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !deployKey) {
    throw new Error("用法: CONVEX_DEPLOY_KEY=... bun scripts/verify-rel0.ts <deployment-url>");
  }
  const admin = { admin: deployKey };
  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  // 1) 系统案件目录只含已冻结 Golden 案件
  const catalog = await call<{ case_id: string }[]>(
    url, "query", "cases:listPublic", {}, admin,
  );
  check(
    "cases:listPublic 含 case-demo-001",
    catalog.ok && JSON.stringify(catalog.value).includes("case-demo-001"),
  );
  check(
    "cases:listPublic 含 case-demo-002",
    catalog.ok && JSON.stringify(catalog.value).includes("case-demo-002"),
  );

  // 2) 案件公开投影：五角色（getPublic 需要用户身份，用匿名 token 调用）
  const tokenForProbe = await call<{ tokens: { token: string } }>(
    url, "action", "auth:signIn", { provider: "anonymous" }, admin,
  );
  const casePublic = await call<{ roles: unknown[] } | null>(
    url, "query", "cases:getPublic", { case_id: "case-demo-001" },
    tokenForProbe.ok ? { bearer: tokenForProbe.value.tokens.token } : admin,
  );
  check(
    "cases:getPublic 五角色",
    casePublic.ok && casePublic.value?.roles.length === 5,
  );

  // 3) 匿名认证签发（Convex Auth，JWT 私钥校验链路）
  const signIn = await call<{ tokens: { token: string } }>(
    url, "action", "auth:signIn", { provider: "anonymous" }, admin,
  );
  check("auth:signIn 签发匿名会话", signIn.ok);
  if (!signIn.ok) throw new Error("认证不可用，终止后续验证");
  const tokenA = signIn.value.tokens.token;

  // 4) 邀请码保护：无效码 → CASE_CREATION_NOT_ALLOWED（typed failure，不消耗模型）
  const badInvite = await call(
    url, "action", "cases:createFromSource", {
      source_url: "https://example.com/rel0-check",
      source_text: "验证邀请码保护路径的占位正文，不会真正建案。",
      invite_code: `invalid-${uuid()}`,
      client_action_id: uuid(),
    }, { bearer: tokenA },
  );
  const errText = badInvite.ok ? "" : JSON.stringify(badInvite.body ?? "");
  check(
    "无效邀请码 → CASE_CREATION_NOT_ALLOWED",
    !badInvite.ok && errText.includes("CASE_CREATION_NOT_ALLOWED"),
    errText.slice(0, 80),
  );

  // 5) Session 创建 + 多用户隔离：身份 A 建局，身份 B 不可见
  const session = await call<{ session_id: string; phase: string; board: { revision: number } }>(
    url, "mutation", "sessions:create",
    { case_id: "case-demo-001", client_action_id: uuid() },
    { bearer: tokenA },
  );
  check(
    "sessions:create 初始 briefing / board revision 0",
    session.ok && session.value?.phase === "briefing" && session.value?.board.revision === 0,
  );
  if (!session.ok) throw new Error("建局失败，终止后续验证");
  const sessionId = session.value.session_id;

  const signInB = await call<{ tokens: { token: string } }>(
    url, "action", "auth:signIn", { provider: "anonymous" }, admin,
  );
  if (!signInB.ok) throw new Error("身份 B 签发失败");
  const tokenB = signInB.value.tokens.token;
  const foreign = await call<unknown>(
    url, "query", "sessions:getPublic", { session_id: sessionId },
    { bearer: tokenB },
  );
  check("Owner 隔离：身份 B getPublic → null", foreign.ok && foreign.value === null);

  const foreignEvidence = await call<unknown[]>(
    url, "query", "evidence:getAll", { session_id: sessionId },
    { bearer: tokenB },
  );
  check("Owner 隔离：身份 B evidence:getAll → []", foreignEvidence.ok && Array.isArray(foreignEvidence.value) && foreignEvidence.value.length === 0);

  // 6) 公开事件序列与消息初始态
  const events = await call<{ sequence: number }[]>(
    url, "query", "events:listPublic", { session_id: sessionId, after_sequence: 0 },
    { bearer: tokenA },
  );
  check(
    "events:listPublic 初始事件 sequence=1（session_created）",
    events.ok && events.value?.length === 1 && events.value[0]!.sequence === 1,
  );

  // 汇总
  const deployKeyPath = join(CASE_DIR, ".convex", "deploy-key.env");
  await readFile(deployKeyPath, "utf8"); // 确认 key 文件仍存在（运维续用）
  if (failures > 0) {
    throw new Error(`REL0 验证失败 ${failures} 项`);
  }
  console.log("\nREL0 Convex 侧验证全部通过 ✅");
}

await main();
