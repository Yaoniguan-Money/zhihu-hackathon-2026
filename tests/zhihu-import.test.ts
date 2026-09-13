import { describe, expect, test } from "bun:test";
import { extractReaderDocument, extractZhihuDocument, importZhihuUrl, parseZhihuUrl, ZhihuImportError } from "../server/source/zhihu-import";

const body = "这是用于证据链测试的公开正文。".repeat(20);

describe("Zhihu URL import", () => {
  test("accepts supported article and answer URLs", () => {
    expect(parseZhihuUrl("https://zhuanlan.zhihu.com/p/123?utm_source=x").pathname).toBe("/p/123");
    expect(parseZhihuUrl("https://www.zhihu.com/question/1/answer/2").pathname).toBe("/question/1/answer/2");
  });

  test("rejects non-Zhihu hosts and unsupported paths", () => {
    expect(() => parseZhihuUrl("https://evil.example/p/123")).toThrow(ZhihuImportError);
    expect(() => parseZhihuUrl("https://www.zhihu.com/search?q=x")).toThrow(ZhihuImportError);
  });

  test("prefers JSON-LD articleBody", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ headline: "标题", articleBody: body })}</script></head></html>`;
    expect(extractZhihuDocument(html)).toEqual({ title: "标题", text: body, extraction: "json-ld" });
  });

  test("extracts content from initial state", () => {
    const html = `<script id="js-initialData" type="text/json">${JSON.stringify({ initialState: { entities: { answers: { 2: { title: "回答", content: `<p>${body}</p>` } } } } })}</script>`;
    expect(extractZhihuDocument(html)).toEqual({ title: "回答", text: body, extraction: "initial-state" });
  });

  test("validates redirects before following them", async () => {
    const fetcher = (async () => new Response(null, { status: 302, headers: { location: "https://evil.example/private" } })) as typeof fetch;
    await expect(importZhihuUrl("https://zhuanlan.zhihu.com/p/123", fetcher)).rejects.toMatchObject({ code: "INVALID_ZHIHU_URL" });
  });

  test("extracts bounded Reader markdown fallback", () => {
    const result = extractReaderDocument(`Title: 示例标题\nURL Source: https://zhuanlan.zhihu.com/p/123\n\nMarkdown Content:\n${body}`);
    expect(result).toEqual({ title: "示例标题", text: body, extraction: "reader-markdown" });
  });

  test("falls back to Reader after Zhihu blocks server fetch", async () => {
    const reader = `Title: 示例标题\nURL Source: https://zhuanlan.zhihu.com/p/123\n\nMarkdown Content:\n${body}`;
    const fetcher = (async (input: string | URL | Request) =>
      String(input).startsWith("https://r.jina.ai/")
        ? new Response(reader, { status: 200, headers: { "content-type": "text/plain" } })
        : new Response("forbidden", { status: 403 })) as typeof fetch;
    const result = await importZhihuUrl("https://zhuanlan.zhihu.com/p/123", fetcher);
    expect(result.text).toBe(body);
    expect(result.extraction).toBe("reader-markdown");
  });

  test("imports HTML with bounded public fetch", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ headline: "标题", articleBody: body })}</script>`;
    const fetcher = (async () => new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as typeof fetch;
    const result = await importZhihuUrl("https://zhuanlan.zhihu.com/p/123", fetcher);
    expect(result.text).toBe(body);
    expect(result.finalUrl).toBe("https://zhuanlan.zhihu.com/p/123");
  });
});
