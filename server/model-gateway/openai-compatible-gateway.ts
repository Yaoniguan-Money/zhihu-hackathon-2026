import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, tool } from "ai";
import type { z } from "zod";
import type { PrivateFailure } from "@contracts/private/index.js";
import {
  legacyEnvToRegistry,
  loadModelGatewayConfig,
  providerForTask,
  type ModelGatewayConfig,
  type ModelTask,
  type ResolvedGatewayConfig,
} from "./config.js";

/**
 * Model Gateway（ENGINEERING_SPEC 第 6 节 / ADR 0003 + 补充决议）：真实外部 Seam。
 * 生产 Adapter 使用 AI SDK 的 OpenAI-compatible provider 与结构化输出；
 * 支持多供应商注册表与每任务显式路由（配置驱动，非失败恢复）。
 * SDK/provider 自动重试固定为 0；协议或 schema 错误是 typed failure，
 * 不得抽取自然语言代码块、补括号、修 JSON 或切换供应商。
 */

export interface StructuredModelCall<TSchema extends z.ZodType> {
  task: ModelTask;
  /** 稳定的结构化输出名称（进入 provider 的 schema 标识，不含秘密）。 */
  schemaName: string;
  system: string;
  prompt: string;
  schema: TSchema;
}

export interface ModelGateway {
  generateStructured<TSchema extends z.ZodType>(
    call: StructuredModelCall<TSchema>,
  ): Promise<z.infer<TSchema>>;
}

export class ModelRequestFailedError extends Error {
  readonly failure: PrivateFailure;

  constructor(failure: PrivateFailure, cause?: unknown) {
    super(failure.detail ?? failure.code);
    this.name = "ModelRequestFailedError";
    this.failure = failure;
    this.cause = cause;
  }
}

function newIncidentId(): string {
  return `inc:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

/** 生产 Adapter：显式配置的 OpenAI-compatible 网关（多供应商注册表 + 每任务路由）。 */
export class OpenAICompatibleModelGateway implements ModelGateway {
  private readonly config: ResolvedGatewayConfig;

  constructor(config: ResolvedGatewayConfig | ModelGatewayConfig) {
    this.config =
      "providers" in config
        ? config
        : legacyEnvToRegistry(config as ModelGatewayConfig);
  }

  static fromEnv(
    env: Record<string, string | undefined> = process.env,
  ): OpenAICompatibleModelGateway {
    return new OpenAICompatibleModelGateway(loadModelGatewayConfig(env));
  }

  async generateStructured<TSchema extends z.ZodType>(
    call: StructuredModelCall<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const { provider, modelId } = providerForTask(this.config, call.task);
    const aiProvider = createOpenAICompatible({
      name: provider.name,
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
    });
    const model = aiProvider(modelId);

    let result;
    try {
      result = await generateObject({
        model,
        schema: call.schema,
        schemaName: call.schemaName,
        system: call.system,
        prompt: call.prompt,
        maxRetries: 0,
        tool: tool({ schema: call.schema, name: call.schemaName }),
        toolChoice: "required",
      });
    } catch (error) {
      throw new ModelRequestFailedError(
        {
          code: "MODEL_REQUEST_FAILED",
          incident_id: newIncidentId(),
          detail: `任务 ${call.task} 的模型请求失败（provider=${provider.name}）`,
        },
        error,
      );
    }

    // generateObject 已按 schema 校验；此处仍经运行时 schema 严格复验，
    // 使 provider 行为差异（如额外字段）无法进入服务端。
    const parsed = call.schema.safeParse(result.object);
    if (!parsed.success) {
      throw new ModelRequestFailedError({
        code: "MODEL_PROTOCOL_INVALID",
        incident_id: newIncidentId(),
        detail: `任务 ${call.task} 的模型输出不符合 schema（provider=${provider.name}）`,
      });
    }
    return parsed.data;
  }
}
