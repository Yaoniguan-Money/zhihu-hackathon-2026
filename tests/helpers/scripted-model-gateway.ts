import type { z } from "zod";
import {
  ModelRequestFailedError,
  type ModelGateway,
  type StructuredModelCall,
} from "../../server/model-gateway/openai-compatible-gateway.js";

/**
 * Scripted Adapter —— 仅测试组合根使用（ENGINEERING_SPEC 第 6 节）。
 * 生产配置和构建路径不得引用本文件；它位于 tests/ 下，Next.js 构建不会打包。
 * 队列耗尽即失败，绝不静默复用上一条脚本结果。
 */

export interface ScriptedResult {
  /** 匹配的 task；undefined 表示匹配任意任务（用于单接口测试）。 */
  task?: string;
  /** 将被结构化 schema 校验的对象（必须能通过调用方的 schema）。 */
  value: unknown;
}

export class ScriptedModelGateway implements ModelGateway {
  private queue: ScriptedResult[];

  constructor(scriptedResults: ScriptedResult[]) {
    this.queue = [...scriptedResults];
  }

  get remaining(): number {
    return this.queue.length;
  }

  async generateStructured<TSchema extends z.ZodType>(
    call: StructuredModelCall<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const next = this.queue.shift();
    if (next === undefined) {
      throw new ModelRequestFailedError({
        code: "MODEL_REQUEST_FAILED",
        incident_id: "scripted:exhausted",
        detail: "Scripted 队列已耗尽",
      });
    }
    if (next.task !== undefined && next.task !== call.task) {
      throw new ModelRequestFailedError({
        code: "MODEL_PROTOCOL_INVALID",
        incident_id: "scripted:task-mismatch",
        detail: `Scripted 结果任务不匹配: 期望 ${call.task}，实际 ${next.task}`,
      });
    }
    const parsed = call.schema.safeParse(next.value);
    if (!parsed.success) {
      throw new ModelRequestFailedError({
        code: "MODEL_PROTOCOL_INVALID",
        incident_id: "scripted:schema-mismatch",
        detail: "Scripted 结果不符合调用方 schema",
      });
    }
    return parsed.data;
  }
}
