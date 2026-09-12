import { describe, expect, test, beforeAll } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  callConvex,
  CASE_DIR,
  errorText,
  signInAnonymous,
} from "./helpers/convex-local.js";
import {
  GOLDEN_CASE_ID,
  SECOND_GOLDEN_CASE_ID,
  seedGoldenCaseViaAdmin,
  seedSecondGoldenCaseViaAdmin,
} from "./helpers/golden-seed.js";
import { caseCatalogItemPublicSchema, casePublicSchema } from "@contracts/public/index.js";

/**
 * TB2a 集成：Golden 系统案件种子 + cases.getPublic / getSource。
 */

describe("TB2 Golden 系统案件与公开查询", () => {
  beforeAll(async () => {
    const first = await seedGoldenCaseViaAdmin();
    expect(first.case_key).toBe(GOLDEN_CASE_ID);
    const second = await seedSecondGoldenCaseViaAdmin();
    expect(second.case_key).toBe(SECOND_GOLDEN_CASE_ID);
  });

  test("listPublic 列出 Golden 系统案件", async () => {
    const result = await callConvex<unknown[]>(
      "query",
      "cases:listPublic",
      {},
      { admin: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = result.value.map((item) =>
      caseCatalogItemPublicSchema.parse(item),
    );
    const golden = items.find((item) => item.case_id === GOLDEN_CASE_ID);
    expect(golden).toBeDefined();
    expect(golden!.theme).toBe("AI 与就业");
    const second = items.find((item) => item.case_id === SECOND_GOLDEN_CASE_ID);
    expect(second).toBeDefined();
    expect(second!.theme).toBe("延迟退休与养老困境");
  });

  test("getPublic：任意身份可读系统案件，roles 恰 5 且经 schema 校验", async () => {
    const token = await signInAnonymous();
    const result = await callConvex<unknown>(
      "query",
      "cases:getPublic",
      { case_id: GOLDEN_CASE_ID },
      { bearer: token },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = casePublicSchema.parse(result.value);
    expect(parsed.case_id).toBe(GOLDEN_CASE_ID);
    expect(parsed.roles).toHaveLength(5);
    expect(parsed.source_url).toBe(
      "https://zhuanlan.zhihu.com/p/2020194970120790951",
    );
  });

  test("getPublic：无身份 → AUTH_REQUIRED；不存在案件 → null", async () => {
    const noAuth = await callConvex(
      "query",
      "cases:getPublic",
      { case_id: GOLDEN_CASE_ID },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const missing = await callConvex(
      "query",
      "cases:getPublic",
      { case_id: "no-such-case" },
      { bearer: token },
    );
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value).toBeNull();
  });

  test("getSource：canonical_text 与冻结正文逐字一致，sha256 一致", async () => {
    const token = await signInAnonymous();
    const result = await callConvex<{
      source_id: string;
      case_id: string;
      source_url: string;
      canonical_text: string;
      content_sha256: string;
    }>("query", "cases:getSource", { case_id: GOLDEN_CASE_ID }, {
      bearer: token,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const canonical = await readFile(
      join(CASE_DIR, "golden-case", "case-demo-001", "source.md"),
      "utf8",
    );
    expect(result.value.canonical_text).toBe(canonical);
    expect(result.value.content_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.value.source_id).toBe(`src-${GOLDEN_CASE_ID}`);
  });

  test("第二系统案件 getPublic / getSource 与冻结正文一致", async () => {
    const token = await signInAnonymous();
    const published = await callConvex<unknown>(
      "query",
      "cases:getPublic",
      { case_id: SECOND_GOLDEN_CASE_ID },
      { bearer: token },
    );
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    const parsed = casePublicSchema.parse(published.value);
    expect(parsed.case_id).toBe(SECOND_GOLDEN_CASE_ID);
    expect(parsed.roles).toHaveLength(5);

    const source = await callConvex<{
      source_id: string;
      canonical_text: string;
    }>("query", "cases:getSource", { case_id: SECOND_GOLDEN_CASE_ID }, {
      bearer: token,
    });
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const canonical = await readFile(
      join(CASE_DIR, "golden-case", "case-demo-002", "source.md"),
      "utf8",
    );
    expect(source.value.canonical_text).toBe(canonical);
    expect(source.value.source_id).toBe(`src-${SECOND_GOLDEN_CASE_ID}`);
  });
});
