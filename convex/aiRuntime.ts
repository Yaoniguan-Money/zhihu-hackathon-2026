import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { OpenAICompatibleModelGateway } from "../server/model-gateway/openai-compatible-gateway.js";
import {
  ModelConfigMissingError,
  resolveRegistryDoc,
} from "../server/model-gateway/config.js";

/**
 * 网关运行时解析（ADR 0005）：模型配置的唯一来源是调用者本人在前端设置里
 * 保存的 ai_user_provider_config 注册表，每次模型调用实时解析（保存后下一跳
 * 即生效），无全局注册表或环境变量回退。未配置 → MODEL_CONFIG_MISSING
 * （公开映射 SERVICE_NOT_CONFIGURED，文案引导去设置）。
 */
export async function modelGatewayFor(
  ctx: ActionCtx,
  ownerIdentity: string,
): Promise<OpenAICompatibleModelGateway> {
  const doc = await ctx.runQuery(internal.userModelConfig.resolveUserRegistry, {
    owner_identity: ownerIdentity,
  });
  if (!doc) {
    throw new ModelConfigMissingError({
      code: "MODEL_CONFIG_MISSING",
      incident_id: "cfg:user-not-configured",
      detail: "用户尚未配置模型服务：请在设置中填写你的模型 API 配置",
    });
  }
  const config = resolveRegistryDoc(JSON.parse(doc.registry_json));
  return new OpenAICompatibleModelGateway(config);
}
