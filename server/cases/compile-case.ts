import { z } from "zod";
import {
  assertPlayableCaseInvariants,
  casePrivateSchema,
  evidenceCatalogItemPrivateSchema,
  evidenceUnlockRulePrivateSchema,
  goldenAnswerPrivateSchema,
  rolePrivatePolicySchema,
  type CasePrivate,
  type ClaimPrivate,
  type EvidenceGraphPrivate,
  type EvidenceUnlockRulePrivate,
  type GoldenAnswerPrivate,
  type PrivateFailure,
  type RolePrivatePolicy,
} from "@contracts/private/index.js";
import {
  casePublicSchema,
  type CasePublic,
  type RolePublic,
} from "@contracts/public/index.js";
import type { CandidateCaseCompilation } from "@server/model/schemas/case-compilation.js";

/**
 * 用户案件完整编译器（A3/A5 进程内规则，TB2b）。
 * 模型候选只提供内容与下标引用；这里完成全部服务器决定：
 * 可信 ID 分配、voice 轮换、4+1 结构、答案子集校验、unlock rule 推导、
 * rubric 构建（整数权重总和恰 100，CONTRACTS 10.1）与 Public Projection。
 * 任一不变量失败抛 CaseInvariantFailure → 整个编译失败（CONTRACTS 4.4），
 * 不产生部分 Case、不回退 fixture。
 */

export const FAITHFUL_ROLE_GOAL = "只依据可见事实与原文原意如实陈述，不改变事实关系。";

/** P1-2 锁定前的固定中文音色轮换；voice 不由模型决定。 */
export const VOICE_ID_ROTATION = [
  "voice-zh-01",
  "voice-zh-02",
  "voice-zh-03",
  "voice-zh-04",
  "voice-zh-05",
];

export const RUBRIC_SCORING_RULE =
  "对最终指控所附的已解锁 Evidence 逐条判定：一条 Evidence 满足某 criterion 的类型与 Claim 条件时，该 criterion 授予其权重；每个 criterion 至多授予一次；未满足的 criterion 不得计分。总分封顶 100。";

export interface CaseRubric {
  case_id: string;
  scoring_rule: string;
  criteria: {
    criterion_id: string;
    weight: number;
    allowed_types: string[];
    claim_match_mode: "any_of";
    claim_ids: string[];
    description: string;
  }[];
}

export interface CompiledCaseArtifacts {
  case_public: CasePublic;
  case_private: CasePrivate;
  evidence_unlock_rules: EvidenceUnlockRulePrivate[];
  rubric: CaseRubric;
}

export class CaseInvariantFailure extends Error {
  readonly failure: PrivateFailure;

  constructor(detail: string) {
    super(detail);
    this.name = "CaseInvariantFailure";
    this.failure = {
      code: "CASE_INVARIANT_FAILED",
      incident_id: `compile:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      detail,
    };
  }
}

export function compileCaseFromCandidates(input: {
  case_id: string;
  source_url: string;
  theme?: string | null;
  graph: EvidenceGraphPrivate;
  candidate: CandidateCaseCompilation;
  /** 每局随机失真者（用户 2026-09-12 决定）：给定角色数返回随机下标；
   *  与编译器指定下标不同时，交换两个位置的人设（display_name/public_bio/
   *  persona_key），篡改计划结构原位保留。缺省保持编译器指定（测试确定性）。 */
  pickDistorterIndex?: (roleCount: number) => number;
}): CompiledCaseArtifacts {
  const { case_id, source_url, graph, candidate } = input;
  const claims = graph.claims;
  const claimIdAt = (index: number): string => {
    const claim = claims[index];
    if (!claim) {
      throw new CaseInvariantFailure(`候选引用了不存在的 Claim 下标: ${index}`);
    }
    return claim.claim_id;
  };

  const plan = candidate.distortion_plan;

  // 可见集合：非空、下标越界即失败；顺序去重后映射为可信 Claim ID。
  const visibleIds = plan.visible_claim_indices.map((indices, roleIndex) => {
    if (indices.length === 0) {
      throw new CaseInvariantFailure(`角色 ${roleIndex} 的可见 Claim 集合为空`);
    }
    return [...new Set(indices.map((index) => claimIdAt(index)))];
  });

  // 每局随机失真者：把编译器指定位置的人设与随机选中的位置交换。
  // 交换只涉及 display_name/public_bio/persona_key；篡改计划（可见集、获准
  // 方式、goal、答案、解锁规则、rubric）全部按位置保留，结构不变量不受影响。
  // 音色跟随人设（按人设原下标取轮换），不随位置变化。
  const swapIndex = input.pickDistorterIndex
    ? input.pickDistorterIndex(candidate.roles.length)
    : plan.distorted_role_index;
  if (swapIndex < 0 || swapIndex >= candidate.roles.length) {
    throw new CaseInvariantFailure(`随机失真者下标越界: ${swapIndex}`);
  }
  const personaAt = (position: number) =>
    candidate.roles[
      position === swapIndex
        ? plan.distorted_role_index
        : position === plan.distorted_role_index
          ? swapIndex
          : position
    ]!;
  const voiceAt = (position: number) =>
    VOICE_ID_ROTATION[
      position === swapIndex
        ? plan.distorted_role_index
        : position === plan.distorted_role_index
          ? swapIndex
          : position
    ]!;

  // 角色：内容来自候选，role_id 与 voice 由服务器分配；顺序即开场顺序。
  const roles: RolePublic[] = candidate.roles.map((_, index) =>
    casePublicSchema.shape.roles.element.parse({
      role_id: `role-${index + 1}`,
      display_name: personaAt(index).display_name,
      public_bio: personaAt(index).public_bio,
      persona_key: personaAt(index).persona_key,
      voice_id: voiceAt(index),
    }),
  );

  // 4+1 Policy：忠实角色获准集合恒为空，goal 使用服务器固定文案。
  const policies: RolePrivatePolicy[] = roles.map((role, index) =>
    rolePrivatePolicySchema.parse({
      role_id: role.role_id,
      fidelity:
        index === plan.distorted_role_index ? "distorted" : "faithful",
      visible_claim_ids: visibleIds[index]!,
      goal:
        index === plan.distorted_role_index
          ? plan.distorted_goal
          : FAITHFUL_ROLE_GOAL,
      allowed_distortion_types:
        index === plan.distorted_role_index
          ? plan.allowed_distortion_types
          : [],
    }),
  );

  // Golden Answer：owner 必须是失真角色；answer 必须是获准集合的非空子集。
  const allowedSet = new Set(plan.allowed_distortion_types);
  for (const answerType of plan.answer_distortion_types) {
    if (!allowedSet.has(answerType)) {
      throw new CaseInvariantFailure(
        "answer_distortion_types 不是获准集合的子集",
      );
    }
  }
  const golden: GoldenAnswerPrivate = goldenAnswerPrivateSchema.parse({
    distortion_owner_role_id: policies[plan.distorted_role_index]!.role_id,
    answer_distortion_types: plan.answer_distortion_types,
    truth_claim_ids: [
      ...new Set(plan.truth_claim_indices.map((index) => claimIdAt(index))),
    ],
  });

  // Catalog：evidence_id 由服务器分配；conflict 下标不得自指。
  const evidenceCount = candidate.evidence_catalog.length;
  const catalog = candidate.evidence_catalog.map((item, index) =>
    evidenceCatalogItemPrivateSchema.parse({
      evidence_id: `ev-${index + 1}`,
      type: item.type,
      title: item.title,
      body: item.body,
      public_claim_refs: [
        ...new Set(item.claim_indices.map((index2) => claimIdAt(index2))),
      ],
      conflicts_with: item.conflict_indices.map((conflictIndex) => {
        if (conflictIndex >= evidenceCount) {
          throw new CaseInvariantFailure(
            `Catalog 条目 ${index} 引用了不存在的冲突条目: ${conflictIndex}`,
          );
        }
        if (conflictIndex === index) {
          throw new CaseInvariantFailure(`Catalog 条目 ${index} 冲突自指`);
        }
        return `ev-${conflictIndex + 1}`;
      }),
    }),
  );

  // Unlock rule：服务器从可见集合推导——一条目可被「可见集覆盖其全部公开 Claim」
  // 的角色解锁；没有任何角色可解锁的条目使整个编译失败。
  const rules: EvidenceUnlockRulePrivate[] = catalog.map((item, index) => {
    const allowedRoleIds = policies
      .filter((policy) =>
        item.public_claim_refs.every((claimId) =>
          policy.visible_claim_ids.includes(claimId),
        ),
      )
      .map((policy) => policy.role_id);
    if (allowedRoleIds.length === 0) {
      throw new CaseInvariantFailure(
        `Catalog 条目 ${index + 1} 不可由任何角色解锁`,
      );
    }
    return evidenceUnlockRulePrivateSchema.parse({
      rule_id: `ul-${index + 1}`,
      evidence_id: item.evidence_id,
      required_claim_ids: item.public_claim_refs,
      allowed_role_ids: allowedRoleIds,
    });
  });

  // Rubric：只对命中 truth claims 的 Catalog 条目建 criterion；
  // 整数权重、总和恰 100（CONTRACTS 10.1）。没有可判分证据即编译失败。
  const truthSet = new Set(golden.truth_claim_ids);
  const scoringItems = catalog.filter((item) =>
    item.public_claim_refs.some((claimId) => truthSet.has(claimId)),
  );
  if (scoringItems.length === 0 || scoringItems.length > 100) {
    throw new CaseInvariantFailure("没有可判分的命中真相 Claim 的证据条目");
  }
  const base = Math.floor(100 / scoringItems.length);
  const remainder = 100 % scoringItems.length;
  const rubric: CaseRubric = {
    case_id,
    scoring_rule: RUBRIC_SCORING_RULE,
    criteria: scoringItems.map((item, index) => ({
      criterion_id: `crit-${item.evidence_id}`,
      weight: index < remainder ? base + 1 : base,
      allowed_types: [item.type],
      claim_match_mode: "any_of" as const,
      claim_ids: item.public_claim_refs,
      description: `证据「${item.title}」：类型 ${item.type} 且公开 Claim 引用命中其登记 Claim。`,
    })),
  };

  const casePrivate: CasePrivate = casePrivateSchema.parse({
    case_id,
    graph,
    role_policies: policies,
    golden_answer: golden,
    evidence_catalog: catalog,
    evidence_unlock_rules: rules,
  });
  assertPlayableCaseInvariants(casePrivate);

  // Public Projection：服务端以独立 public schema 物理构造，不走 omit。
  const casePublic = casePublicSchema.parse({
    case_id,
    title: candidate.title,
    summary: candidate.summary,
    source_url,
    theme:
      input.theme !== undefined &&
      input.theme !== null &&
      input.theme.trim() !== ""
        ? input.theme
        : candidate.theme,
    roles,
  });

  return { case_public: casePublic, case_private: casePrivate, evidence_unlock_rules: rules, rubric };
}

export type { ClaimPrivate };
