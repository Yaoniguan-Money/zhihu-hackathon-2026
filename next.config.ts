import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 防护默认只认 localhost；允许用 127.0.0.1 访问开发资源（仅影响 next dev）。
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    resolveAlias: {
      // @convex-dev/auth/react 以 `convex/browser` 引 ConvexHttpClient；服务端
      // （node 条件）会解析到 convex 自带的 index-node.js，其内联的 ws 在
      // Workers 模块求值即崩。固定到 browser 版入口：WebSocket 走全局实现，
      // Node 24 与 Workers 均可用；浏览器侧解析结果本就是同一文件，行为不变。
      "convex/browser": "./node_modules/convex/dist/esm/browser/index.js",
    },
  },
};

export default nextConfig;
