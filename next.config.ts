import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 防护默认只认 localhost；允许用 127.0.0.1 访问开发资源（仅影响 next dev）。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
