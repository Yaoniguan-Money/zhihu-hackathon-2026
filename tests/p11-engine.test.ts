import { describe, expect, test } from "bun:test";
import { ScriptedModelGateway } from "./helpers/scripted-model-gateway.js";
import {
  runGenerationAttempts,
  type TurnAttemptContext,
} from "@server/turn-engine/run-turn.js";
import { rolePrivatePolicySchema } from "@contracts/private/index.js";
import { roleGeneratorUserPrompt } from "@server/model/schemas/role-turn.js";

/**
 * P1-1 对质回合的确定性覆盖（Scripted Adapter，无网络）。
 * CONTRACTS 8.2：对质候选必须引用非空且可见的 support_claim_ids；
 * 违反按 NEW_FACT_INTRODUCED 立即终止（服务器硬约束，先于 Validator，
 * 不属于语义重写机会）。其余批准/重写规则与普通回合一致（按 Fidelity）。
 */

function confrontationContext(
  overrides: Partial<TurnAttemptContext> = {},
): TurnAttemptContext {
  return {
    policy: rolePrivatePolicySchema.parse({
      role_id: "role-analyst",
      fidelity: "faithful",
      visible_claim_ids: ["cl-004", "cl-011"],
      goal: "评估裁员数据的行业影响。",
      allowed_distortion_types: [],
    }),
    displayName: "纪云汀",
    visibleClaims: [
      { claim_id: "cl-004", proposition: "Meta 计划裁减约20%员工。" },
      { claim_id: "cl-011", proposition: "初级程序员是第一批牺牲品。" },
    ],
    history: [],
    question: "",
    mode: "confrontation",
    incidentRef: "req-p11-engine",
    requireSupportClaims: true,
    confrontation: {
      speakerName: "沈青梧 · 财经调查记者",
      recordingText: "Meta 计划裁减约20%员工，涉及约1.58万人。",
    },
    ...overrides,
  };
}

const supportedCandidate = {
  speech: "这段录音与文中数据一致：Meta 确实计划裁减约20%员工。",
  support_claim_ids: ["cl-004"],
  stance: "answer",
  emotion: "uneasy",
};
const emptySupportCandidate = {
  speech: "这个话题我没法直接回应。",
  support_claim_ids: [],
  stance: "evade",
  emotion: "calm",
};
const foreignSupportCandidate = {
  speech: "我听说亚马逊也裁了很多人。",
  support_claim_ids: ["cl-005"],
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

describe("P1-1 对质回合：支持引用硬约束（Scripted）", () => {
  test("空 support_claim_ids → NEW_FACT_INTRODUCED，且不调用 Validator", async () => {
    // 队列只有角色候选：若实现误调用 Validator，将耗尽队列并变为
    // MODEL_REQUEST_FAILED 而非 NEW_FACT_INTRODUCED。
    const gateway = new ScriptedModelGateway([
      { task: "role", value: emptySupportCandidate },
    ]);
    const outcome = await runGenerationAttempts(
      gateway,
      confrontationContext(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("NEW_FACT_INTRODUCED");
      expect(outcome.failure.code).toBe("NEW_FACT_INTRODUCED");
      expect(outcome.attempts).toBe(1);
    }
    expect(gateway.remaining).toBe(0);
  });

  test("引用不可见 Claim → NEW_FACT_INTRODUCED 立即终止", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: foreignSupportCandidate },
    ]);
    const outcome = await runGenerationAttempts(
      gateway,
      confrontationContext(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.code).toBe("NEW_FACT_INTRODUCED");
  });

  test("引用可见 Claim + Validator entailed → 通过（忠实，1 次候选）", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: supportedCandidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(
      gateway,
      confrontationContext(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(1);
  });

  test("忠实对质：首次语义不通过仍可重写（重写规则与普通回合一致）", async () => {
    const distortedFail = {
      status: "distorted",
      detected_distortion_types: ["degree_strengthen"],
      unsupported_spans: [],
      referenced_claim_ids: ["cl-004"],
      confidence: 0.9,
    };
    const gateway = new ScriptedModelGateway([
      { task: "role", value: supportedCandidate },
      { task: "validator", value: distortedFail },
      { task: "role", value: supportedCandidate },
      { task: "validator", value: entailed },
    ]);
    const outcome = await runGenerationAttempts(
      gateway,
      confrontationContext(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(2);
  });

  test("篡改角色对质：单次候选，空引用同样 NEW_FACT_INTRODUCED", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: emptySupportCandidate },
    ]);
    const outcome = await runGenerationAttempts(
      gateway,
      confrontationContext({
        policy: rolePrivatePolicySchema.parse({
          role_id: "role-skeptic",
          fidelity: "distorted",
          visible_claim_ids: ["cl-004", "cl-011"],
          goal: "放大范围、删除条件。",
          allowed_distortion_types: ["scope_expand", "condition_delete"],
        }),
      }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.code).toBe("NEW_FACT_INTRODUCED");
  });

  test("requireSupportClaims 未开启时空引用不触发对质硬约束", async () => {
    const gateway = new ScriptedModelGateway([
      { task: "role", value: emptySupportCandidate },
      { task: "validator", value: entailed },
    ]);
    const plain = confrontationContext();
    delete plain.requireSupportClaims;
    delete plain.confrontation;
    plain.question = "Meta 裁员数据？";
    plain.mode = "direct";
    const outcome = await runGenerationAttempts(gateway, plain);
    expect(outcome.ok).toBe(true);
  });
});

describe("P1-1 对质 prompt", () => {
  test("对质上下文渲染录音块而非玩家问题", () => {
    const prompt = roleGeneratorUserPrompt({
      visibleClaims: [{ claim_id: "cl-004", proposition: "Meta 裁员。" }],
      history: [],
      question: "",
      questionMode: "confrontation",
      confrontation: {
        speakerName: "沈青梧",
        recordingText: "Meta 计划裁减约20%员工。",
      },
    });
    expect(prompt).toContain("录音证据");
    expect(prompt).toContain("沈青梧");
    expect(prompt).toContain("Meta 计划裁减约20%员工。");
    expect(prompt).toContain("support_claim_ids 非空");
    expect(prompt).not.toContain("玩家的问题");
  });

  test("普通回合 prompt 保持原有形态", () => {
    const prompt = roleGeneratorUserPrompt({
      visibleClaims: [{ claim_id: "cl-004", proposition: "Meta 裁员。" }],
      history: [],
      question: "Meta 裁了多少人？",
      questionMode: "direct",
    });
    expect(prompt).toContain("玩家的问题（mode=direct）：Meta 裁了多少人？");
    expect(prompt).not.toContain("录音证据");
  });
});
