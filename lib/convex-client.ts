"use client";

import { ConvexReactClient } from "convex/react";

/**
 * B 端唯一 Convex 客户端实例：同时供 React Provider 与 XState actors 使用。
 * 服务端地址来自显式环境变量；缺失时直接失败（不内置默认值）。
 */
const url = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!url) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL 未配置：浏览器数据面没有可用的权威服务地址",
  );
}

export const convexClient = new ConvexReactClient(url);

export function newClientActionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 兜底（crypto.randomUUID 之外的运行时）。
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
