import { NextRequest, NextResponse } from "next/server";

/**
 * AUTH1：知乎 OAuth 回调透传（登记回调地址）。
 * 知乎授权后到达本路由（authorization_code + state）；这里不做 Token 交换。
 * 凭证与协议全部收敛在 Convex 权威后端（convex/zhihuAuth.ts）。
 * 本路由服务端 fetch 上游并跟随其 302，浏览器不必直连 *.convex.site。
 */
export async function GET(request: NextRequest) {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) {
    return NextResponse.json(
      { error: "登录服务未配置，暂不可用" },
      { status: 503 },
    );
  }
  const target = new URL("/api/auth/zhihu/callback", site);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    target.searchParams.set(key, value);
  }
  const upstream = await fetch(target, {
    method: "GET",
    redirect: "manual",
    headers: { "Cache-Control": "no-store" },
  });
  const location = upstream.headers.get("location");
  if (location) {
    const dest = new URL(location, request.url);
    dest.protocol = request.nextUrl.protocol;
    dest.host = request.nextUrl.host;
    dest.pathname = "/";
    return NextResponse.redirect(dest, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const body = await upstream.text();
  const contentType =
    upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
