import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTurnTerminal,
} from "./helpers/convex-local.js";

/**
 * TB4 真实模型回合（显式 opt-in）：
 * RUN_MODEL_INTEGRATION=1 bun test tests/tb4-model.test.ts
 * 忠实角色被追问数据问题 → Validator entailed → 消息发布 + 证据解锁。
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

describe("TB4 真实模型回合（显式 opt-in）", () => {
  beforeAll(() => {
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
    "忠实回合：entailed 发布 + 证据按规则解锁",
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
      await callConvex(
        "mutation",
        "admin:forcePhase",
        { session_key: sessionId, phase: "investigation" },
        { admin: true },
      );

      // 问 role-observer 一个数据问题（Meta/cl-004）→ 应解锁 ev-meta-quote（ul-001）
      const asked = await callConvex<{ request_id: string }>(
        "action",
        "roleTurns:ask",
        {
          session_id: sessionId,
          role_id: "role-observer",
          mode: "direct",
          text: "请给出文中 Meta 的裁员数据，计划裁减比例和涉及人数分别是多少？",
          source: "keyboard",
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(asked.ok).toBe(true);
      if (!asked.ok) return;

      const terminal = await waitForTurnTerminal(token, asked.value.request_id, 180_000);
      expect(terminal.status).toBe("succeeded");
      const turn = terminal as unknown as {
        message: { exact_text: string; speaker_id: string };
        newly_unlocked_evidence_ids: string[];
      };
      expect(turn.message.speaker_id).toBe("role-observer");
      expect(turn.message.exact_text).toContain("Meta");
      expect(turn.newly_unlocked_evidence_ids).toContain("ev-meta-quote");

      // 公开消息列表包含角色消息，且不包含任何 support_claim_ids（投影隔离）
      const messages = await callConvex<
        { speaker_type: string; exact_text: string }[]
      >("query", "messages:listPublic", { session_id: sessionId }, {
        bearer: token,
      });
      expect(messages.ok).toBe(true);
      if (messages.ok) {
        const roleMessages = messages.value.filter(
          (m) => m.speaker_type === "role",
        );
        expect(roleMessages.length).toBe(1);
        for (const message of messages.value) {
          expect(JSON.stringify(message)).not.toContain("support_claim_ids");
          expect(JSON.stringify(message)).not.toContain("visible_claim_ids");
        }
      }
    },
    { timeout: 240_000 },
  );
});
