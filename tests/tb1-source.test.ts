import { describe, expect, test } from "bun:test";
import {
  extractParagraphs,
  ingestSourceSnapshot,
  locateSourceSpan,
  normalizeSourceText,
  SourceIngestionError,
  SOURCE_MAX_UTF16_CODE_UNITS,
} from "@server/source/normalize.js";
import { validateSourceSpan } from "@contracts/shared/index.js";

describe("normalizeSourceText（CONTRACTS 3.1）", () => {
  test("移除开头唯一一个 BOM", () => {
    expect(normalizeSourceText("\uFEFF正文")).toBe("正文");
    expect(normalizeSourceText("正文\uFEFF")).toBe("正文\uFEFF");
  });

  test("CRLF 与孤立 CR 都替换为 LF，其余逐字保留", () => {
    expect(normalizeSourceText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(normalizeSourceText("  不 trim  ")).toBe("  不 trim  ");
  });
});

describe("extractParagraphs（CONTRACTS 3.3）", () => {
  test("空白行分隔的最大非空行块，边界为 UTF-16 偏移", () => {
    const text = "第一段\n多行\n\n第二段\n\n\n第三段";
    const paragraphs = extractParagraphs(text);
    expect(paragraphs).toHaveLength(3);
    expect(text.slice(paragraphs[0]!.start, paragraphs[0]!.end)).toBe(
      "第一段\n多行",
    );
    expect(paragraphs[0]!.paragraph_index).toBe(0);
    expect(text.slice(paragraphs[1]!.start, paragraphs[1]!.end)).toBe("第二段");
    expect(text.slice(paragraphs[2]!.start, paragraphs[2]!.end)).toBe("第三段");
  });

  test("文件以换行结束时末段不含结尾换行", () => {
    const text = "只有一段\n";
    const paragraphs = extractParagraphs(text);
    expect(paragraphs).toHaveLength(1);
    expect(text.slice(paragraphs[0]!.start, paragraphs[0]!.end)).toBe(
      "只有一段",
    );
  });

  test("仅当每行去水平空白后都以 > 开头才识别 Quote 段", () => {
    const text = "> 引用行\n> 第二行\n\n普通\n\n > 首行带空格也算";
    const paragraphs = extractParagraphs(text);
    expect(paragraphs[0]!.is_quote).toBe(true);
    expect(paragraphs[1]!.is_quote).toBe(false);
    expect(paragraphs[2]!.is_quote).toBe(true);
  });

  test("空输入没有段落", () => {
    expect(extractParagraphs("")).toHaveLength(0);
    expect(extractParagraphs("\n\n  \n")).toHaveLength(0);
  });
});

describe("ingestSourceSnapshot（typed failure，无兜底）", () => {
  test("非 HTTPS URL → SOURCE_URL_INVALID", async () => {
    const error = await ingestSourceSnapshot({
      source_url: "http://example.com/a",
      source_text: "正文",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceIngestionError);
    expect((error as SourceIngestionError).failure.code).toBe(
      "SOURCE_URL_INVALID",
    );
  });

  test("空白正文 → SOURCE_TEXT_EMPTY", async () => {
    const error = await ingestSourceSnapshot({
      source_url: "https://example.com/a",
      source_text: "   \n\t ",
    }).catch((e: unknown) => e);
    expect((error as SourceIngestionError).failure.code).toBe(
      "SOURCE_TEXT_EMPTY",
    );
  });

  test("超长正文 → SOURCE_TOO_LONG，绝不截断", async () => {
    const longText = "字".repeat(SOURCE_MAX_UTF16_CODE_UNITS + 1);
    const error = await ingestSourceSnapshot({
      source_url: "https://example.com/a",
      source_text: longText,
    }).catch((e: unknown) => e);
    expect((error as SourceIngestionError).failure.code).toBe(
      "SOURCE_TOO_LONG",
    );
  });

  test("规范化计入长度：CRLF 按规范化后 UTF-16 units 判定", async () => {
    // 15000 个 "字\r\n" 规范化后是 30000 units，应恰好通过；再加一字即超限。
    const ok = await ingestSourceSnapshot({
      source_url: "https://example.com/a",
      source_text: "字\r\n".repeat(15_000),
    });
    expect(ok.canonical_text.length).toBe(30_000);

    const error = await ingestSourceSnapshot({
      source_url: "https://example.com/a",
      source_text: "字\r\n".repeat(15_000) + "字",
    }).catch((e: unknown) => e);
    expect((error as SourceIngestionError).failure.code).toBe(
      "SOURCE_TOO_LONG",
    );
  });

  test("成功输出：canonical_text、sha256 与段落索引", async () => {
    const article = await ingestSourceSnapshot({
      source_url: "https://example.com/a",
      source_text: "\uFEFF第一段\r\n\r\n第二段",
    });
    expect(article.canonical_text).toBe("第一段\n\n第二段");
    expect(article.content_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(article.paragraphs).toHaveLength(2);
  });
});

describe("locateSourceSpan（CONTRACTS 3.2，无模糊重定位）", () => {
  const canonical = "甲段锚点文本\n\n乙段目标句子在这里";
  const paragraphs = extractParagraphs(canonical);

  test("段内唯一定位且 slice 精确匹配", () => {
    const span = locateSourceSpan(canonical, paragraphs, {
      paragraph_index: 1,
      excerpt: "目标句子",
    });
    expect(validateSourceSpan(canonical, {
      start: span.start,
      end: span.end,
      text: "目标句子",
      paragraph_index: 1,
    })).toBe(true);
  });

  test("段内多次出现 → SOURCE_SPAN_INVALID", () => {
    const text = "重复重复文本";
    const error = (() => {
      try {
        locateSourceSpan(text, extractParagraphs(text), {
          paragraph_index: 0,
          excerpt: "重复",
        });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect((error as SourceIngestionError).failure.code).toBe(
      "SOURCE_SPAN_INVALID",
    );
  });

  test("段块不存在或摘录缺失 → SOURCE_SPAN_INVALID", () => {
    expect(() =>
      locateSourceSpan(canonical, paragraphs, {
        paragraph_index: 9,
        excerpt: "任意",
      }),
    ).toThrow(SourceIngestionError);
    expect(() =>
      locateSourceSpan(canonical, paragraphs, {
        paragraph_index: 0,
        excerpt: "不存在的句子",
      }),
    ).toThrow(SourceIngestionError);
  });
});
