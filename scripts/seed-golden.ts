import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * REL0 运维脚本：把冻结的 Golden 系统案件种子落到指定 Convex 部署
 * （本地后端或云部署均可）。用法：
 *   CONVEX_DEPLOY_KEY=... bun scripts/seed-golden.ts <deployment-url>
 * 认证：`Authorization: Convex <deploy-key>`（与 CLI 同一机制）。
 * 数据与 tests/helpers/golden-seed.ts 完全一致；幂等可重复执行。
 */

const CASE_DIR = join(import.meta.dir, "..");
const GOLDEN_DIR = join(CASE_DIR, "golden-case", "case-demo-001");

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const url = process.argv[2];
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !deployKey) {
    throw new Error("用法: CONVEX_DEPLOY_KEY=... bun scripts/seed-golden.ts <deployment-url>");
  }

  const canonical = await readFile(join(GOLDEN_DIR, "source.md"), "utf8");
  const metadata = (await readJson(join(GOLDEN_DIR, "source-metadata.json"))) as {
    content_sha256: string;
    source_url: string;
  };
  const actualSha =
    "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
  if (actualSha !== metadata.content_sha256) {
    throw new Error(`source.md sha256 与 metadata 不一致：${actualSha} != ${metadata.content_sha256}`);
  }

  const casePublic = await readJson(join(GOLDEN_DIR, "case-public.json"));
  const casePrivate = (await readJson(
    join(GOLDEN_DIR, "case-private.json"),
  )) as Record<string, unknown>;
  const paragraphs = await readJson(join(GOLDEN_DIR, "paragraphs.json"));
  const rubric = await readJson(join(GOLDEN_DIR, "rubric.json"));

  const resp = await fetch(`${url}/api/mutation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${deployKey}`,
    },
    body: JSON.stringify({
      path: "admin:seedSystemCase",
      format: "json",
      args: {
        case_key: "case-demo-001",
        title: (casePublic as { title: string }).title,
        summary: (casePublic as { summary: string }).summary,
        theme: (casePublic as { theme: string }).theme,
        source_url: metadata.source_url,
        canonical_text: canonical,
        content_sha256: metadata.content_sha256,
        paragraphs_json: JSON.stringify(
          (paragraphs as { paragraphs: unknown }).paragraphs,
        ),
        public_json: JSON.stringify(casePublic),
        graph_json: JSON.stringify(casePrivate.graph),
        policies_json: JSON.stringify(casePrivate.role_policies),
        golden_answer_json: JSON.stringify(casePrivate.golden_answer),
        catalog_json: JSON.stringify(casePrivate.evidence_catalog),
        rules_json: JSON.stringify(casePrivate.evidence_unlock_rules),
        rubric_json: JSON.stringify(rubric),
      },
    }),
  });
  const body = (await resp.json()) as {
    status: string;
    value?: { case_key: string; created: boolean };
    errorMessage?: string;
  };
  if (resp.status !== 200 || body.status !== "success" || !body.value) {
    throw new Error(`seed 失败: ${resp.status} ${JSON.stringify(body).slice(0, 400)}`);
  }
  console.log(
    body.value.created
      ? `seeded: ${body.value.case_key} (created)`
      : `seeded: ${body.value.case_key} (already exists)`,
  );
}

await main();
