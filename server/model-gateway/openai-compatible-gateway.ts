import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
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

/**
 * 网络类瞬时错误判定（2026-09-11 用户批准的传输层重试口径）：
 * 连接断开（无 HTTP 状态码的 APICallError / fetch TypeError）、5xx、429、408。
 * 注意 AI SDK 自带 maxRetries 不覆盖"无状态码的连接断开"（其 isRetryable
 * 判定要求 statusCode ∈ {408,409,429} 或 ≥500），故重试由本网关手动实现。
 * schema 解析（NoObjectGeneratedError）、协议、4xx（除上述）与配置错误不重试。
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  if (name === "AI_NoObjectGeneratedError" || name === "AI_NoEmbeddingGeneratedError") {
    return false;
  }
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status === "number") {
    return status >= 500 || status === 408 || status === 409 || status === 429;
  }
  // 无状态码：连接级失败（socket 断开 / fetch failed / 响应中断）。
  if (name === "AI_APICallError" || name === "TypeError") return true;
  // 请求超时 abort（AbortSignal 手动触发）：对端挂起不回包，与 408 同类。
  return name === "AbortError" || name === "TimeoutError";
}

/** 网络类瞬时错误的传输层重试上限（不含首次调用）。 */
export const NETWORK_RETRY_MAX = 2;

/**
 * 单次模型请求的无响应超时（2026-09-12）：挂起的连接（对端不回包也不断开）
 * 原本既不报错也不重试，回合会一直停在"working"，前端"正在回答"无限计时。
 * 超时 abort 与 408 同属网络类瞬时错误，走既定传输层重试（一般 2 次），
 * 重试耗尽后抛明确 typed failure，不静默吞掉。
 */
export const REQUEST_TIMEOUT_MS = 120_000;

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
      // 能力位（保存时探针检测）：true 时 generateObject 走 API 级
      // response_format: json_schema 强制 JSON，消除提示词注入模式下
      // 模型偶尔输出纯文本导致的解析失败。
      supportsStructuredOutputs: provider.supportsStructuredOutputs ?? false,
    });
    const model = aiProvider(modelId);

    let result;
    {
      // 传输层重试（2026-09-11 用户批准）：仅网络类瞬时错误，最多 2 次
      // 重试（指数退避 500ms/1000ms）。SDK 自带 maxRetries 不覆盖无状态码
      // 的连接断开，故由本网关实现；其余错误立即失败不掩盖。
      for (let attempt = 0; ; attempt += 1) {
        // 单次请求无响应超时：挂起连接按网络类瞬时错误处理（见 REQUEST_TIMEOUT_MS）。
        const abortController = new AbortController();
        const timeoutTimer = setTimeout(
          () => abortController.abort(),
          REQUEST_TIMEOUT_MS,
        );
        try {
          result = await generateObject({
            model,
            schema: call.schema,
            schemaName: call.schemaName,
            system: call.system,
            prompt: call.prompt,
            maxRetries: 0,
            abortSignal: abortController.signal,
          });
          break;
        } catch (error) {
          if (
            attempt < NETWORK_RETRY_MAX &&
            isTransientNetworkError(error)
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, 500 * 2 ** attempt),
            );
            continue;
          }
          throw new ModelRequestFailedError(
            {
              code: "MODEL_REQUEST_FAILED",
              incident_id: newIncidentId(),
              detail: `任务 ${call.task} 的模型请求失败（provider=${provider.name}）`,
            },
            error,
          );
        } finally {
          clearTimeout(timeoutTimer);
        }
      }
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
