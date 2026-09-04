import { z } from "zod";
import {
  canonicalParagraphPrivateSchema,
  type CanonicalParagraphPrivate,
  type PrivateFailure,
} from "@contracts/private/index.js";

/**
 * A1 Source Ingestion（ENGINEERING_SPEC 第 4 节 / CONTRACTS 第 3 节）。
 * 进程内纯转换：规范化、段落与引用、UTF-16 半开 Span。
 * 失败一律 typed failure（SOURCE_* 私有码），不做修复、截断或猜测。
 */

export const SOURCE_MAX_UTF16_CODE_UNITS = 30_000;

export class SourceIngestionError extends Error {
  readonly failure: PrivateFailure;

  constructor(failure: PrivateFailure) {
    super(failure.detail ?? failure.code);
    this.name = "SourceIngestionError";
    this.failure = failure;
  }
}

function sourceFailure(
  code: Extract<
    PrivateFailure["code"],
    "SOURCE_URL_INVALID" | "SOURCE_TEXT_EMPTY" | "SOURCE_TOO_LONG" | "SOURCE_PARSE_FAILED"
  >,
  detail: string,
): SourceIngestionError {
  return new SourceIngestionError({ code, incident_id: `src:${code}`, detail });
}

const httpsUrl = z.url({ protocol: /^https$/ });

/**
 * CONTRACTS 3.1 规范化算法，按唯一顺序执行：
 * 1) 移除开头唯一一个 U+FEFF（若存在）；2) CRLF→LF，剩余 CR→LF；
 * 3) 不做 trim、Unicode normalization、空白折叠、修复或截断。
 */
export function normalizeSourceText(raw: string): string {
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return text;
}

function isBlankLine(line: string): boolean {
  return /^[ \t\r]*$/.test(line);
}

function isQuoteLine(line: string): boolean {
  return line.replace(/^[ \t]+/, "").startsWith(">");
}

/**
 * CONTRACTS 3.3：段落是「由一个或多个空白行分隔的最大非空行块」，
 * 边界按 Canonical Source 的 UTF-16 code unit 计算。
 * 仅当块内每个非空行去除水平空白后都以 > 开头时为 Quote 段。
 */
export function extractParagraphs(
  canonical: string,
): CanonicalParagraphPrivate[] {
  const paragraphs: CanonicalParagraphPrivate[] = [];
  let offset = 0;
  let current: { start: number; end: number; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const parsed = canonicalParagraphPrivateSchema.parse({
      paragraph_index: paragraphs.length,
      start: current.start,
      end: current.end,
      is_quote: current.lines.every(isQuoteLine),
    });
    paragraphs.push(parsed);
    current = null;
  };

  for (const line of canonical.split("\n")) {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    if (isBlankLine(line)) {
      flush();
    } else if (current) {
      current.end = lineEnd;
      current.lines.push(line);
    } else {
      current = { start: lineStart, end: lineEnd, lines: [line] };
    }
  }
  flush();
  return paragraphs;
}

export interface CanonicalArticle {
  canonical_text: string;
  content_sha256: `sha256:${string}`;
  paragraphs: CanonicalParagraphPrivate[];
}

async function sha256Utf8(text: string): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}` as `sha256:${string}`;
}

/**
 * ingest(SourceSnapshot) → CanonicalArticle（ENGINEERING_SPEC 第 4 节）。
 * URL 只记录来源；正文必须非空且 ≤ 30,000 UTF-16 code units，绝不截断。
 */
export async function ingestSourceSnapshot(input: {
  source_url: string;
  source_text: string;
}): Promise<CanonicalArticle> {
  if (!httpsUrl.safeParse(input.source_url).success) {
    throw sourceFailure(
      "SOURCE_URL_INVALID",
      "source_url 必须是绝对 HTTPS URL",
    );
  }
  if (input.source_text.trim() === "") {
    throw sourceFailure("SOURCE_TEXT_EMPTY", "正文为空或仅空白字符");
  }

  const canonical = normalizeSourceText(input.source_text);
  if (canonical.length > SOURCE_MAX_UTF16_CODE_UNITS) {
    throw sourceFailure(
      "SOURCE_TOO_LONG",
      `Canonical Source 超过 ${SOURCE_MAX_UTF16_CODE_UNITS} UTF-16 code units`,
    );
  }

  const paragraphs = extractParagraphs(canonical);
  if (paragraphs.length === 0) {
    throw sourceFailure("SOURCE_PARSE_FAILED", "未解析出任何段落");
  }

  return {
    canonical_text: canonical,
    content_sha256: await sha256Utf8(canonical),
    paragraphs,
  };
}

/**
 * 在指定段块内为候选摘录精确定位 Span（CONTRACTS 3.2）。
 * 仅接受段内唯一出现；不匹配、越界或非唯一都是 SOURCE_SPAN_INVALID，
 * 不做“最相近文本”重定位。
 */
export function locateSourceSpan(
  canonical: string,
  paragraphs: CanonicalParagraphPrivate[],
  input: { paragraph_index: number; excerpt: string },
): { start: number; end: number } {
  const paragraph = paragraphs[input.paragraph_index];
  if (!paragraph) {
    throw new SourceIngestionError({
      code: "SOURCE_SPAN_INVALID",
      incident_id: "span:paragraph_out_of_range",
      detail: `段块 ${input.paragraph_index} 不存在`,
    });
  }
  const paragraphText = canonical.slice(paragraph.start, paragraph.end);
  const first = paragraphText.indexOf(input.excerpt);
  const last = paragraphText.lastIndexOf(input.excerpt);
  if (first < 0 || first !== last) {
    throw new SourceIngestionError({
      code: "SOURCE_SPAN_INVALID",
      incident_id: "span:excerpt_not_unique",
      detail: `段块 ${input.paragraph_index} 中摘录未找到或出现多次`,
    });
  }
  const start = paragraph.start + first;
  const end = start + input.excerpt.length;
  if (canonical.slice(start, end) !== input.excerpt) {
    throw new SourceIngestionError({
      code: "SOURCE_SPAN_INVALID",
      incident_id: "span:slice_mismatch",
      detail: "Span slice 校验失败",
    });
  }
  return { start, end };
}
