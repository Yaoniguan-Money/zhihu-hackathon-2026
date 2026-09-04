import { describe, expect, test } from "bun:test";
import {
  AI_CONFIG_KEYS,
  ModelConfigMissingError,
  loadModelGatewayConfig,
  modelIdForTask,
} from "@server/model-gateway/config.js";
import {
  OpenAICompatibleModelGateway,
} from "@server/model-gateway/openai-compatible-gateway.js";
import {
  ScriptedModelGateway,
} from "./helpers/scripted-model-gateway.js";
import { z } from "zod";

const FULL_ENV: Record<string, string> = {
  AI_PROVIDER_NAME: "deepseek",
  AI_BASE_URL: "https://api.deepseek.example/v1",
  AI_API_KEY: "test-key-0001",
  AI_CLAIM_MODEL: "max-model",
  AI_CASE_MODEL: "max-model",
  AI_ROLE_MODEL: "flash-model",
  AI_VALIDATOR_MODEL: "max-model",
  AI_REVEAL_MODEL: "max-model",
};

describe("AI_* 显式配置", () => {
  test("八项齐全时成功，且任务→模型映射显式", () => {
    const config = loadModelGatewayConfig(FULL_ENV);
    expect(config.providerName).toBe("deepseek");
    expect(modelIdForTask(config, "role")).toBe("flash-model");
    expect(modelIdForTask(config, "claim")).toBe("max-model");
  });

  test("缺少任意一项都抛 MODEL_CONFIG_MISSING，并指明缺哪些键", () => {
    for (const key of AI_CONFIG_KEYS) {
      const env = { ...FULL_ENV };
      delete env[key];
      try {
        loadModelGatewayConfig(env);
        throw new Error(`应当因缺少 ${key} 而失败`);
      } catch (error) {
        expect(error).toBeInstanceOf(ModelConfigMissingError);
        const failure = (error as ModelConfigMissingError).failure;
        expect(failure.code).toBe("MODEL_CONFIG_MISSING");
        expect(failure.incident_id).toContain(key);
      }
    }
  });

  test("空白值视同缺失", () => {
    const env = { ...FULL_ENV, AI_API_KEY: "   " };
    expect(() => loadModelGatewayConfig(env)).toThrow(ModelConfigMissingError);
  });

  test("不读取其他工具的环境变量：只有 DEEPSEEK_API_KEY 不构成配置", () => {
    expect(() =>
      loadModelGatewayConfig({ DEEPSEEK_API_KEY: "leaked-key", DASHSCOPE_API_KEY: "x" }),
    ).toThrow(ModelConfigMissingError);
  });

  test("AI_BASE_URL 必须是绝对 HTTPS URL", () => {
    expect(() =>
      loadModelGatewayConfig({ ...FULL_ENV, AI_BASE_URL: "api.example.com/v1" }),
    ).toThrow(ModelConfigMissingError);
    expect(() =>
      loadModelGatewayConfig({ ...FULL_ENV, AI_BASE_URL: "http://api.example.com/v1" }),
    ).toThrow(ModelConfigMissingError);
  });
});

describe("生产 Adapter（不发起网络请求）", () => {
  test("可由显式配置构造，任务映射来自配置而非默认值", () => {
    const config = loadModelGatewayConfig(FULL_ENV);
    const gateway = new OpenAICompatibleModelGateway(config);
    expect(gateway).toBeInstanceOf(OpenAICompatibleModelGateway);
    expect(modelIdForTask(config, "validator")).toBe("max-model");
  });

  test("缺配置时 fromEnv 直接失败，不构造半成品 Adapter", () => {
    const saved = { ...process.env };
    try {
      for (const key of AI_CONFIG_KEYS) delete process.env[key];
      expect(() => OpenAICompatibleModelGateway.fromEnv()).toThrow(
        ModelConfigMissingError,
      );
    } finally {
      process.env = saved;
    }
  });
});

describe("Scripted Adapter（仅测试组合根）", () => {
  const schema = z.strictObject({ speech: z.string().min(1) });

  test("按队列返回，并通过调用方 schema 校验", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: { speech: "第一条" } },
      { task: "role", value: { speech: "第二条" } },
    ]);
    const call = {
      task: "role" as const,
      schemaName: "role_candidate",
      system: "s",
      prompt: "p",
      schema,
    };
    expect((await gateway.generateStructured(call)).speech).toBe("第一条");
    expect((await gateway.generateStructured(call)).speech).toBe("第二条");
    expect(gateway.remaining).toBe(0);
  });

  test("队列耗尽显式失败，不静默复用", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: { speech: "唯一一条" } },
    ]);
    const call = {
      task: "role" as const,
      schemaName: "role_candidate",
      system: "s",
      prompt: "p",
      schema,
    };
    await gateway.generateStructured(call);
    await expect(gateway.generateStructured(call)).rejects.toThrow();
  });

  test("任务不匹配或 schema 不匹配都是显式失败", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "claim", value: { speech: "错位" } },
      { task: "role", value: { wrong: true } },
    ]);
    const call = {
      task: "role" as const,
      schemaName: "role_candidate",
      system: "s",
      prompt: "p",
      schema,
    };
    await expect(gateway.generateStructured(call)).rejects.toThrow();
    await expect(gateway.generateStructured(call)).rejects.toThrow();
  });
});
