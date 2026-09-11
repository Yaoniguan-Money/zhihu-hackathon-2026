import {
  buildUserRegistry,
  resolveRegistryDoc,
  userModelConfigInputSchema,
  type ProviderRegistryDoc,
  type ResolvedGatewayConfig,
} from "./config.js";
import type { ModelGateway } from "./openai-compatible-gateway.js";
import { probeUserModelConfig } from "./user-config-probe.js";

/**
 * BYOK 用户级配置保存的核心流程（ADR 0005）：校验 → 真实连通性探针。
 * 返回可判别结果而非抛错，由 Convex 层映射为 typed failure；
 * gateway 以工厂注入（生产 OpenAICompatibleModelGateway / 测试 Scripted）。
 * 探针失败不产出可保存的配置，调用方不得落库。
 */

export type UserConfigValidation =
  | {
      ok: true;
      registry: ProviderRegistryDoc;
      config: ResolvedGatewayConfig;
    }
  | { ok: false; reason: "invalid_input"; detail: string }
  | { ok: false; reason: "probe_failed"; detail: string };

export async function validateAndProbeUserConfig(
  input: unknown,
  gatewayFor: (config: ResolvedGatewayConfig) => ModelGateway,
): Promise<UserConfigValidation> {
  const parsed = userModelConfigInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_input",
      detail: `配置格式不合法：${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "表单"} ${i.message}`)
        .join("；")}`,
    };
  }
  let registry: ProviderRegistryDoc;
  let config: ResolvedGatewayConfig;
  try {
    // 结构化输出能力检测：优先用 API 级 response_format: json_schema 探针；
    // 该调用失败（供应商不支持或拒绝该参数）时退回默认提示词注入模式再探。
    // 两次都失败才判 probe_failed；任一成功即按对应能力位落库。
    registry = buildUserRegistry(parsed.data, true);
    config = resolveRegistryDoc(registry);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_input",
      detail:
        error instanceof Error && error.message
          ? error.message
          : "配置格式不合法",
    };
  }
  try {
    try {
      await probeUserModelConfig(gatewayFor(config));
    } catch {
      registry = buildUserRegistry(parsed.data, false);
      config = resolveRegistryDoc(registry);
      await probeUserModelConfig(gatewayFor(config));
    }
  } catch (error) {
    return {
      ok: false,
      reason: "probe_failed",
      detail:
        error instanceof Error && error.message
          ? `模型服务探针失败：${error.message}`
          : "模型服务探针失败",
    };
  }
  return { ok: true, registry, config };
}
