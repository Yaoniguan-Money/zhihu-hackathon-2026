import { describe, expect, test } from "bun:test";
import { ScriptedModelGateway } from "./helpers/scripted-model-gateway.js";
import {
  runGenerationAttempts,
  type TurnAttemptContext,
} from "@server/turn-engine/run-turn.js";
import { rolePrivatePolicySchema } from "@contracts/private/index.js";

/**
 * TB5/TB6：生成-校验-重写循环的确定性覆盖（Scripted Adapter，无网络）。
 * 覆盖 SPEC §7：忠实首试/一次重写/两次重写/三次全拒；协议错误不进入语义重写；
 * Distorted 单次候选、允许集门控、无重写兜底。
 */

function faithfulContext(): TurnAttemptContext {
  return {
    policy: rolePrivatePolicySchema.parse({
      role_id: "role-observer",
      fidelity: "faithful",
      visible_claim_ids: ["cl-002", "cl-004"],
      goal: "用可核实的数据说明裁员潮规模。",
      allowed_distortion_types: [],
    }),
    displayName: "沈青梧",
    visibleClaims: [
      { claim_id: "cl-002", proposition: "2026年3月全球互联网陷入裁员泥淖。" },
      { claim_id: "cl-004", proposition: "Meta 计划裁减约20%员工，涉及约1.58万人。" },
    ],
    history: [],
    question: "Meta 裁员数据？",
    mode: "direct",
    incidentRef: "req-test",
  };
}

function distortedContext(): TurnAttemptContext {
  return {
    policy: rolePrivatePolicySchema.parse({
      role_id: "role-skeptic",
      fidelity: "distorted",
      visible_claim_ids: ["cl-011", "cl-012"],
      goal: "放大范围、删除条件。",
      allowed_distortion_types: ["scope_expand", "condition_delete"],
    }),
    displayName: "柳成荫",
    visibleClaims: [
      { claim_id: "cl-011", proposition: "工具成熟让初级程序员成为第一批牺牲品。" },
      { claim_id: "cl-012", proposition: "当 AI 初稿+守门员精修时，内容从业者便成冗余。" },
    ],
    history: [],
    question: "程序员危险吗？",
    mode: "pressure",
    incidentRef: "req-test-d",
  };
}

const candidate = {
  speech: "Meta 计划裁减约20%的员工。",
  support_claim_ids: ["cl-004"],
  stance: "answer",
  emotion: "calm",
};
const entailed = {
  status: "entailed",
  detected_distortion_types: [],
  unsupported_spans: [],
  referenced_claim_ids: ["cl-004"],
  confidence: 0.95,
};
const distortedFail = {
  status: "distorted",
  detected_distortion_types: ["scope_expand"],
  unsupported_spans: [],
  referenced_claim_ids: ["cl-004"],
  confidence: 0.9,
};
const distortedPass = {
  status: "distorted",
  detected_distortion_types: ["scope_expand", "condition_delete"],
  unsupported_spans: [],
  referenced_claim_ids: ["cl-011"],
  confidence: 0.92,
};
const distortedCandidate = {
  speech: "程序员整体都是第一批牺牲品，内容从业者更是冗余。",
  support_claim_ids: ["cl-011"],
  stance: "answer",
  emotion: "calm",
};

describe("TB5 忠实回合：重写矩阵（Scripted）", () => {
  test("首试 entailed → 通过，1 次候选", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: candidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(1);
  });

  test("第一次重写通过 → 2 次候选", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: candidate },
      { task: "validator", value: distortedFail },
      { task: "role", value: candidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(2);
  });

  test("第二次重写通过 → 3 次候选（上限）", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: candidate },
      { task: "validator", value: distortedFail },
      { task: "role", value: candidate },
      { task: "validator", value: distortedFail },
      { task: "role", value: candidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(3);
  });

  test("三次均拒绝 → VALIDATION_EXHAUSTED（不抛协议错误）", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: candidate },
      { task: "validator", value: distortedFail },
      { task: "role", value: candidate },
      { task: "validator", value: distortedFail },
      { task: "role", value: candidate },
      { task: "validator", value: distortedFail },
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("VALIDATION_EXHAUSTED");
      expect(outcome.attempts).toBe(3);
      expect(outcome.failure.code).toBe("VALIDATION_EXHAUSTED");
    }
  });

  test("生成器协议失败 → 立即终止，不消耗语义重写", async () => {
    // 队列只有 1 条且 task 不匹配 → 生成器抛错；后续无队列（若有重写会耗尽报错）
    const gateway = new ScriptedModelGateway([
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("PROTOCOL_FAILURE");
      expect(outcome.failure.code).toBe("MODEL_REQUEST_FAILED");
      expect(outcome.attempts).toBe(1);
    }
  });

  test("校验器协议失败 → VALIDATOR_REQUEST_FAILED，立即终止", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: candidate },
      { task: "role", value: candidate }, // 第二次调用应为 validator → 不匹配抛错
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("PROTOCOL_FAILURE");
      expect(outcome.failure.code).toBe("VALIDATOR_REQUEST_FAILED");
    }
  });

  test("支持 Claim 越出可见集合 → 重写后仍越出则耗尽", async () => {
    const badCandidate = {
      speech: "文中没提的断言。",
      support_claim_ids: ["cl-999"],
      stance: "answer",
      emotion: "calm",
    };
    const gateway = new ScriptedModelGateway([
      { task: "role", value: badCandidate },
      { task: "validator", value: entailed }, // 即便校验器放行，前置检查仍拦截
      { task: "role", value: badCandidate },
      { task: "validator", value: entailed },
      { task: "role", value: badCandidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(gateway, faithfulContext());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("VALIDATION_EXHAUSTED");
  });
});

describe("TB6 Distorted 回合：单次候选、允许集门控（Scripted）", () => {
  test("distorted 且类型 ⊆ 允许集 → 通过", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: distortedCandidate },
      { task: "validator", value: distortedPass },
    ]);
    const outcome = await runGenerationAttempts(gateway, distortedContext());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(1);
  });

  test("候选未构成篡改（entailed）→ 立即终止，不重写", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: candidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(gateway, distortedContext());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("VALIDATION_EXHAUSTED");
      expect(outcome.attempts).toBe(1);
    }
  });

  test("使用未授权篡改类型 → DISTORTION_POLICY_VIOLATION", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: distortedCandidate },
      {
        task: "validator",
        value: {
          status: "distorted",
          detected_distortion_types: ["causal_swap"],
          unsupported_spans: [],
          referenced_claim_ids: ["cl-011"],
          confidence: 0.9,
        },
      },
    ]);
    const outcome = await runGenerationAttempts(gateway, distortedContext());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("DISTORTION_POLICY_VIOLATION");
      expect(outcome.failure.code).toBe("DISTORTION_POLICY_VIOLATION");
    }
  });

  test("支持 Claim 越出可见集合 → 终止（不得引入新事实）", async () => {
    const foreign = {
      speech: "全新断言。",
      support_claim_ids: ["cl-404"],
      stance: "answer",
      emotion: "calm",
    };
    const gateway = new ScriptedModelGateway([
      { task: "role", value: foreign },
      { task: "validator", value: distortedPass },
    ]);
    const outcome = await runGenerationAttempts(gateway, distortedContext());
    expect(outcome.ok).toBe(false);
  });
});
