import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { callConvex, CASE_DIR } from "./convex-local.js";

/**
 * 把冻结的 Golden 标注通过内部 admin:seedSystemCase 直接落库为系统案件——
 * 不走模型（ADR 0004）。幂等：重复调用返回 created:false。
 */

export const GOLDEN_CASE_ID = "case-demo-001";
export const SECOND_GOLDEN_CASE_ID = "case-demo-002";

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

export async function seedSystemCaseFromDir(args: {
  dirName: string;
  caseKey: string;
  compilerVersion: string;
}): Promise<{ case_key: string; created: boolean }> {
  const dir = join(CASE_DIR, "golden-case", args.dirName);
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
  const casePrivate = (await readJson(join(dir, "case-private.json"))) as Record<
    string,
    unknown
  >;
  const paragraphs = await readJson(join(dir, "paragraphs.json"));
  const rubric = await readJson(join(dir, "rubric.json"));

  const result = await callConvex<{ case_key: string; created: boolean }>(
    "mutation",
    "admin:seedSystemCase",
    {
      case_key: args.caseKey,
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
      compiler_version: args.compilerVersion,
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

export async function seedGoldenCaseViaAdmin(): Promise<{
  case_key: string;
  created: boolean;
}> {
  return seedSystemCaseFromDir({
    dirName: "case-demo-001",
    caseKey: GOLDEN_CASE_ID,
    compilerVersion: "golden-frozen@gc0",
  });
}

export async function seedSecondGoldenCaseViaAdmin(): Promise<{
  case_key: string;
  created: boolean;
}> {
  return seedSystemCaseFromDir({
    dirName: "case-demo-002",
    caseKey: SECOND_GOLDEN_CASE_ID,
    compilerVersion: "golden-frozen@p13",
  });
}
