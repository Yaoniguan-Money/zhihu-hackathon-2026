import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertPlayableCaseInvariants,
  casePrivateSchema,
} from "@contracts/private/index.js";
import { casePublicSchema } from "@contracts/public/index.js";
import { validateSourceSpan } from "@contracts/shared/index.js";
import { CASE_DIR } from "./helpers/convex-local.js";

const DIR = join(CASE_DIR, "golden-case", "case-demo-002");
const CASE_ID = "case-demo-002";

describe("P1-3 冻结第二案系统目录工件", () => {
  test("case_id 已晋升为 case-demo-002，不变量与 Span 逐字可回溯", async () => {
    const canonical = await readFile(join(DIR, "source.md"), "utf8");
    const metadata = JSON.parse(
      await readFile(join(DIR, "source-metadata.json"), "utf8"),
    ) as { content_sha256: string };
    const actualSha =
      "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
    expect(actualSha).toBe(metadata.content_sha256);

    const casePublic = casePublicSchema.parse(
      JSON.parse(await readFile(join(DIR, "case-public.json"), "utf8")),
    );
    expect(casePublic.case_id).toBe(CASE_ID);
    expect(casePublic.roles).toHaveLength(5);

    const casePrivate = casePrivateSchema.parse(
      JSON.parse(await readFile(join(DIR, "case-private.json"), "utf8")),
    );
    expect(casePrivate.case_id).toBe(CASE_ID);
    expect(casePrivate.graph.case_id).toBe(CASE_ID);
    expect(casePrivate.graph.source_id).toBe(`src-${CASE_ID}`);
    assertPlayableCaseInvariants(casePrivate);

    for (const claim of casePrivate.graph.claims) {
      expect(claim.source_ref).toBe(`src-${CASE_ID}`);
      expect(
        validateSourceSpan(canonical, claim.source_span),
      ).toBe(true);
    }

    const rubric = JSON.parse(
      await readFile(join(DIR, "rubric.json"), "utf8"),
    ) as { case_id: string; criteria: { weight: number }[] };
    expect(rubric.case_id).toBe(CASE_ID);
    expect(rubric.criteria.reduce((sum, item) => sum + item.weight, 0)).toBe(
      100,
    );
  });
});
