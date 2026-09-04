import { describe, expect, test } from "bun:test";
import {
  sourceSpanSchema,
  validateSourceSpan,
} from "@contracts/shared/index.js";
import {
  casePublicSchema,
  finalAccusationSchema,
  publicErrorSchema,
  revealResultSchema,
  sessionViewSchema,
} from "@contracts/public/index.js";
import {
  assertPlayableCaseInvariants,
  casePrivateSchema,
  type CasePrivate,
} from "@contracts/private/index.js";

const SOURCE = "甲公司在三个部门试点AI客服，测试期间人工处理量下降18%。";

function span(start: number, end: number, text: string) {
  return { start, end, text, paragraph_index: 0 };
}

describe("shared：Source Span 不变量", () => {
  test("text 与 slice 一致时有效", () => {
    const s = sourceSpanSchema.parse(span(0, 5, SOURCE.slice(0, 5)));
    expect(validateSourceSpan(SOURCE, s)).toBe(true);
  });

  test("text 与 slice 不一致判为无效，不得模糊重定位", () => {
    const s = sourceSpanSchema.parse(span(0, 5, "错误文本内容"));
    expect(validateSourceSpan(SOURCE, s)).toBe(false);
  });

  test("start >= end 被 schema 拒绝", () => {
    expect(sourceSpanSchema.safeParse(span(5, 5, "x")).success).toBe(false);
    expect(sourceSpanSchema.safeParse(span(6, 5, "x")).success).toBe(false);
  });

  test("未知字段被拒绝（strictObject）", () => {
    expect(
      sourceSpanSchema.safeParse({ ...span(0, 5, SOURCE.slice(0, 5)), extra: 1 })
        .success,
    ).toBe(false);
  });
});

describe("public：案件与 SessionView", () => {
  const role = (i: number) => ({
    role_id: `role-${i}`,
    display_name: `角色${i}`,
    public_bio: "简介",
    persona_key: "professor",
    voice_id: "zh-female-1",
  });

  test("CasePublic 恰好五个角色；多一个少一个都拒绝", () => {
    const base = {
      case_id: "case-1",
      title: "标题",
      summary: "摘要",
      source_url: "https://zhuanlan.zhihu.com/p/2020194970120790951",
      theme: "职场",
    };
    expect(casePublicSchema.safeParse({ ...base, roles: [1,2,3,4,5].map(role) }).success).toBe(true);
    expect(casePublicSchema.safeParse({ ...base, roles: [1,2,3,4].map(role) }).success).toBe(false);
    expect(casePublicSchema.safeParse({ ...base, roles: [1,2,3,4,5,6].map(role) }).success).toBe(false);
  });

  test("SessionView：reveal_available / terminal_error 与 phase 强制绑定", () => {
    const base = {
      session_id: "s1",
      case_id: "case-1",
      phase: "investigation",
      allowed_actions: ["ask"],
      board: {
        session_id: "s1",
        revision: 0,
        placements: [],
        links: [],
        updated_at: "2026-09-04T00:00:00Z",
      },
      reveal_available: false,
      last_event_sequence: 3,
      created_at: "2026-09-04T00:00:00Z",
      updated_at: "2026-09-04T00:00:00Z",
    };
    expect(sessionViewSchema.safeParse(base).success).toBe(true);
    expect(
      sessionViewSchema.safeParse({ ...base, reveal_available: true }).success,
    ).toBe(false);
    expect(
      sessionViewSchema.safeParse({
        ...base,
        phase: "revealed",
        reveal_available: true,
      }).success,
    ).toBe(true);
    expect(
      sessionViewSchema.safeParse({
        ...base,
        phase: "failed",
        terminal_error: { code: "ROLE_TURN_FAILED", message: "重试或更换问法" },
      }).success,
    ).toBe(true);
  });

  test("FinalAccusation：至少一项且不重复", () => {
    const base = {
      suspect_role_id: "role-4",
      evidence_ids: ["ev-1"],
    };
    expect(
      finalAccusationSchema.safeParse({ ...base, distortion_types: ["scope_expand"] })
        .success,
    ).toBe(true);
    expect(
      finalAccusationSchema.safeParse({ ...base, distortion_types: [] }).success,
    ).toBe(false);
    expect(
      finalAccusationSchema.safeParse({
        ...base,
        distortion_types: ["scope_expand", "scope_expand"],
      }).success,
    ).toBe(false);
  });

  test("PublicError message 必填；未知错误码拒绝", () => {
    expect(
      publicErrorSchema.safeParse({ code: "ROLE_TURN_BUSY", message: "当前角色正在回应" })
        .success,
    ).toBe(true);
    expect(
      publicErrorSchema.safeParse({ code: "NOT_A_CODE", message: "x" }).success,
    ).toBe(false);
  });

  test("RevealResult：truth_chain 必须从 1 连续", () => {
    const base = {
      correct_role_id: "role-4",
      distortion_types: ["scope_expand"],
      player_correct: true,
      truth_chain: [
        { order: 1, claim_id: "c1", label: "三部门试点" },
        { order: 2, claim_id: "c2", label: "测试期间下降18%" },
      ],
      altered_links: [
        {
          original: "三个部门试点",
          distorted: "公司已全面使用",
          distortion_type: "scope_expand",
        },
      ],
      evidence_score: 60,
      questioning_score: 48,
      explanation: "解释",
      reality_mapping: ["现实映射一"],
    };
    expect(revealResultSchema.safeParse(base).success).toBe(true);
    expect(
      revealResultSchema.safeParse({
        ...base,
        truth_chain: [
          { order: 1, claim_id: "c1", label: "a" },
          { order: 3, claim_id: "c2", label: "b" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("private：可玩案件不变量", () => {
  const claims = [
    { id: "c1", text: "三个部门试点" },
    { id: "c2", text: "测试期间下降18%" },
  ];

  function buildCase(overrides?: {
    fidelity?: ("faithful" | "distorted")[];
    allowed?: string[][];
    answerTypes?: string[];
    owner?: string;
  }): CasePrivate {
    const fidelity = overrides?.fidelity ?? [
      "faithful",
      "faithful",
      "faithful",
      "faithful",
      "distorted",
    ];
    const allowed = overrides?.allowed ?? [[], [], [], [], ["scope_expand"]];
    return casePrivateSchema.parse({
      case_id: "case-1",
      graph: {
        case_id: "case-1",
        source_id: "src-1",
        claims: claims.map((c, i) => ({
          claim_id: c.id,
          proposition: c.text,
          source_span: span(i, i + 3, "abc"),
          source_ref: "src-1",
          confidence: 0.9,
        })),
        relations: [
          { relation_id: "r1", from_claim_id: "c1", to_claim_id: "c2", type: "temporal_before" },
        ],
      },
      role_policies: fidelity.map((f, i) => ({
        role_id: `role-${i}`,
        fidelity: f,
        visible_claim_ids: ["c1"],
        goal: "目标",
        allowed_distortion_types: allowed[i],
      })),
      golden_answer: {
        distortion_owner_role_id: overrides?.owner ?? "role-4",
        answer_distortion_types: overrides?.answerTypes ?? ["scope_expand"],
        truth_claim_ids: ["c1"],
      },
      evidence_catalog: [
        {
          evidence_id: "ev-1",
          type: "claim",
          title: "试点范围",
          body: "三个部门试点",
          public_claim_refs: ["c1"],
          conflicts_with: [],
        },
      ],
      evidence_unlock_rules: [
        {
          rule_id: "rule-1",
          evidence_id: "ev-1",
          required_claim_ids: ["c1"],
          allowed_role_ids: ["role-0", "role-1", "role-2", "role-3"],
        },
      ],
    });
  }

  test("合法 4+1 案件通过", () => {
    assertPlayableCaseInvariants(buildCase());
  });

  test("5 个 faithful / 答案不是子集 / owner 不是 distorted / Catalog 引用缺失均失败", () => {
    expect(() =>
      assertPlayableCaseInvariants(
        buildCase({ fidelity: ["faithful","faithful","faithful","faithful","faithful"], allowed: [[],[],[],[],[]] }),
      ),
    ).toThrow();
    expect(() =>
      assertPlayableCaseInvariants(buildCase({ answerTypes: ["cherry_pick"] })),
    ).toThrow();
    expect(() => assertPlayableCaseInvariants(buildCase({ owner: "role-0" }))).toThrow();
    expect(() =>
      assertPlayableCaseInvariants(
        buildCase(),
      ),
    ).not.toThrow();
  });

  test("Unlock Rule 引用 Catalog 之外 Evidence 失败", () => {
    const bad = buildCase();
    bad.evidence_unlock_rules[0].evidence_id = "ev-404";
    expect(() => assertPlayableCaseInvariants(bad)).toThrow();
  });
});
