// Convex Auth 后端配置（与 auth.ts 组件配套，PF1/ADR 0004）。
// JWT 由本部署的 site proxy 签发（issuer = CONVEX_SITE_URL）。
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
