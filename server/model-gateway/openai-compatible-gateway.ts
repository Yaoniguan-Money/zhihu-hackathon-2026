import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import type { z } from "zod";
import type { PrivateFailure } from "@contracts/private/index.js";
import {
  loadModelGatewayConfig,
  modelIdForTask,
  type ModelGatewayConfig,
  type ModelTask,
} from "./config.js";

/**
 * Model Gateway（ENGINEERING_SPEC 第 6 节 / ADR 0003）：真实外部 Seam。
 * 生产 Adapter 使用 AI SDK 的 OpenAI-compatible provider 与结构化输出。
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

/** 生产 Adapter：显式配置的 OpenAI-compatible 网关。 */
export class OpenAICompatibleModelGateway implements ModelGateway {
  private readonly config: ModelGatewayConfig;

  constructor(config: ModelGatewayConfig) {
    this.config = config;
  }

  static fromEnv(
    env: Record<string, string | undefined> = process.env,
  ): OpenAICompatibleModelGateway {
    return new OpenAICompatibleModelGateway(loadModelGatewayConfig(env));
  }

  async generateStructured<TSchema extends z.ZodType>(
    call: StructuredModelCall<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const provider = createOpenAICompatible({
      name: this.config.providerName,
      baseURL: this.config.baseUrl,
      apiKey: this.config.apiKey,
    });
    const model = provider(modelIdForTask(this.config, call.task));

    let result;
    try {
      result = await generateObject({
        model,
        schema: call.schema,
        schemaName: call.schemaName,
        system: call.system,
        prompt: call.prompt,
        maxRetries: 0,
      });
    } catch (error) {
      throw new ModelRequestFailedError(
        {
          code: "MODEL_REQUEST_FAILED",
          incident_id: newIncidentId(),
          detail: `任务 ${call.task} 的模型请求失败`,
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
        detail: `任务 ${call.task} 的模型输出不符合 schema`,
      });
    }
    return parsed.data;
  }
}
