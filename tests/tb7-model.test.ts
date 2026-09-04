import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callConvex,
  errorText,
  signInAnonymous,
} from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * TB7 真实模型五条开场（显式 opt-in）：
 * RUN_MODEL_INTEGRATION=1 bun test tests/tb7-model.test.ts
 * 五条开场全部经 Validator 批准 → investigation，allowed_actions 更新。
 */

const MODEL_INTEGRATION = process.env.RUN_MODEL_INTEGRATION === "1";
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

function runConvexCli(args: string[]): void {
  const cli = join(
    import.meta.dir,
    "..",
    "node_modules",
    "convex",
    "bin",
    "main.js",
  );
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: join(import.meta.dir, ".."),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `convex ${args.join(" ")} 失败: ${(result.stderr || result.stdout).slice(0, 300)}`,
    );
  }
}

describe("TB7 真实模型五条开场（显式 opt-in）", () => {
  beforeAll(async () => {
    if (!MODEL_INTEGRATION) return;
    const missing = AI_KEYS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      const envLocal = readFileSync(
        join(import.meta.dir, "..", ".env.local"),
        "utf8",
      );
      for (const line of envLocal.split("\n")) {
        const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
        if (match && !process.env[match[1]!]) {
          process.env[match[1]!] = match[2]!;
        }
      }
    }
    const envFile = join(import.meta.dir, "..", ".convex", "ai-env.tmp");
    writeFileSync(
      envFile,
      AI_KEYS.map((key) => `${key}=${process.env[key]}`).join("\n") + "\n",
    );
    runConvexCli(["env", "set", "--from-file", ".convex/ai-env.tmp", "--force"]);
    rmSync(envFile);
    runConvexCli(["run", "admin:resetQuotaState"]);
    await seedGoldenCaseViaAdmin();
  }, 120_000);

  afterAll(() => {
    if (!MODEL_INTEGRATION) return;
    for (const key of AI_KEYS) {
      try {
        runConvexCli(["env", "remove", key]);
      } catch {
        // 下一次 --force 会覆盖。
      }
    }
  }, 120_000);

  test.skipIf(!MODEL_INTEGRATION)(
    "五条开场串行完成 → investigation",
    async () => {
      const token = await signInAnonymous();
      const created = await callConvex<{ session_id: string }>(
        "mutation",
        "sessions:create",
        { case_id: "case-demo-001", client_action_id: crypto.randomUUID() },
        { bearer: token },
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const sessionId = created.value.session_id;

      const started = await callConvex(
        "mutation",
        "game:start",
        { session_id: sessionId, client_action_id: crypto.randomUUID() },
        { bearer: token },
      );
      expect(started.ok).toBe(true);

      // 轮询直到 investigation 或 failed（五条开场 ≈ 10+ 次模型调用）
      const deadline = Date.now() + 420_000;
      let phase = "opening_statements";
      while (Date.now() < deadline) {
        const view = await callConvex<{
          phase: string;
          terminal_error?: { code: string };
        }>("query", "sessions:getPublic", { session_id: sessionId }, {
          bearer: token,
        });
        if (view.ok && view.value) {
          phase = view.value.phase;
          if (phase === "investigation" || phase === "failed") break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      expect(phase).toBe("investigation");

      // 五条开场消息全部发布；公开投影无私有字段
      const messages = await callConvex<
        { speaker_type: string; speaker_id?: string; exact_text: string }[]
      >("query", "messages:listPublic", { session_id: sessionId }, {
        bearer: token,
      });
      expect(messages.ok).toBe(true);
      if (!messages.ok) return;
      const roleMessages = messages.value.filter(
        (message) => message.speaker_type === "role",
      );
      expect(roleMessages).toHaveLength(5);
      const speakerIds = new Set(roleMessages.map((m) => m.speaker_id));
      expect(speakerIds.size).toBe(5);
      for (const message of messages.value) {
        expect(JSON.stringify(message)).not.toContain("support_claim_ids");
        expect(JSON.stringify(message)).not.toContain("fidelity");
      }

      const view = await callConvex<{ allowed_actions: string[] }>(
        "query",
        "sessions:getPublic",
        { session_id: sessionId },
        { bearer: token },
      );
      expect(view.ok).toBe(true);
      if (view.ok && view.value) {
        expect(view.value.allowed_actions).toEqual([
          "ask",
          "update_board",
          "accuse",
        ]);
      }
    },
    { timeout: 480_000 },
  );
});
