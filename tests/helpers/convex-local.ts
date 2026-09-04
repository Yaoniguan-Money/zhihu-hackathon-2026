import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * TB1 集成测试辅助：直连本地 Convex 后端 HTTP API。
 * 前置：本地后端已运行、schema 已推送（见 docs/handoffs/2026-09-05-workspace-ascii-path.md）。
 * 管理键只从 gitignored 的 .convex/local/default/config.json 读取，不入仓库。
 */

export const CASE_DIR = join(import.meta.dir, "..", "..");

export interface LocalBackend {
  url: string;
  adminKey: string;
}

export async function localBackend(): Promise<LocalBackend> {
  const url = process.env.CONVEX_SELF_HOSTED_URL ?? "http://127.0.0.1:3210";
  const configPath = join(
    CASE_DIR,
    ".convex",
    "local",
    "default",
    "config.json",
  );
  let adminKey: string | undefined;
  try {
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      adminKey?: string;
    };
    adminKey = config.adminKey;
  } catch {
    adminKey = undefined;
  }
  if (!adminKey) {
    throw new Error(
      `本地后端管理键缺失：未找到 ${configPath}。请先完成本地后端初始化（见 docs/handoffs/2026-09-05-workspace-ascii-path.md）`,
    );
  }
  return { url, adminKey };
}

export type ConvexAuth = { admin: true } | { bearer: string };

export type ConvexCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; httpCode: number; body: unknown; bodyText: string };

export async function callConvex<T = unknown>(
  kind: "query" | "mutation" | "action",
  path: string,
  args: Record<string, unknown>,
  auth: ConvexAuth = { admin: true },
): Promise<ConvexCallResult<T>> {
  const backend = await localBackend();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  headers.Authorization =
    "admin" in auth ? `Convex ${backend.adminKey}` : `Bearer ${auth.bearer}`;
  const response = await fetch(`${backend.url}/api/${kind}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const bodyText = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  if (
    response.status === 200 &&
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    (body as { status: string }).status === "success"
  ) {
    return { ok: true, value: (body as unknown as { value: T }).value };
  }
  return { ok: false, httpCode: response.status, body, bodyText };
}

/** 匿名登录，返回访问 JWT；每次调用产生新身份。 */
export async function signInAnonymous(): Promise<string> {
  const result = await callConvex<{ tokens: { token: string } }>(
    "action",
    "auth:signIn",
    { provider: "anonymous" },
    { admin: true },
  );
  if (!result.ok) {
    throw new Error(`auth:signIn 失败: ${result.bodyText.slice(0, 200)}`);
  }
  return result.value.tokens.token;
}

export interface CompilationStatusPublic {
  case_id: string;
  status: "accepted" | "working" | "succeeded" | "failed";
  error?: { code: string; message: string };
}

/** 轮询直到编译进入终态（succeeded/failed）或超时。 */
export async function waitForTerminal(
  token: string,
  caseId: string,
  timeoutMs = 30_000,
): Promise<CompilationStatusPublic> {
  const deadline = Date.now() + timeoutMs;
  let last: CompilationStatusPublic | null = null;
  while (Date.now() < deadline) {
    const result = await callConvex<CompilationStatusPublic | null>(
      "query",
      "cases:observeCompilation",
      { case_id: caseId },
      { bearer: token },
    );
    if (result.ok && result.value) {
      last = result.value;
      if (result.value.status === "succeeded" || result.value.status === "failed") {
        return result.value;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `observeCompilation 未在 ${timeoutMs}ms 内进入终态，最后状态: ${JSON.stringify(last)}`,
  );
}

export function errorText(result: ConvexCallResult<unknown>): string {
  if (result.ok) return JSON.stringify(result.value);
  return typeof result.body === "object"
    ? JSON.stringify(result.body)
    : String(result.body);
}

export interface TurnStatus {
  status: "accepted" | "working" | "succeeded" | "failed";
  error?: { code: string; message: string };
}

/** 轮询角色回合直到终态（succeeded/failed）或超时。 */
export async function waitForTurnTerminal(
  token: string,
  requestId: string,
  timeoutMs = 30_000,
): Promise<TurnStatus> {
  const deadline = Date.now() + timeoutMs;
  let last: TurnStatus | null = null;
  while (Date.now() < deadline) {
    const result = await callConvex<TurnStatus | null>(
      "query",
      "roleTurns:observe",
      { request_id: requestId },
      { bearer: token },
    );
    if (result.ok && result.value) {
      last = result.value;
      if (result.value.status === "succeeded" || result.value.status === "failed") {
        return result.value;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `roleTurns.observe 未在 ${timeoutMs}ms 内进入终态，最后状态: ${JSON.stringify(last)}`,
  );
}
