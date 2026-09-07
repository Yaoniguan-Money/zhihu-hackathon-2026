import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { OpenAICompatibleModelGateway } from "../server/model-gateway/openai-compatible-gateway.js";
import { resolveRegistryDoc } from "../server/model-gateway/config.js";

/**
 * 网关运行时解析（ADR 0003 补充决议）：优先 Convex 表 ai_provider_config
 * （管理页保存后下一次调用即生效），表为空回退八项 AI_* 环境变量。
 * 两种来源都是显式配置；解析失败仍为 typed failure，无任何代码默认。
 */
export async function modelGatewayFor(
  ctx: ActionCtx,
): Promise<OpenAICompatibleModelGateway> {
  const doc = await ctx.runQuery(internal.aiConfig.resolveRegistry);
  if (doc) {
    const config = resolveRegistryDoc(JSON.parse(doc.registry_json));
    return new OpenAICompatibleModelGateway(config);
  }
  return OpenAICompatibleModelGateway.fromEnv();
}
