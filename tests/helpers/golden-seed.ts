import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { callConvex, CASE_DIR } from "./convex-local.js";

/**
 * 把冻结的 Golden 标注（golden-case/case-demo-001/，2026-09-05 用户签署冻结）
 * 通过内部 admin:seedSystemCase 直接落库为系统案件——不走模型（ADR 0004）。
 * 幂等：重复调用返回 created:false。
 */

const GOLDEN_DIR = join(CASE_DIR, "golden-case", "case-demo-001");

export const GOLDEN_CASE_ID = "case-demo-001";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function seedGoldenCaseViaAdmin(): Promise<{
  case_key: string;
  created: boolean;
}> {
  const canonical = await readFile(join(GOLDEN_DIR, "source.md"), "utf8");
  const metadata = (await readJson(
    join(GOLDEN_DIR, "source-metadata.json"),
  )) as { content_sha256: string; source_url: string };
  const actualSha =
    "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
  if (actualSha !== metadata.content_sha256) {
    throw new Error(
      `source.md sha256 与 metadata 不一致：${actualSha} != ${metadata.content_sha256}`,
    );
  }

  const casePublic = await readJson(join(GOLDEN_DIR, "case-public.json"));
  const casePrivate = (await readJson(
    join(GOLDEN_DIR, "case-private.json"),
  )) as Record<string, unknown>;
  const paragraphs = await readJson(join(GOLDEN_DIR, "paragraphs.json"));
  const rubric = await readJson(join(GOLDEN_DIR, "rubric.json"));

  const result = await callConvex<{ case_key: string; created: boolean }>(
    "mutation",
    "admin:seedSystemCase",
    {
      case_key: GOLDEN_CASE_ID,
      title: (casePublic as { title: string }).title,
      summary: (casePublic as { summary: string }).summary,
      theme: (casePublic as { theme: string }).theme,
      source_url: metadata.source_url,
      canonical_text: canonical,
      content_sha256: metadata.content_sha256,
      paragraphs_json: JSON.stringify((paragraphs as { paragraphs: unknown }).paragraphs),
      public_json: JSON.stringify(casePublic),
      graph_json: JSON.stringify(casePrivate.graph),
      policies_json: JSON.stringify(casePrivate.role_policies),
      golden_answer_json: JSON.stringify(casePrivate.golden_answer),
      catalog_json: JSON.stringify(casePrivate.evidence_catalog),
      rules_json: JSON.stringify(casePrivate.evidence_unlock_rules),
      rubric_json: JSON.stringify(rubric),
    },
    { admin: true },
  );
  if (!result.ok) {
    throw new Error(
      `seedSystemCase 失败: ${typeof result.body === "object" ? JSON.stringify(result.body) : result.bodyText}`,
    );
  }
  return result.value;
}
