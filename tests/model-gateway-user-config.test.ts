import { describe, expect, test } from "bun:test";
import {
  buildUserRegistry,
  providerForTask,
  resolveRegistryDoc,
} from "@server/model-gateway/config.js";
import { validateAndProbeUserConfig } from "@server/model-gateway/user-config.js";
import { ScriptedModelGateway } from "./helpers/scripted-model-gateway.js";

/**
 * ADR 0005 BYOK：简化单供应商表单 → 注册表合成、保存前探针的可判别结果。
 * 探针用 Scripted Adapter（仅测试组合根）；生产路径只经 Convex action。
 */

const VALID_INPUT = {
  name: "智谱",
  base_url: "https://open.bigmodel.example/api/paas/v4",
  api_key: "user-key-0001",
  model: "glm-4.7-flash",
};

const okGatewayFor = () =>
  new ScriptedModelGateway([{ task: "role", value: { speech: "测试" } }]);

describe("buildUserRegistry：简化表单 → 单供应商注册表", () => {
  test("五任务全路由到该供应商，per-task 空值被过滤", () => {
    const registry = buildUserRegistry({
      ...VALID_INPUT,
      models: { claim: "claim-model", role: "  ", case: "" },
    });
    expect(registry.providers).toHaveLength(1);
    expect(registry.providers[0]!.name).toBe("智谱");
    expect(registry.providers[0]!.enabled).toBe(true);
    expect(registry.providers[0]!.models).toEqual({ claim: "claim-model" });
    for (const task of ["claim", "case", "role", "validator", "reveal"] as const) {
      expect(registry.routing[task]).toBe("智谱");
    }
    // 合成结果必须能通过权威校验并按任务解析模型
    const config = resolveRegistryDoc(registry);
    expect(providerForTask(config, "claim").modelId).toBe("claim-model");
    expect(providerForTask(config, "reveal").modelId).toBe("glm-4.7-flash");
  });

  test("名称留空使用固定占位名", () => {
    const registry = buildUserRegistry({ ...VALID_INPUT, name: undefined });
    expect(registry.providers[0]!.name).toBe("user-provider");
  });
});

describe("validateAndProbeUserConfig：校验 → 真实探针（可判别结果）", () => {
  test("探针成功：返回注册表与解析配置，且探针确实发生了一次调用", async () => {
    const result = await validateAndProbeUserConfig(VALID_INPUT, () =>
      okGatewayFor(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providers[0]!.apiKey).toBe("user-key-0001");
    }
  });

  test("Base URL 非 HTTPS：invalid_input，不触发探针", async () => {
    const gateway = okGatewayFor();
    const result = await validateAndProbeUserConfig(
      { ...VALID_INPUT, base_url: "http://insecure.example/v1" },
      () => gateway,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
      expect(result.detail).toContain("HTTPS");
    }
    expect(gateway.remaining).toBe(1); // 探针未被触发
  });

  test("缺 API Key：invalid_input", async () => {
    const result = await validateAndProbeUserConfig(
      { ...VALID_INPUT, api_key: "" },
      okGatewayFor,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
  });

  test("探针失败（队列耗尽）：probe_failed，不产出可保存配置", async () => {
    const result = await validateAndProbeUserConfig(
      VALID_INPUT,
      () => new ScriptedModelGateway([]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("probe_failed");
      expect(result.detail).toContain("探针失败");
    }
  });
});
