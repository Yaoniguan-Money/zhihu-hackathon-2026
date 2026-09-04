import { z } from "zod";
import type { PrivateFailure } from "@contracts/private/index.js";

/**
 * Model Gateway 显式配置（ENGINEERING_SPEC 第 6 节 / ADR 0003）。
 * 八项全部必填、无默认、不继承、不读取任何其他环境变量
 * （包括 DEEPSEEK_API_KEY、DASHSCOPE_API_KEY 等工具密钥）。
 * 缺配置 → 私有失败 MODEL_CONFIG_MISSING（公开映射 SERVICE_NOT_CONFIGURED）。
 */

export const AI_CONFIG_KEYS = [
  "AI_PROVIDER_NAME",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_CLAIM_MODEL",
  "AI_CASE_MODEL",
  "AI_ROLE_MODEL",
  "AI_VALIDATOR_MODEL",
  "AI_REVEAL_MODEL",
] as const;

export type AiConfigKey = (typeof AI_CONFIG_KEYS)[number];

export const MODEL_TASKS = [
  "claim",
  "case",
  "role",
  "validator",
  "reveal",
] as const;

export type ModelTask = (typeof MODEL_TASKS)[number];

const TASK_TO_CONFIG_KEY: Record<ModelTask, AiConfigKey> = {
  claim: "AI_CLAIM_MODEL",
  case: "AI_CASE_MODEL",
  role: "AI_ROLE_MODEL",
  validator: "AI_VALIDATOR_MODEL",
  reveal: "AI_REVEAL_MODEL",
};

export interface ModelGatewayConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  /** 每个任务显式配置的模型 ID；不同任务允许填相同值，但不允许缺省继承。 */
  models: Record<ModelTask, string>;
}

export function modelConfigMissingFailure(
  missingKeys: AiConfigKey[],
): PrivateFailure {
  return {
    code: "MODEL_CONFIG_MISSING",
    incident_id: `cfg:${missingKeys.slice().sort().join(",")}`,
    detail: `缺少必填配置项: ${missingKeys.slice().sort().join(", ")}`,
  };
}

export class ModelConfigMissingError extends Error {
  readonly failure: PrivateFailure;

  constructor(failure: PrivateFailure) {
    super(failure.detail ?? "MODEL_CONFIG_MISSING");
    this.name = "ModelConfigMissingError";
    this.failure = failure;
  }
}

const httpsUrlSchema = z.url({ protocol: /^https$/ });

/**
 * 从给定环境读取配置。只读取 AI_CONFIG_KEYS 列出的八个名字；
 * env 参数仅用于测试注入，生产调用使用 process.env。
 */
export function loadModelGatewayConfig(
  env: Record<string, string | undefined> = process.env,
): ModelGatewayConfig {
  const missing = AI_CONFIG_KEYS.filter(
    (key) => env[key] === undefined || env[key]!.trim() === "",
  );
  if (missing.length > 0) {
    throw new ModelConfigMissingError(modelConfigMissingFailure(missing));
  }

  const baseUrl = httpsUrlSchema.safeParse(env.AI_BASE_URL);
  if (!baseUrl.success) {
    throw new ModelConfigMissingError({
      code: "MODEL_CONFIG_MISSING",
      incident_id: "cfg:AI_BASE_URL_INVALID",
      detail: "AI_BASE_URL 必须是绝对 HTTPS URL",
    });
  }

  return {
    providerName: env.AI_PROVIDER_NAME!.trim(),
    baseUrl: baseUrl.data,
    apiKey: env.AI_API_KEY!,
    models: {
      claim: env.AI_CLAIM_MODEL!.trim(),
      case: env.AI_CASE_MODEL!.trim(),
      role: env.AI_ROLE_MODEL!.trim(),
      validator: env.AI_VALIDATOR_MODEL!.trim(),
      reveal: env.AI_REVEAL_MODEL!.trim(),
    },
  };
}

export function modelIdForTask(
  config: ModelGatewayConfig,
  task: ModelTask,
): string {
  return config.models[task];
}

export { TASK_TO_CONFIG_KEY };
