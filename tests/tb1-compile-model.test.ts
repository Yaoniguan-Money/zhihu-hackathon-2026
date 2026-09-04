import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTerminal,
} from "./helpers/convex-local.js";
import {
  evidenceGraphPrivateSchema,
  canonicalParagraphPrivateSchema,
} from "@contracts/private/index.js";
import { validateSourceSpan } from "@contracts/shared/index.js";
import { z } from "zod";

/**
 * TB1 真实模型编译集成（A2 Claim Extractor 端到端）。
 * 显式开启：RUN_MODEL_INTEGRATION=1 bun test tests/tb1-compile-model.test.ts
 * 会临时把八项 AI_* 写入本地部署环境并在结束后移除；消耗一次真实模型调用。
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

interface Receipt {
  case_id: string;
  status: "accepted";
}

interface Artifacts {
  source_url: string;
  canonical_text: string;
  content_sha256: string;
  paragraphs_json: string;
  graph_json: string;
  compiler_version: string;
}

function runConvexCli(args: string[]): void {
  const cli = join(import.meta.dir, "..", "node_modules", "convex", "bin", "main.js");
  const result = spawnSync(
    process.execPath,
    [cli, ...args],
    {
      cwd: join(import.meta.dir, ".."),
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `convex ${args.join(" ")} 失败: ${(result.stderr || result.stdout).slice(0, 300)}`,
    );
  }
}

describe("TB1 真实模型编译（显式 opt-in）", () => {
  beforeAll(() => {
    if (!MODEL_INTEGRATION) return;
    // bun test 下 NODE_ENV=test，Bun 不会自动加载 .env.local，手动解析补齐。
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
    const stillMissing = AI_KEYS.filter((key) => !process.env[key]);
    if (stillMissing.length > 0) {
      throw new Error(
        `RUN_MODEL_INTEGRATION 需要 .env.local 提供八项 AI_*，缺少: ${stillMissing.join(",")}`,
      );
    }
    const envFile = join(import.meta.dir, "..", ".convex", "ai-env.tmp");
    writeFileSync(
      envFile,
      AI_KEYS.map((key) => `${key}=${process.env[key]}`).join("\n") + "\n",
    );
    runConvexCli([
      "env",
      "set",
      "--from-file",
      ".convex/ai-env.tmp",
      "--force",
    ]);
    rmSync(envFile);
    // 清掉历史测试遗留的全局日额度记账，避免 RATE_LIMITED 假失败。
    runConvexCli(["run", "admin:resetQuotaState"]);
  }, 120_000);

  afterAll(() => {
    if (!MODEL_INTEGRATION) return;
    for (const key of AI_KEYS) {
      try {
        runConvexCli(["env", "remove", key]);
      } catch {
        // 移除失败不影响测试结果；下一次 --force 会覆盖。
      }
    }
  }, 120_000);

  test.skipIf(!MODEL_INTEGRATION)(
    "createFromSource 全链路：receipt → 真实抽取 → succeeded → Span 全部可回溯",
    async () => {
      const invite = `model-invite-${crypto.randomUUID()}`;
      const seeded = await callConvex(
        "mutation",
        "admin:createInviteCode",
        { code: invite, max_uses: 5 },
        { admin: true },
      );
      expect(seeded.ok).toBe(true);

      const token = await signInAnonymous();
      const created = await callConvex<Receipt>(
        "action",
        "cases:createFromSource",
        {
          source_url: "https://example.com/model-integration/1",
          source_text:
            "AI 编程助手已经能够自动完成大部分样板代码。\n\n然而，据多家媒体报道，今年的校招名额反而出现了上涨。\n\n专家认为，工具的成熟并不会立刻改变团队的人员结构。",
          invite_code: invite,
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { case_id } = created.value;

      const terminal = await waitForTerminal(token, case_id, 120_000);
      expect(terminal.status).toBe("succeeded");

      const artifacts = await callConvex<Artifacts | null>(
        "query",
        "admin:compiledArtifactsInternal",
        { case_key: case_id },
        { admin: true },
      );
      expect(artifacts.ok).toBe(true);
      if (!artifacts.ok || !artifacts.value) return;
      const { canonical_text, graph_json, paragraphs_json } = artifacts.value;

      const graph = evidenceGraphPrivateSchema.parse(JSON.parse(graph_json));
      expect(graph.case_id).toBe(case_id);
      expect(graph.claims.length).toBeGreaterThanOrEqual(1);
      for (const claim of graph.claims) {
        expect(claim.source_ref).toBe(`src-${case_id}`);
        expect(
          validateSourceSpan(canonical_text, claim.source_span),
        ).toBe(true);
      }
      const paragraphs = z
        .array(canonicalParagraphPrivateSchema)
        .parse(JSON.parse(paragraphs_json));
      expect(paragraphs.length).toBe(3);
      for (const span of graph.claims.map((c) => c.source_span)) {
        const paragraph = paragraphs[span.paragraph_index];
        expect(paragraph).toBeDefined();
        expect(span.start).toBeGreaterThanOrEqual(paragraph!.start);
        expect(span.end).toBeLessThanOrEqual(paragraph!.end);
      }
    },
    { timeout: 150_000 },
  );
});
