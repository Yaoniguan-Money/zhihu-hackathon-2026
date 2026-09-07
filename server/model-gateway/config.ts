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

/**
 * 多供应商注册表（ADR 0003 补充决议，2026-09-07）。
 * 注册表允许 N 个 OpenAI-compatible 供应商，五个任务显式路由到已启用供应商；
 * 路由是配置驱动的选择而非失败恢复，请求内静默切换仍被禁止。
 */
export interface ProviderEntry {
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  /** 每任务模型；缺失时回退到 model 默认值（均为显式配置，不是代码默认）。 */
  models: Partial<Record<ModelTask, string>>;
  model?: string;
}

export interface ResolvedGatewayConfig {
  providers: ProviderEntry[];
  routing: Record<ModelTask, string>;
}

export const providerRegistrySchema = z.object({
  providers: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        base_url: z.string().trim(),
        api_key: z.string(),
        enabled: z.boolean(),
        model: z.string().trim().optional(),
        models: z
          .object({
            claim: z.string().trim().optional(),
            case: z.string().trim().optional(),
            role: z.string().trim().optional(),
            validator: z.string().trim().optional(),
            reveal: z.string().trim().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
  routing: z.object({
    claim: z.string().trim().min(1),
    case: z.string().trim().min(1),
    role: z.string().trim().min(1),
    validator: z.string().trim().min(1),
    reveal: z.string().trim().min(1),
  }),
});

export type ProviderRegistryDoc = z.infer<typeof providerRegistrySchema>;

/** 八项 AI_* 环境变量 → 单供应商注册表（回退路径，语义与原版完全一致）。 */
export function legacyEnvToRegistry(
  config: ModelGatewayConfig,
): ResolvedGatewayConfig {
  return {
    providers: [
      {
        name: config.providerName,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        enabled: true,
        models: { ...config.models },
      },
    ],
    routing: {
      claim: config.providerName,
      case: config.providerName,
      role: config.providerName,
      validator: config.providerName,
      reveal: config.providerName,
    },
  };
}

function configMissing(detail: string): ModelConfigMissingError {
  return new ModelConfigMissingError({
    code: "MODEL_CONFIG_MISSING",
    incident_id: "cfg:provider_registry",
    detail,
  });
}

/** Convex 表文档 → 已解析网关配置；校验失败抛 MODEL_CONFIG_MISSING。 */
export function resolveRegistryDoc(doc: unknown): ResolvedGatewayConfig {
  const parsed = providerRegistrySchema.safeParse(doc);
  if (!parsed.success) {
    throw configMissing(
      `供应商注册表格式无效: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const raw = parsed.data;
  const providers: ProviderEntry[] = raw.providers.map((p) => ({
    name: p.name,
    baseUrl: p.base_url,
    apiKey: p.api_key,
    enabled: p.enabled,
    model: p.model,
    models: {
      claim: p.models?.claim,
      case: p.models?.case,
      role: p.models?.role,
      validator: p.models?.validator,
      reveal: p.models?.reveal,
    },
  }));
  const config: ResolvedGatewayConfig = { providers, routing: { ...raw.routing } };
  // 配置层校验：URL 合法、路由目标存在、启用供应商密钥非空。任务模型缺失
  // 只在实际路由到该任务时失败（允许登记暂未用到的供应商）。
  const byName = new Map(providers.map((p) => [p.name, p]));
  for (const task of MODEL_TASKS) {
    const target = byName.get(config.routing[task]);
    if (!target) {
      throw configMissing(
        `任务 ${task} 路由到未登记的供应商 "${config.routing[task]}"`,
      );
    }
  }
  for (const p of providers) {
    if (!httpsUrlSchema.safeParse(p.baseUrl).success) {
      throw configMissing(`供应商 ${p.name} 的 Base URL 必须是绝对 HTTPS URL`);
    }
    if (p.enabled && p.apiKey.trim() === "") {
      throw configMissing(`启用中的供应商 ${p.name} 缺少 API Key`);
    }
  }
  return config;
}

/** 按任务路由解析供应商与模型；任何缺口都是显式 typed failure。 */
export function providerForTask(
  config: ResolvedGatewayConfig,
  task: ModelTask,
): { provider: ProviderEntry; modelId: string } {
  const provider = config.providers.find(
    (p) => p.name === config.routing[task],
  );
  if (!provider) {
    throw configMissing(`任务 ${task} 路由到未登记的供应商`);
  }
  if (!provider.enabled) {
    throw configMissing(
      `任务 ${task} 路由到的供应商 ${provider.name} 已被禁用`,
    );
  }
  const modelId = provider.models[task] ?? provider.model;
  if (modelId === undefined || modelId.trim() === "") {
    throw configMissing(
      `供应商 ${provider.name} 未为任务 ${task} 显式配置模型 ID`,
    );
  }
  return { provider, modelId: modelId.trim() };
}
