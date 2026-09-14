import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 赛事页登记的知乎回调是游戏主站根地址。
 * 知乎会打到 `/?authorization_code=…&state=…`；这里改写到既有回调路由，
 * 不改变浏览器可见的登记 URL。
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/") return NextResponse.next();
  if (!searchParams.has("authorization_code") && !searchParams.has("code")) {
    return NextResponse.next();
  }
  const target = request.nextUrl.clone();
  target.pathname = "/api/auth/zhihu/callback";
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: "/",
};
