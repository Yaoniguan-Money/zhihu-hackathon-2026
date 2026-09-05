import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  evidenceGraphPrivateSchema,
  rolePrivatePolicySchema,
  goldenAnswerPrivateSchema,
  evidenceCatalogItemPrivateSchema,
  evidenceUnlockRulePrivateSchema,
  assertPlayableCaseInvariants,
  type CasePrivate,
} from "@contracts/private/index.js";
import { casePublicSchema } from "@contracts/public/index.js";
import {
  candidateCaseCompilationSchema,
  CASE_COMPILATION_SCHEMA_VERSION,
} from "@server/model/schemas/case-compilation.js";
import {
  compileCaseFromCandidates,
  CaseInvariantFailure,
  type CaseRubric,
} from "@server/cases/compile-case.js";

/**
 * TB2b 纯函数层：用户案件完整编译器（CONTRACTS 4.2 / 9.3 / 10.1）。
 * 模型候选只提供内容与下标引用；可信 ID、voice、4+1 结构、答案子集、
 * unlock rule、rubric（整数权重总和恰 100）与 Public Projection 全部由服务器决定。
 * 模型集成端到端见 tb2-compile-model.test.ts（显式 opt-in）。
 */

const GRAPH = evidenceGraphPrivateSchema.parse({
  case_id: "case-test",
  source_id: "src-case-test",
  claims: [
    "苹果将裁减约20%的员工",
    "裁员涉及约1.58万人",
    "亚马逊累计裁员已超3万",
    "国内把裁员修饰为组织优化",
    "初级程序员是第一波冲击对象",
    "这是永久性系统性失业",
  ].map((proposition, index) => ({
    claim_id: `cl-${index + 1}`,
    proposition,
    source_span: { start: index * 10, end: index * 10 + 5, text: "片段", paragraph_index: index },
    source_ref: "src-case-test",
    confidence: 1,
  })),
  relations: [
    { relation_id: "rel-1", from_claim_id: "cl-1", to_claim_id: "cl-2", type: "supports" },
  ],
});

function validCandidate(): z.infer<typeof candidateCaseCompilationSchema> {
  return candidateCaseCompilationSchema.parse({
    title: "测试案件：AI 与裁员",
    summary: "五名角色围绕一篇评论文章各陈其词，其中一人的复述越过了原文边界。",
    theme: "AI 与就业",
    roles: [
      { display_name: "甲 · 记者", public_bio: "相信数据。", persona_key: "calm_reporter" },
      { display_name: "乙 · 分析师", public_bio: "追踪结构性影响。", persona_key: "sharp_analyst" },
      { display_name: "丙 · 工程师", public_bio: "裁员季亲历者。", persona_key: "uneasy_engineer" },
      { display_name: "丁 · 教授", public_bio: "研究劳动经济。", persona_key: "stern_professor" },
      { display_name: "戊 · 评论人", public_bio: "喜欢下判断。", persona_key: "bold_commentator" },
    ],
    evidence_catalog: [
      { type: "quote", title: "裁员数据", body: "苹果计划裁减约20%员工。", claim_indices: [0, 1], conflict_indices: [] },
      { type: "claim", title: "组织优化话术", body: "国内把裁员修饰为组织优化。", claim_indices: [2, 3], conflict_indices: [] },
      { type: "timeline", title: "第一波冲击", body: "初级程序员是第一波冲击对象。", claim_indices: [4], conflict_indices: [0] },
    ],
    distortion_plan: {
      distorted_role_index: 4,
      allowed_distortion_types: ["scope_expand", "condition_delete"],
      answer_distortion_types: ["scope_expand"],
      distorted_goal: "把个别公司裁员夸大为全行业永久性失业。",
      truth_claim_indices: [0, 1, 4],
      visible_claim_indices: [
        [0, 1, 4],
        [2, 3, 4],
        [0, 4],
        [4, 5],
        [0, 1, 2, 3, 4, 5],
      ],
    },
  });
}

const BASE = {
  case_id: "case-test",
  source_url: "https://example.com/article",
  theme: null,
  graph: GRAPH,
};

describe("TB2b 编译器纯函数层", () => {
  test("schema 版本化", () => {
    expect(CASE_COMPILATION_SCHEMA_VERSION).toBe("case-compilation-v1@2");
  });

  test("合法候选 → 完整工件：Public/Private 分离、4+1、rubric 总和恰 100、规则可解锁", () => {
    const art = compileCaseFromCandidates({ ...BASE, candidate: validCandidate() });

    // Public Projection：独立 schema 校验通过，且不携带任何私有字段
    const casePublic = casePublicSchema.parse(art.case_public);
    expect(casePublic.roles).toHaveLength(5);
    const rawPublic = JSON.stringify(casePublic);
    expect(rawPublic).not.toContain("fidelity");
    expect(rawPublic).not.toContain("visible_claim_ids");
    expect(rawPublic).not.toContain("allowed_distortion_types");
    expect(rawPublic).not.toContain("goal");

    // Private：结构完整且满足可玩案件不变量
    const casePrivate: CasePrivate = {
      case_id: art.case_private.case_id,
      graph: art.case_private.graph,
      role_policies: art.case_private.role_policies,
      golden_answer: art.case_private.golden_answer,
      evidence_catalog: art.case_private.evidence_catalog,
      evidence_unlock_rules: art.evidence_unlock_rules,
    };
    casePrivateSchemaParse(casePrivate);
    assertPlayableCaseInvariants(casePrivate);
    expect(casePrivate.role_policies.filter((p) => p.fidelity === "faithful")).toHaveLength(4);
    expect(casePrivate.role_policies.filter((p) => p.fidelity === "distorted")).toHaveLength(1);
    expect(casePrivate.role_policies[4]!.role_id).toBe(
      casePrivate.golden_answer.distortion_owner_role_id,
    );
    // 忠实角色 goal 固定；失真角色 goal 来自候选
    expect(casePrivate.role_policies[0]!.goal).not.toBe(
      casePrivate.role_policies[4]!.goal,
    );

    // 可信 ID 全部由服务器分配
    expect(casePrivate.evidence_catalog.map((i) => i.evidence_id)).toEqual([
      "ev-1",
      "ev-2",
      "ev-3",
    ]);
    expect(casePrivate.evidence_catalog[2]!.conflicts_with).toEqual(["ev-1"]);

    // Unlock rule：服务器从可见集合推导，每条目至少一个可解锁角色
    expect(art.evidence_unlock_rules).toHaveLength(3);
    for (const rule of art.evidence_unlock_rules) {
      expect(rule.allowed_role_ids.length).toBeGreaterThan(0);
    }
    // 条目 0 需要 cl-1+cl-2：只有 visible 覆盖两者的角色（role-1、role-5）可解锁
    const rule0 = art.evidence_unlock_rules.find((r) => r.evidence_id === "ev-1")!;
    expect(rule0.allowed_role_ids.sort()).toEqual(["role-1", "role-5"]);

    // Rubric：整数权重、总和恰 100，只覆盖命中真相 Claim 的条目
    const rubric: CaseRubric = art.rubric;
    const weights = rubric.criteria.map((c) => c.weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    for (const w of weights) expect(Number.isInteger(w)).toBe(true);
    expect(rubric.criteria).toHaveLength(2); // ev-1 与 ev-3 命中 truth claims
    const caseIds = new Set(rubric.criteria.flatMap((c) => c.claim_ids));
    for (const id of caseIds) {
      expect(["cl-1", "cl-2", "cl-5"]).toContain(id);
    }
  });

  test("answer_distortion_types 不是获准集合子集 → CASE_INVARIANT_FAILED", () => {
    const candidate = validCandidate();
    candidate.distortion_plan.answer_distortion_types = ["causal_swap"];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate }),
    ).toThrow(CaseInvariantFailure);
  });

  test("Catalog 条目引用不存在的 Claim 下标 → CASE_INVARIANT_FAILED", () => {
    const candidate = validCandidate();
    candidate.evidence_catalog[0]!.claim_indices = [99];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate }),
    ).toThrow(CaseInvariantFailure);
  });

  test("角色可见 Claim 集合为空 → CASE_INVARIANT_FAILED", () => {
    const candidate = validCandidate();
    candidate.distortion_plan.visible_claim_indices[2] = [];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate }),
    ).toThrow(CaseInvariantFailure);
  });

  test("visible/truth 下标越界 → CASE_INVARIANT_FAILED", () => {
    const outOfVisible = validCandidate();
    outOfVisible.distortion_plan.visible_claim_indices[0] = [0, 99];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate: outOfVisible }),
    ).toThrow(CaseInvariantFailure);

    const outOfTruth = validCandidate();
    outOfTruth.distortion_plan.truth_claim_indices = [0, 999];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate: outOfTruth }),
    ).toThrow(CaseInvariantFailure);
  });

  test("conflict 自指 → CASE_INVARIANT_FAILED", () => {
    const candidate = validCandidate();
    candidate.evidence_catalog[1]!.conflict_indices = [1];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate }),
    ).toThrow(CaseInvariantFailure);
  });

  test("没有命中真相 Claim 的可判分证据 → CASE_INVARIANT_FAILED", () => {
    const candidate = validCandidate();
    candidate.distortion_plan.truth_claim_indices = [5];
    expect(() =>
      compileCaseFromCandidates({ ...BASE, candidate }),
    ).toThrow(CaseInvariantFailure);
  });

  test("用户 theme 优先于候选 theme", () => {
    const art = compileCaseFromCandidates({
      ...BASE,
      theme: "用户指定主题",
      candidate: validCandidate(),
    });
    expect(art.case_public.theme).toBe("用户指定主题");
  });
});

/** 便捷包装：用 contracts schema 逐字段复验（模拟 finalize 写入边界）。 */
function casePrivateSchemaParse(input: CasePrivate): void {
  expect(input.case_id).toBe("case-test");
  z.array(rolePrivatePolicySchema).parse(input.role_policies);
  goldenAnswerPrivateSchema.parse(input.golden_answer);
  z.array(evidenceCatalogItemPrivateSchema).parse(input.evidence_catalog);
  z.array(evidenceUnlockRulePrivateSchema).parse(input.evidence_unlock_rules);
}
