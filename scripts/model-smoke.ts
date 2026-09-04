/**
 * PF1 真实模型供应商 smoke（人工执行，不属于 bun test 套件）。
 *
 * 运行：`bun scripts/model-smoke.ts`
 * 前置：gitignored 的 `.env.local` 已含八项 AI_* 显式配置（ENGINEERING_SPEC 第 6 节）。
 * 只打印模型返回与耗时；绝不打印 AI_API_KEY。
 */
import { z } from "zod";
import {
  loadModelGatewayConfig,
  modelIdForTask,
} from "@server/model-gateway/config.js";
import {
  OpenAICompatibleModelGateway,
} from "@server/model-gateway/openai-compatible-gateway.js";

const schema = z.strictObject({
  verdict: z.literal("pass"),
  note: z.string().min(1).max(200),
});

const config = loadModelGatewayConfig();
const gateway = new OpenAICompatibleModelGateway(config);

const started = Date.now();
const result = await gateway.generateStructured({
  task: "claim",
  schemaName: "pf1_smoke",
  system: "你是结构化输出测试助手，只按给定 schema 返回 JSON。",
  prompt: "命题：「本请求用于验证真实模型供应商连通性」。请返回验证结果：verdict 填 pass，note 用不超过 20 个汉字说明。",
  schema,
});

console.log("smoke_ok:", JSON.stringify(result));
console.log(
  "provider:",
  config.providerName,
  "| task=claim model:",
  modelIdForTask(config, "claim"),
  "| elapsed_ms:",
  Date.now() - started,
);
