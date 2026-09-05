import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { localBackend } from "../tests/helpers/convex-local.js";

/**
 * 运维工具：把本地后端中一个已编译案件的工件导出为 JSON 文件
 * （目录布局与 golden-case/case-demo-001 一致），供 A/B Golden 审阅与
 * 系统目录晋升决策（ADR 0004：进入系统目录只能由内部操作并经审批）。
 *
 * 用法：bun scripts/export-case-artifacts.ts <case_key> <out-dir>
 */

async function callAdmin<T>(
  kind: "query",
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const backend = await localBackend();
  const config = JSON.parse(
    await readFile(
      join(backend.url.startsWith("http") ? "." : ".", ".convex/local/default/config.json"),
      "utf8",
    ),
  );
  void config;
  const response = await fetch(`${backend.url}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${backend.adminKey}`,
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = (await response.json()) as {
    status: string;
    value?: T;
    errorMessage?: string;
  };
  if (body.status !== "success" || body.value === undefined) {
    throw new Error(`${path} 失败: ${body.errorMessage ?? response.status}`);
  }
  return body.value;
}

async function main(): Promise<void> {
  const [caseKey, outDir] = process.argv.slice(2);
  if (!caseKey || !outDir) {
    throw new Error("用法: bun scripts/export-case-artifacts.ts <case_key> <out-dir>");
  }
  const artifacts = await callAdmin<{
    status: string;
    visibility: string;
    title: string | null;
    public_json: string | null;
    policies_json: string | null;
    golden_answer_json: string | null;
    catalog_json: string | null;
    rules_json: string | null;
    rubric_json: string | null;
  }>("query", "admin:caseArtifactsInternal", { case_key: caseKey });
  const compiled = await callAdmin<{
    canonical_text: string;
    content_sha256: string;
    paragraphs_json: string;
    graph_json: string;
    compiler_version: string;
  }>("query", "admin:compiledArtifactsInternal", { case_key: caseKey });

  if (artifacts.status !== "ready") {
    throw new Error(`案件状态为 ${artifacts.status}，仅导出 ready 案件`);
  }
  mkdirSync(outDir, { recursive: true });

  const casePublic = JSON.parse(artifacts.public_json ?? "{}");
  const casePrivate = {
    case_id: caseKey,
    graph: JSON.parse(compiled.graph_json),
    role_policies: JSON.parse(artifacts.policies_json ?? "[]"),
    golden_answer: JSON.parse(artifacts.golden_answer_json ?? "{}"),
    evidence_catalog: JSON.parse(artifacts.catalog_json ?? "[]"),
    evidence_unlock_rules: JSON.parse(artifacts.rules_json ?? "[]"),
  };
  const rubric = JSON.parse(artifacts.rubric_json ?? "{}");
  const paragraphs = JSON.parse(compiled.paragraphs_json ?? "{\"paragraphs\":[]}");

  writeFileSync(join(outDir, "case-public.json"), JSON.stringify(casePublic, null, 2) + "\n");
  writeFileSync(join(outDir, "case-private.json"), JSON.stringify(casePrivate, null, 2) + "\n");
  writeFileSync(join(outDir, "rubric.json"), JSON.stringify(rubric, null, 2) + "\n");
  writeFileSync(join(outDir, "paragraphs.json"), JSON.stringify(paragraphs, null, 2) + "\n");
  writeFileSync(
    join(outDir, "compiled-metadata.json"),
    JSON.stringify(
      {
        case_key: caseKey,
        compiler_version: compiled.compiler_version,
        content_sha256: compiled.content_sha256,
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `导出完成: ${outDir} (claims=${casePrivate.graph.claims.length}, roles=5, catalog=${casePrivate.evidence_catalog.length})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
