import type { PublicError } from "@contracts/public/index.js";

const ALLOWED_HOSTS = new Set(["zhihu.com", "www.zhihu.com", "zhuanlan.zhihu.com"]);
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MIN_TEXT_LENGTH = 160;

export type ZhihuSourceImport = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  text: string;
  extraction: "json-ld" | "initial-state" | "article-html" | "reader-markdown";
};

export class ZhihuImportError extends Error {
  readonly code:
    | "INVALID_ZHIHU_URL"
    | "ZHIHU_FETCH_FAILED"
    | "ZHIHU_RESPONSE_TOO_LARGE"
    | "ZHIHU_CONTENT_UNAVAILABLE"
    | "ZHIHU_CONTENT_INCOMPLETE";

  constructor(
    code:
      | "INVALID_ZHIHU_URL"
      | "ZHIHU_FETCH_FAILED"
      | "ZHIHU_RESPONSE_TOO_LARGE"
      | "ZHIHU_CONTENT_UNAVAILABLE"
      | "ZHIHU_CONTENT_INCOMPLETE",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "ZhihuImportError";
  }
}

export function toPublicZhihuImportError(error: ZhihuImportError): {
  status: number;
  error: PublicError;
} {
  switch (error.code) {
    case "INVALID_ZHIHU_URL":
      return { status: 400, error: { code: "INVALID_ARGUMENT", message: error.message } };
    case "ZHIHU_RESPONSE_TOO_LARGE":
      return { status: 422, error: { code: "SOURCE_TOO_LONG", message: error.message } };
    case "ZHIHU_CONTENT_UNAVAILABLE":
    case "ZHIHU_CONTENT_INCOMPLETE":
      return { status: 422, error: { code: "SOURCE_INVALID", message: error.message } };
    case "ZHIHU_FETCH_FAILED":
      return { status: 502, error: { code: "SERVICE_UNAVAILABLE", message: error.message } };
  }
}

export function parseZhihuUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ZhihuImportError("INVALID_ZHIHU_URL", "请输入有效的知乎文章或回答链接");
  }
  if (
    url.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    throw new ZhihuImportError("INVALID_ZHIHU_URL", "仅支持知乎 HTTPS 链接");
  }
  const supported =
    /^\/p\/\d+\/?$/.test(url.pathname) ||
    /^\/question\/\d+\/answer\/\d+\/?$/.test(url.pathname) ||
    /^\/answer\/\d+\/?$/.test(url.pathname);
  if (!supported) {
    throw new ZhihuImportError("INVALID_ZHIHU_URL", "仅支持知乎专栏文章或单个回答链接");
  }
  url.hash = "";
  return url;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|blockquote|section)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function scripts(html: string, predicate: (attributes: string) => boolean): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (predicate(match[1] ?? "")) values.push((match[2] ?? "").trim());
  }
  return values;
}

function walk(value: unknown, visit: (object: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const object = value as Record<string, unknown>;
  visit(object);
  for (const child of Object.values(object)) walk(child, visit);
}

function normalizeCandidate(value: string): string {
  return /<[^>]+>/.test(value) ? htmlToText(value) : decodeHtml(value).trim();
}

function extractJsonCandidates(raw: string): Array<{ title: string; text: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeHtml(raw));
  } catch {
    return [];
  }
  const candidates: Array<{ title: string; text: string }> = [];
  walk(parsed, (object) => {
    const body =
      typeof object.articleBody === "string" ? object.articleBody :
      typeof object.content === "string" ? object.content : null;
    if (!body) return;
    const text = normalizeCandidate(body);
    if (text.length < MIN_TEXT_LENGTH) return;
    const title = [object.headline, object.title, object.name]
      .find((item): item is string => typeof item === "string") ?? "知乎文章";
    candidates.push({ title: htmlToText(title), text });
  });
  return candidates;
}

function chooseLongest(values: Array<{ title: string; text: string }>) {
  return values.sort((a, b) => b.text.length - a.text.length)[0] ?? null;
}

export function extractZhihuDocument(html: string): Omit<ZhihuSourceImport, "sourceUrl" | "finalUrl"> {
  const jsonLd = chooseLongest(
    scripts(html, (attrs) => /type=["']application\/ld\+json["']/i.test(attrs))
      .flatMap(extractJsonCandidates),
  );
  if (jsonLd) return { ...jsonLd, extraction: "json-ld" };

  const initial = chooseLongest(
    scripts(html, (attrs) => /id=["']js-initialData["']/i.test(attrs) || /type=["']text\/json["']/i.test(attrs))
      .flatMap(extractJsonCandidates),
  );
  if (initial) return { ...initial, extraction: "initial-state" };

  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const text = article ? htmlToText(article) : "";
  const title = htmlToText(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    "知乎文章",
  );
  if (text.length >= MIN_TEXT_LENGTH) return { title, text, extraction: "article-html" };

  throw new ZhihuImportError(
    text.length > 0 ? "ZHIHU_CONTENT_INCOMPLETE" : "ZHIHU_CONTENT_UNAVAILABLE",
    text.length > 0 ? "知乎返回的正文疑似不完整，请稍后重试" : "未能从这个知乎链接读取公开正文",
  );
}

export function extractReaderDocument(markdown: string): Omit<ZhihuSourceImport, "sourceUrl" | "finalUrl"> {
  const title = markdown.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? "知乎文章";
  const marker = /^Markdown Content:\s*$/m;
  const match = marker.exec(markdown);
  const text = (match ? markdown.slice(match.index + match[0].length) : markdown)
    .replace(/^!\[[^\]]*\]\([^\n]+\)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < MIN_TEXT_LENGTH) {
    throw new ZhihuImportError("ZHIHU_CONTENT_INCOMPLETE", "正文读取结果疑似不完整，请稍后重试");
  }
  return { title, text, extraction: "reader-markdown" };
}

async function importViaReader(source: URL, fetcher: typeof fetch) {
  const endpoint = new URL(`https://r.jina.ai/${source.toString()}`);
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      headers: { accept: "text/plain", "x-return-format": "markdown" },
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ZhihuImportError("ZHIHU_FETCH_FAILED", "正文读取服务暂时不可用");
  }
  if (!response.ok) {
    throw new ZhihuImportError("ZHIHU_FETCH_FAILED", `正文读取服务返回 HTTP ${response.status}`);
  }
  return extractReaderDocument(await readLimited(response));
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
    throw new ZhihuImportError("ZHIHU_RESPONSE_TOO_LARGE", "知乎页面超过导入大小限制");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new ZhihuImportError("ZHIHU_RESPONSE_TOO_LARGE", "知乎页面超过导入大小限制");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

export async function importZhihuUrl(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<ZhihuSourceImport> {
  const source = parseZhihuUrl(input);
  let current = source;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    let response: Response;
    try {
      response = await fetcher(current, {
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "zh-CN,zh;q=0.9",
          "user-agent": "Mozilla/5.0 EvidenceChain/1.0",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ZhihuImportError("ZHIHU_FETCH_FAILED", "连接知乎失败，请稍后重试");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new ZhihuImportError("ZHIHU_FETCH_FAILED", "知乎链接重定向异常");
      }
      current = parseZhihuUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        const extracted = await importViaReader(source, fetcher);
        return { sourceUrl: source.toString(), finalUrl: current.toString(), ...extracted };
      }
      throw new ZhihuImportError("ZHIHU_FETCH_FAILED", `知乎返回 HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new ZhihuImportError("ZHIHU_CONTENT_UNAVAILABLE", "知乎返回的不是文章页面");
    }
    const extracted = extractZhihuDocument(await readLimited(response));
    return { sourceUrl: source.toString(), finalUrl: current.toString(), ...extracted };
  }
  throw new ZhihuImportError("ZHIHU_FETCH_FAILED", "知乎链接重定向次数过多");
}
