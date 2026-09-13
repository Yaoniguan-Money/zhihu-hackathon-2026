import { NextRequest, NextResponse } from "next/server";

/**
 * AUTH1：知乎 OAuth 回调透传（登记回调地址）。
 * 知乎授权后 302 到本路由（authorization_code + state）；这里不做任何
 * Token 交换——凭证与协议全部收敛在 Convex 权威后端
 * （convex/zhihuAuth.ts 的 /api/auth/zhihu/callback httpAction），
 * 本路由只原样透传 query 并 302，App Key 不进入 Vercel 环境。
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
  return NextResponse.redirect(target, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
