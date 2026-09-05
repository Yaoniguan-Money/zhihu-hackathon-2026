import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTerminal,
  waitForTurnTerminal,
} from "./helpers/convex-local.js";
import {
  casePrivateSchema,
  assertPlayableCaseInvariants,
} from "@contracts/private/index.js";
import { validateSourceSpan } from "@contracts/shared/index.js";

/**
 * P1-3 第二案件（显式 opt-in）：RUN_MODEL_INTEGRATION=1 bun test tests/p13-second-case.test.ts
 * 用冻结的真实第二来源（golden-case/case-demo-002，养老金/延迟退休，与第一案不同域）
 * 走真实模型编译器与完整游玩闭环，证明系统没有写死第一案件的
 * Claims、角色、答案、Policy 或 Evidence：
 *   createFromSource（邀请码+额度） → durable 编译 succeeded
 *   → 案件不变量 + Span 逐条可回溯 + 不进系统目录（用户案件私有）
 *   → sessions.create → game.start 五条开场 → ask → saveRecording
 *   → presentRecording 对质 → accuse（按服务器私有标准答案）→ revealed。
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

function uuid(): string {
  return crypto.randomUUID();
}

interface CasePublicLike {
  case_id: string;
  title: string;
  roles: { role_id: string; display_name: string }[];
}

describe("P1-3 第二案件真实编译与闭环（显式 opt-in）", () => {
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
    "第二来源：真实编译 → 不变量/Span/私有性 → 完整游玩闭环",
    async () => {
      const canonicalText = readFileSync(
        join(import.meta.dir, "..", "golden-case", "case-demo-002", "source.md"),
        "utf8",
      );
      const metadata = JSON.parse(
        readFileSync(
          join(
            import.meta.dir,
            "..",
            "golden-case",
            "case-demo-002",
            "source-metadata.json",
          ),
          "utf8",
        ),
      ) as { source_url: string; content_sha256: string };

      // 邀请码：测试运行时随机生成（明文不入仓库/文档）。
      // 编译尝试：模型抽取是随机过程，长文偶发个别摘录失配。每次尝试都是
      // 一个全新操作（新身份/新邀请码/新 client_action_id/新票据），
      // 等价于用户手动重试；失败票据原样保留，不做任何隐藏重试。
      let caseId: string | null = null;
      let ownerToken = "";
      const attemptErrors: string[] = [];
      for (let attempt = 1; attempt <= 3 && caseId === null; attempt += 1) {
        const inviteCode = crypto.randomUUID();
        const invited = await callConvex(
          "mutation",
          "admin:createInviteCode",
          { code: inviteCode, max_uses: 3 },
          { admin: true },
        );
        expect(invited.ok).toBe(true);

        const token = await signInAnonymous();
        const created = await callConvex<{ case_id: string; status: string }>(
          "action",
          "cases:createFromSource",
          {
            source_url: metadata.source_url,
            source_text: canonicalText,
            theme: "延迟退休与养老困境",
            invite_code: inviteCode,
            client_action_id: uuid(),
          },
          { bearer: token },
        );
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error(errorText(created));
        caseId = created.value.case_id;
        const terminal = await waitForTerminal(token, caseId, 1_200_000);
        if (terminal.status === "succeeded") {
          ownerToken = token;
          console.log(`编译成功（第 ${attempt} 次尝试）: ${caseId}`);
          break;
        }
        attemptErrors.push(
          `attempt${attempt}: ${JSON.stringify(terminal.error)}`,
        );
        caseId = null;
      }
      if (caseId === null) {
        const audit = await callConvex<
          { event: string; detail_code: string | null }[]
        >("query", "admin:recentAuditInternal", { limit: 12 }, { admin: true });
        throw new Error(
          `3 次编译尝试均失败: ${attemptErrors.join(" | ")} | audit=${JSON.stringify(audit.ok ? audit.value : errorText(audit))}`,
        );
      }

      // 2) 案件不变量与可玩性（服务器工件经 admin 只读取证，测试侧复验）。
      const artifacts = await callConvex<{
        status: string;
        visibility: string;
        public_json: string | null;
        policies_json: string | null;
        golden_answer_json: string | null;
        catalog_json: string | null;
        rules_json: string | null;
      }>(
        "query",
        "admin:caseArtifactsInternal",
        { case_key: caseId },
        { admin: true },
      );
      expect(artifacts.ok).toBe(true);
      if (!artifacts.ok) throw new Error(errorText(artifacts));
      expect(artifacts.value.status).toBe("ready");
      // 用户案件不得进入系统目录（证明目录未被写死/污染）。
      expect(artifacts.value.visibility).toBe("user");

      // graph 在 compiledArtifactsInternal（source_documents + graph_json）。
      const compiled = await callConvex<{
        graph_json: string;
        canonical_text: string;
        content_sha256: string;
      }>(
        "query",
        "admin:compiledArtifactsInternal",
        { case_key: caseId },
        { admin: true },
      );
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) throw new Error(errorText(compiled));

      const catalog = await callConvex<{ case_id: string }[]>(
        "query",
        "cases:listPublic",
        {},
        { bearer: ownerToken },
      );
      expect(catalog.ok).toBe(true);
      if (catalog.ok) {
        expect(
          catalog.value.some((c) => c.case_id === caseId),
        ).toBe(false);
      }

      const casePrivate = casePrivateSchema.parse({
        case_id: caseId,
        graph: JSON.parse(compiled.value.graph_json),
        role_policies: JSON.parse(artifacts.value.policies_json ?? "[]"),
        golden_answer: JSON.parse(artifacts.value.golden_answer_json ?? "{}"),
        evidence_catalog: JSON.parse(artifacts.value.catalog_json ?? "[]"),
        evidence_unlock_rules: JSON.parse(artifacts.value.rules_json ?? "[]"),
      });
      assertPlayableCaseInvariants(casePrivate);
      // 编译时的 Canonical Source 与冻结文件同哈希（内容未被改动）。
      const { createHash } = await import("node:crypto");
      expect(
        "sha256:" +
          createHash("sha256").update(canonicalText, "utf8").digest("hex"),
      ).toBe(compiled.value.content_sha256);
      // 与第一案不同域：claims 不是第一案的 ID 集（无写死）。
      expect(casePrivate.graph.claims.length).toBeGreaterThanOrEqual(12);
      for (const claim of casePrivate.graph.claims) {
        expect(
          validateSourceSpan(canonicalText, claim.source_span),
        ).toBe(true);
      }
      // private 工件不含第一案的 claims/roles（前缀不同即视为未写死）。
      expect(JSON.stringify(casePrivate)).not.toContain("cl-004");
      expect(JSON.stringify(casePrivate)).not.toContain("role-observer");

      const casePublic = JSON.parse(
        artifacts.value.public_json ?? "{}",
      ) as CasePublicLike;
      expect(casePublic.roles).toHaveLength(5);

      // 3) 完整游玩闭环（真实模型）。
      const session = await callConvex<{ session_id: string }>(
        "mutation",
        "sessions:create",
        { case_id: caseId, client_action_id: uuid() },
        { bearer: ownerToken },
      );
      expect(session.ok).toBe(true);
      if (!session.ok) throw new Error(errorText(session));
      const sessionId = session.value.session_id;

      const started = await callConvex<{ phase: string }>(
        "mutation",
        "game:start",
        { session_id: sessionId, client_action_id: uuid() },
        { bearer: ownerToken },
      );
      expect(started.ok).toBe(true);
      if (!started.ok) throw new Error(errorText(started));

      // 等五条开场全部批准（investigation）。
      const deadline = Date.now() + 1_500_000;
      let phase = "";
      while (Date.now() < deadline) {
        const view = await callConvex<{ phase: string; terminal_error?: unknown }>(
          "query",
          "sessions:getPublic",
          { session_id: sessionId },
          { bearer: ownerToken },
        );
        if (view.ok && view.value) {
          phase = view.value.phase;
          if (phase === "investigation" || phase === "failed") break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      expect(phase).toBe("investigation");

      // ask 一位忠实角色（roles[0]）。
      const asked = await callConvex<{ request_id: string }>(
        "action",
        "roleTurns:ask",
        {
          session_id: sessionId,
          role_id: casePublic.roles[0]!.role_id,
          mode: "direct",
          text: "请具体讲讲延迟退休是怎么个延法？每年延多少？",
          source: "keyboard",
          client_action_id: uuid(),
        },
        { bearer: ownerToken },
      );
      expect(asked.ok).toBe(true);
      if (!asked.ok) throw new Error(errorText(asked));
      const askTurn = (await waitForTurnTerminal(
        ownerToken,
        asked.value.request_id,
        600_000,
      )) as {
        status: string;
        message?: { message_id: string };
        newly_unlocked_evidence_ids?: string[];
      };
      expect(askTurn.status).toBe("succeeded");
      const messageId = askTurn.message!.message_id;

      // saveRecording → presentRecording 对质 roles[1]。
      const saved = await callConvex<{ evidence_id: string }>(
        "mutation",
        "evidence:saveRecording",
        {
          session_id: sessionId,
          message_id: messageId,
          client_action_id: uuid(),
        },
        { bearer: ownerToken },
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) throw new Error(errorText(saved));

      const presented = await callConvex<{ request_id: string }>(
        "action",
        "roleTurns:presentRecording",
        {
          session_id: sessionId,
          evidence_id: saved.value.evidence_id,
          target_role_id: casePublic.roles[1]!.role_id,
          client_action_id: uuid(),
        },
        { bearer: ownerToken },
      );
      expect(presented.ok).toBe(true);
      if (!presented.ok) throw new Error(errorText(presented));
      const presentTurn = (await waitForTurnTerminal(
        ownerToken,
        presented.value.request_id,
        600_000,
      )) as {
        status: string;
        message?: { rebuttal_to_message_id?: string };
      };
      expect(presentTurn.status).toBe("succeeded");
      if (presentTurn.status !== "succeeded") {
        throw new Error(`对质失败: ${JSON.stringify(presentTurn)}`);
      }
      expect(presentTurn.message!.rebuttal_to_message_id).toBe(messageId);

      // accuse：按服务器私有标准答案指控（player_correct=true）。
      const golden = JSON.parse(
        artifacts.value.golden_answer_json ?? "{}",
      ) as {
        distortion_owner_role_id: string;
        answer_distortion_types: string[];
      };
      const accused = await callConvex<{ phase: string }>(
        "action",
        "game:accuse",
        {
          session_id: sessionId,
          suspect_role_id: golden.distortion_owner_role_id,
          distortion_types: golden.answer_distortion_types,
          evidence_ids: [saved.value.evidence_id],
          client_action_id: uuid(),
        },
        { bearer: ownerToken },
      );
      expect(accused.ok).toBe(true);
      if (!accused.ok) throw new Error(errorText(accused));
      expect(accused.value.phase).toBe("revealed");

      const reveal = await callConvex<{
        player_correct: boolean;
        correct_role_id: string;
        truth_chain: unknown[];
      }>("query", "game:getReveal", { session_id: sessionId }, {
        bearer: ownerToken,
      });
      expect(reveal.ok).toBe(true);
      if (!reveal.ok) return;
      expect(reveal.value).not.toBeNull();
      expect(reveal.value!.player_correct).toBe(true);
      expect(reveal.value!.correct_role_id).toBe(
        golden.distortion_owner_role_id,
      );
      expect(reveal.value!.truth_chain.length).toBeGreaterThan(0);
    },
    { timeout: 5_400_000 },
  );
});
