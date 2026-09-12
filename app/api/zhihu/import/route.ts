import { NextResponse } from "next/server";
import { importZhihuUrl, ZhihuImportError } from "@server/source/zhihu-import.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_ARGUMENT", message: "请求格式错误" } },
      { status: 400 },
    );
  }

  const url = typeof body === "object" && body !== null && "url" in body
    ? (body as { url?: unknown }).url
    : undefined;
  if (typeof url !== "string") {
    return NextResponse.json(
      { error: { code: "INVALID_ARGUMENT", message: "缺少知乎链接" } },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await importZhihuUrl(url), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ZhihuImportError) {
      const status = error.code === "INVALID_ZHIHU_URL"
        ? 400
        : error.code === "ZHIHU_FETCH_FAILED"
          ? 502
          : 422;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_INCIDENT", message: "读取知乎文章失败" } },
      { status: 500 },
    );
  }
}
