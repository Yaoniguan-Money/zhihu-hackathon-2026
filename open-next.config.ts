import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 整站部署到 Cloudflare Workers（2026-09-14）。
// 无增量缓存 / 无 R2 / 无 DO 队列：本站是展示与对局编排，ISR 缓存不参与契约。
export default defineCloudflareConfig();
