import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 把冻结的 Golden 系统案件种子落到指定 Convex 部署
 * （本地后端或云部署均可）。用法：
 *   CONVEX_DEPLOY_KEY=... bun scripts/seed-golden.ts <deployment-url>
 * 认证：`Authorization: Convex <deploy-key>`（与 CLI 同一机制）。
 * 数据与 tests/helpers/golden-seed.ts 完全一致；幂等可重复执行。
 */

const CASE_DIR = join(import.meta.dir, "..");

const CASES = [
  {
    dirName: "case-demo-001",
    caseKey: "case-demo-001",
    compilerVersion: "golden-frozen@gc0",
  },
  {
    dirName: "case-demo-002",
    caseKey: "case-demo-002",
    compilerVersion: "golden-frozen@p13",
  },
] as const;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function paragraphsPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (
    raw !== null &&
    typeof raw === "object" &&
    "paragraphs" in raw &&
    Array.isArray((raw as { paragraphs: unknown }).paragraphs)
  ) {
    return (raw as { paragraphs: unknown }).paragraphs;
  }
  throw new Error("paragraphs.json 形状无效");
}

async function seedOne(
  url: string,
  deployKey: string,
  spec: (typeof CASES)[number],
): Promise<void> {
  const dir = join(CASE_DIR, "golden-case", spec.dirName);
  const canonical = await readFile(join(dir, "source.md"), "utf8");
  const metadata = (await readJson(join(dir, "source-metadata.json"))) as {
    content_sha256: string;
    source_url: string;
  };
  const actualSha =
    "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
  if (actualSha !== metadata.content_sha256) {
    throw new Error(
      `source.md sha256 与 metadata 不一致：${actualSha} != ${metadata.content_sha256}`,
    );
  }

  const casePublic = await readJson(join(dir, "case-public.json"));
  const casePrivate = (await readJson(
    join(dir, "case-private.json"),
  )) as Record<string, unknown>;
  const paragraphs = await readJson(join(dir, "paragraphs.json"));
  const rubric = await readJson(join(dir, "rubric.json"));

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
        case_key: spec.caseKey,
        title: (casePublic as { title: string }).title,
        summary: (casePublic as { summary: string }).summary,
        theme: (casePublic as { theme: string }).theme,
        source_url: metadata.source_url,
        canonical_text: canonical,
        content_sha256: metadata.content_sha256,
        paragraphs_json: JSON.stringify(paragraphsPayload(paragraphs)),
        public_json: JSON.stringify(casePublic),
        graph_json: JSON.stringify(casePrivate.graph),
        policies_json: JSON.stringify(casePrivate.role_policies),
        golden_answer_json: JSON.stringify(casePrivate.golden_answer),
        catalog_json: JSON.stringify(casePrivate.evidence_catalog),
        rules_json: JSON.stringify(casePrivate.evidence_unlock_rules),
        rubric_json: JSON.stringify(rubric),
        compiler_version: spec.compilerVersion,
      },
    }),
  });
  const body = (await resp.json()) as {
    status: string;
    value?: { case_key: string; created: boolean };
    errorMessage?: string;
  };
  if (resp.status !== 200 || body.status !== "success" || !body.value) {
    throw new Error(
      `seed ${spec.caseKey} 失败: ${resp.status} ${JSON.stringify(body).slice(0, 400)}`,
    );
  }
  console.log(
    body.value.created
      ? `seeded: ${body.value.case_key} (created)`
      : `seeded: ${body.value.case_key} (already exists)`,
  );
}

async function main(): Promise<void> {
  const url = process.argv[2];
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !deployKey) {
    throw new Error(
      "用法: CONVEX_DEPLOY_KEY=... bun scripts/seed-golden.ts <deployment-url>",
    );
  }
  for (const spec of CASES) {
    await seedOne(url, deployKey, spec);
  }
}

await main();
