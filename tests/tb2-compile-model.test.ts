import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  callConvex,
  errorText,
  signInAnonymous,
  waitForTerminal,
} from "./helpers/convex-local.js";
import {
  assertPlayableCaseInvariants,
  casePrivateSchema,
  evidenceCatalogItemPrivateSchema,
  evidenceUnlockRulePrivateSchema,
  evidenceGraphPrivateSchema,
  goldenAnswerPrivateSchema,
  rolePrivatePolicySchema,
} from "@contracts/private/index.js";
import { casePublicSchema } from "@contracts/public/index.js";

/**
 * TB2b 真实模型编译端到端（A2+A3/A5：Claim 抽取 → 五角色案件编译）。
 * 显式开启：RUN_MODEL_INTEGRATION=1 bun test tests/tb2-compile-model.test.ts
 * 消耗两次真实模型调用（claim + case）；验证完整工件、Public/Private 分离、
 * 用户案件私有性与可玩性入口。
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

interface CaseArtifacts {
  status: string;
  visibility: string;
  title: string | null;
  summary: string | null;
  theme: string | null;
  public_json: string | null;
  policies_json: string | null;
  golden_answer_json: string | null;
  catalog_json: string | null;
  rules_json: string | null;
  rubric_json: string | null;
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

describe("TB2b 真实模型完整编译（显式 opt-in）", () => {
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
    "createFromSource → 完整五角色案件 → 私有性 → sessions.create 可玩",
    async () => {
      const invite = `tb2-invite-${crypto.randomUUID()}`;
      const seeded = await callConvex(
        "mutation",
        "admin:createInviteCode",
        { code: invite, max_uses: 5 },
        { admin: true },
      );
      expect(seeded.ok).toBe(true);

      const token = await signInAnonymous();
      const sourceText = [
        "某市上周宣布取消共享单车总量配额，转而以电子围栏动态调度。",
        "",
        "本地媒体测算，早高峰站点淤积量因此下降了约三成，不过老城区仍有多处热点难以疏解。",
        "",
        "交通研究者指出，动态调度依赖连续数据回传，中小运营商的改造成本可能转嫁为运维收缩。",
      ].join("\n");
      const created = await callConvex<{ case_id: string; status: string }>(
        "action",
        "cases:createFromSource",
        {
          source_url: "https://example.com/tb2-model/1",
          source_text: sourceText,
          theme: "城市治理",
          invite_code: invite,
          client_action_id: crypto.randomUUID(),
        },
        { bearer: token },
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { case_id } = created.value;

      const terminal = await waitForTerminal(token, case_id, 420_000);
      expect(terminal.status).toBe("succeeded");

      // 完整私有工件：4+1、答案子集、rubric 总和 100、规则可解锁
      const artifacts = await callConvex<CaseArtifacts | null>(
        "query",
        "admin:caseArtifactsInternal",
        { case_key: case_id },
        { admin: true },
      );
      expect(artifacts.ok).toBe(true);
      if (!artifacts.ok || !artifacts.value) return;
      const art = artifacts.value;
      expect(art.status).toBe("ready");
      expect(art.visibility).toBe("user");
      expect(art.policies_json && art.golden_answer_json && art.catalog_json && art.rules_json && art.rubric_json && art.public_json).toBeTruthy();

      const policies = z
        .array(rolePrivatePolicySchema)
        .parse(JSON.parse(art.policies_json!));
      const golden = goldenAnswerPrivateSchema.parse(
        JSON.parse(art.golden_answer_json!),
      );
      const catalog = z
        .array(evidenceCatalogItemPrivateSchema)
        .parse(JSON.parse(art.catalog_json!));
      const rules = z
        .array(evidenceUnlockRulePrivateSchema)
        .parse(JSON.parse(art.rules_json!));
      const graphResp = await callConvex<{ graph_json: string } | null>(
        "query",
        "admin:compiledArtifactsInternal",
        { case_key: case_id },
        { admin: true },
      );
      expect(graphResp.ok).toBe(true);
      if (!graphResp.ok || !graphResp.value) return;
      const graph = evidenceGraphPrivateSchema.parse(
        JSON.parse(graphResp.value.graph_json),
      );
      const casePrivate = casePrivateSchema.parse({
        case_id,
        graph,
        role_policies: policies,
        golden_answer: golden,
        evidence_catalog: catalog,
        evidence_unlock_rules: rules,
      });
      assertPlayableCaseInvariants(casePrivate);
      expect(policies.filter((p) => p.fidelity === "distorted")).toHaveLength(1);

      const rubric = JSON.parse(art.rubric_json!) as {
        case_id: string;
        criteria: { weight: number }[];
      };
      expect(rubric.case_id).toBe(case_id);
      const rubricSum = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(rubricSum).toBe(100);
      for (const criterion of rubric.criteria) {
        expect(Number.isInteger(criterion.weight)).toBe(true);
      }

      // Public Projection：独立 schema 校验、无私有字段、voice 为服务器轮换
      const casePublic = casePublicSchema.parse(JSON.parse(art.public_json!));
      expect(casePublic.case_id).toBe(case_id);
      expect(casePublic.roles).toHaveLength(5);
      expect(casePublic.theme).toBe("城市治理");
      const rawPublic = JSON.stringify(casePublic);
      expect(rawPublic).not.toContain("fidelity");
      expect(rawPublic).not.toContain("visible_claim_ids");
      expect(rawPublic).not.toContain("allowed_distortion_types");
      expect(rawPublic).not.toContain("goal");
      const voiceIds = new Set(casePublic.roles.map((r) => r.voice_id));
      expect(voiceIds.size).toBe(5);

      // 用户案件私有性：不进系统目录；他人不可见；Owner 可读 Source
      const catalogList = await callConvex<{ case_id: string }[]>(
        "query",
        "cases:listPublic",
        {},
        { bearer: token },
      );
      expect(catalogList.ok).toBe(true);
      if (catalogList.ok) {
        expect(
          catalogList.value.some((item) => item.case_id === case_id),
        ).toBe(false);
      }
      const foreign = await callConvex<unknown>(
        "query",
        "cases:getPublic",
        { case_id },
        { bearer: await signInAnonymous() },
      );
      expect(foreign.ok).toBe(true);
      if (foreign.ok) expect(foreign.value).toBeNull();
      const source = await callConvex<{ case_id: string }>(
        "query",
        "cases:getSource",
        { case_id },
        { bearer: token },
      );
      expect(source.ok).toBe(true);
      if (source.ok) expect(source.value?.case_id).toBe(case_id);

      // 可玩性入口：Owner 可以在用户案件上建 Session
      const session = await callConvex<{ session_id: string; phase: string }>(
        "mutation",
        "sessions:create",
        { case_id, client_action_id: crypto.randomUUID() },
        { bearer: token },
      );
      expect(session.ok).toBe(true);
      if (session.ok) expect(session.value.phase).toBe("briefing");
    },
    { timeout: 480_000 },
  );

  test("未开启 opt-in 时显式跳过", () => {
    if (!MODEL_INTEGRATION) {
      expect(true).toBe(true);
    }
    expect(errorText).toBeDefined();
  });
});
