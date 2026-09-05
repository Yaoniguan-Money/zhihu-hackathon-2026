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
 * P1-1 真实模型 smoke（显式 opt-in）：
 * RUN_MODEL_INTEGRATION=1 bun test tests/p11-model.test.ts
 * 完整链路：忠实回合（ask → 证据解锁）→ saveRecording（claim 推导）→
 * presentRecording（对质回应带 rebuttal_to_message_id）→
 * accuse（录音参与 evidence_score 命中）→ Reveal 完整公开。
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

describe("P1-1 真实模型对质闭环（显式 opt-in）", () => {
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
    "ask → save → present（对质回应）→ accuse → Reveal",
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

      // 1) 忠实回合：问 role-observer 数据问题 → 应解锁 ev-meta-quote（cl-004）。
      const asked = await callConvex<{ request_id: string }>(
        "action",
        "roleTurns:ask",
        {
          session_id: sessionId,
          role_id: "role-observer",
          mode: "direct",
          text: "请给出文中 Meta 的裁员数据：计划裁减比例和涉及人数分别是多少？",
          source: "keyboard",
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(asked.ok).toBe(true);
      if (!asked.ok) return;
      const askTurn = (await waitForTurnTerminal(
        token,
        asked.value.request_id,
        240_000,
      )) as {
        status: string;
        error?: { code: string };
        message?: { message_id: string; exact_text: string };
        newly_unlocked_evidence_ids?: string[];
      };
      expect(askTurn.status).toBe("succeeded");
      expect(askTurn.newly_unlocked_evidence_ids).toContain("ev-meta-quote");
      const sourceMessageId = askTurn.message!.message_id;

      // 2) saveRecording：公开 Claim 引用应推导出 cl-004（已随 ev-meta-quote 公开）。
      const saved = await callConvex<{
        evidence_id: string;
        public_claim_refs: string[];
        source_message_id?: string;
        type: string;
      }>(
        "mutation",
        "evidence:saveRecording",
        {
          session_id: sessionId,
          message_id: sourceMessageId,
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.value.type).toBe("quote");
      expect(saved.value.source_message_id).toBe(sourceMessageId);
      expect(saved.value.public_claim_refs).toContain("cl-004");

      // 3) presentRecording：把录音投递给忠实角色 role-analyst 对质。
      const presented = await callConvex<{ request_id: string }>(
        "action",
        "roleTurns:presentRecording",
        {
          session_id: sessionId,
          evidence_id: saved.value.evidence_id,
          target_role_id: "role-analyst",
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(presented.ok).toBe(true);
      if (!presented.ok) return;
      const presentTurn = (await waitForTurnTerminal(
        token,
        presented.value.request_id,
        240_000,
      )) as {
        status: string;
        error?: { code: string };
        message?: {
          speaker_id: string;
          exact_text: string;
          rebuttal_to_message_id?: string;
        };
        newly_unlocked_evidence_ids?: string[];
      };
      expect(presentTurn.status).toBe("succeeded");
      if (presentTurn.status !== "succeeded") {
        throw new Error(
          `对质回合失败: ${JSON.stringify(presentTurn.error)}`,
        );
      }
      expect(presentTurn.message!.speaker_id).toBe("role-analyst");
      // 对质回应必须引用录音来源 Message（CONTRACTS 8.2）。
      expect(presentTurn.message!.rebuttal_to_message_id).toBe(sourceMessageId);

      // recording_presented 事件已发布。
      const events = await callConvex<{ payload: { type: string } }[]>(
        "query",
        "events:listPublic",
        { session_id: sessionId, after_sequence: 0 },
        { bearer: token },
      );
      expect(events.ok).toBe(true);
      if (events.ok) {
        expect(
          events.value.some((e) => e.payload.type === "recording_presented"),
        ).toBe(true);
      }

      // 4) accuse：录音作为唯一附带证据参与 evidence_score 命中
      //（crit-layoff-scale：type quote ∩ cl-004 → 25 分）。
      const accused = await callConvex<{ phase: string }>(
        "action",
        "game:accuse",
        {
          session_id: sessionId,
          suspect_role_id: "role-skeptic",
          distortion_types: ["scope_expand", "condition_delete"],
          evidence_ids: [saved.value.evidence_id],
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      if (!accused.ok) {
        throw new Error(
          `accuse 失败: ${errorText(accused)} | evidence=${saved.value.evidence_id}`,
        );
      }
      expect(accused.value.phase).toBe("revealed");

      // 5) Reveal 完整公开：录音命中 crit-layoff-scale（25）；
      // questioning：1 个不同 Role 首问（8）+ ask 解锁新证据（10）≥ 18。
      const reveal = await callConvex<{
        player_correct: boolean;
        evidence_score: number;
        questioning_score: number;
        correct_role_id: string;
        truth_chain: unknown[];
      }>("query", "game:getReveal", { session_id: sessionId }, {
        bearer: token,
      });
      expect(reveal.ok).toBe(true);
      if (!reveal.ok) return;
      expect(reveal.value).not.toBeNull();
      expect(reveal.value!.correct_role_id).toBe("role-skeptic");
      expect(reveal.value!.player_correct).toBe(true);
      expect(reveal.value!.evidence_score).toBeGreaterThanOrEqual(25);
      expect(reveal.value!.questioning_score).toBeGreaterThanOrEqual(18);
    },
    { timeout: 600_000 },
  );
});
