import { z } from "zod";
import type { ModelGateway } from "./openai-compatible-gateway.js";

/**
 * BYOK 保存前连通性探针（ADR 0005）：用待保存配置做一次最小结构化调用。
 * 探针失败 → typed failure 且不落库；测试组合根可注入 Scripted Adapter。
 */

const probeOutputSchema = z.object({ speech: z.string() });

export interface UserConfigProbeResult {
  speech: string;
}

export const USER_CONFIG_PROBE_SCHEMA_NAME = "user-config-probe";

export async function probeUserModelConfig(
  gateway: ModelGateway,
): Promise<UserConfigProbeResult> {
  return gateway.generateStructured({
    task: "role",
    schemaName: USER_CONFIG_PROBE_SCHEMA_NAME,
    system: "只输出 JSON。",
    prompt: '输出 {"speech":"测试"}',
    schema: probeOutputSchema,
  });
}
