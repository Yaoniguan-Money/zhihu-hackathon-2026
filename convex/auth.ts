import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

// PF1：P0 采用 Convex Auth 的 Anonymous 身份（ADR 0004）。
// 权限一律从服务端认证上下文获得；业务对象不携带访问令牌。
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
