import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callConvex,
  signInAnonymous,
  waitForTurnTerminal,
} from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";
import { revealResultSchema } from "@contracts/public/index.js";

/**
 * TB9 真实模型完整闭环（显式 opt-in）：
 * RUN_MODEL_INTEGRATION=1 bun test tests/tb9-model.test.ts
 * 开场五条 → 审讯 role-observer → 正确指控 role-skeptic → 完整 Reveal。
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

describe("TB9 完整 golden 闭环（显式 opt-in）", () => {
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
        // 下一次 --force 覆盖。
      }
    }
  }, 120_000);

  test.skipIf(!MODEL_INTEGRATION)(
    "开场 → 审讯 → 正确指控 → 完整 Reveal",
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

      // 等 investigation
      const deadline = Date.now() + 900_000;
      let phase = "opening_statements";
      while (Date.now() < deadline) {
        const view = await callConvex<{ phase: string }>(
          "query",
          "sessions:getPublic",
          { session_id: sessionId },
          { bearer: token },
        );
        if (view.ok && view.value) {
          phase = view.value.phase;
          if (phase === "investigation" || phase === "failed") break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      expect(phase).toBe("investigation");

      // 审讯 role-observer（Meta 数据）→ 解锁 ev-meta-quote
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
      const turn = await waitForTurnTerminal(token, asked.value.request_id, 180_000);
      expect(turn.status).toBe("succeeded");

      // 正确指控：role-skeptic + [scope_expand, condition_delete] + 已解锁证据
      const accused = await callConvex<{ session_id: string; phase: string }>(
        "action",
        "game:accuse",
        {
          session_id: sessionId,
          suspect_role_id: "role-skeptic",
          distortion_types: ["scope_expand", "condition_delete"],
          evidence_ids: ["ev-meta-quote"],
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(accused.ok).toBe(true);
      if (accused.ok) {
        expect(accused.value.phase).toBe("revealed");
      }

      const reveal = await callConvex<unknown>(
        "query",
        "game:getReveal",
        { session_id: sessionId },
        { bearer: token },
      );
      expect(reveal.ok).toBe(true);
      if (!reveal.ok) return;
      const parsed = revealResultSchema.parse(reveal.value);
      expect(parsed.correct_role_id).toBe("role-skeptic");
      expect(parsed.player_correct).toBe(true);
      expect(parsed.distortion_types).toEqual(["scope_expand", "condition_delete"]);
      expect(parsed.truth_chain).toHaveLength(5);
      expect(parsed.truth_chain[0]!.order).toBe(1);
      expect(parsed.evidence_score).toBe(25); // crit-layoff-scale 命中 cl-004
      // questioning：首问覆盖 8 分 + 审讯新证据 10 分（若开场已解锁 ev-meta-quote，
      // 则该项为 0——两种结果都符合契约公式，取决于模型开场内容）
      expect([8, 18]).toContain(parsed.questioning_score);
      expect(parsed.explanation.length).toBeGreaterThan(0);
      expect(parsed.reality_mapping.length).toBeGreaterThan(0);
    },
    { timeout: 960_000 },
  );
});
