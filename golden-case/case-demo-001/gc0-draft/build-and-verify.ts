/**
 * GC0 草案构建与验证脚本（golden-case/case-demo-001）。
 *
 * 运行：`bun golden-case/case-demo-001/gc0-draft/build-and-verify.ts`
 *
 * 职责：
 * 1. 读取冻结的 Canonical Source（source.md），校验 sha256 与 UTF-16 长度；
 * 2. 按 CONTRACTS.md 3.3 计算私有段落索引（空白行分隔的最大非空行块）；
 * 3. 在指定段块内精确定位每条 Claim 的 Source Span（slice 精确校验，无模糊重定位）；
 * 4. 用 contracts 的 zod schema 验证 CasePublic / CasePrivate / 候选 / Validator
 *    结果 / 批准信封 / Final Accusation / RevealResult，并运行可玩案件不变量；
 * 5. 全部通过后写出场 files（paragraphs / case-public / case-private / rubric /
 *    representative-fixtures）。
 *
 * 本文件与输出同属 GC0 草案：用户确认标注后才移动出 gc0-draft/ 并冻结。
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  approvedSpeechEnvelopePrivateSchema,
  assertEvidenceGraphInvariants,
  assertPlayableCaseInvariants,
  canonicalParagraphPrivateSchema,
  casePrivateSchema,
  candidateTextSpanPrivateSchema,
  roleCandidatePayloadPrivateSchema,
  validationResultPrivateSchema,
  type CasePrivate,
  type EvidenceCatalogItemPrivate,
  type EvidenceUnlockRulePrivate,
  type GoldenAnswerPrivate,
  type RolePrivatePolicy,
} from "../../../contracts/private/index.js";
import {
  casePublicSchema,
  evidenceTypeSchema,
  finalAccusationSchema,
  revealResultSchema,
  type CasePublic,
} from "../../../contracts/public/index.js";
import {
  sourceSpanSchema,
  validateSourceSpan,
  type RelationType,
} from "../../../contracts/shared/index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CASE_DIR = join(HERE, "..");
const CANONICAL_PATH = join(CASE_DIR, "source.md");
const METADATA_PATH = join(CASE_DIR, "source-metadata.json");

const CASE_ID = "case-demo-001";
const SOURCE_ID = "src-case-demo-001";
const SOURCE_URL = "https://zhuanlan.zhihu.com/p/2020194970120790951";

// ---------------------------------------------------------------------------
// 1. Canonical Source 与段落索引

const canonical = await readFile(CANONICAL_PATH, "utf8");
const metadata = JSON.parse(await readFile(METADATA_PATH, "utf8")) as {
  content_sha256: string;
  content_utf16_code_units: number;
  content_paragraph_blocks: number;
};

const actualSha =
  "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
if (actualSha !== metadata.content_sha256) {
  throw new Error(
    `source.md sha256 与 metadata 不一致：${actualSha} != ${metadata.content_sha256}`,
  );
}
if (canonical.length !== metadata.content_utf16_code_units) {
  throw new Error(
    `UTF-16 长度不一致：${canonical.length} != ${metadata.content_utf16_code_units}`,
  );
}

interface RawParagraph {
  index: number;
  start: number;
  end: number;
  isQuote: boolean;
}

const paragraphs: RawParagraph[] = [];
{
  let offset = 0;
  let current: { start: number; end: number; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const isQuote = current.lines.every((line) =>
      line.replace(/^[ \t]+/, "").startsWith(">"),
    );
    paragraphs.push({
      index: paragraphs.length,
      start: current.start,
      end: current.end,
      isQuote,
    });
    current = null;
  };
  for (const line of canonical.split("\n")) {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    if (/^[ \t\r]*$/.test(line)) {
      flush();
    } else if (current) {
      current.end = lineEnd;
      current.lines.push(line);
    } else {
      current = { start: lineStart, end: lineEnd, lines: [line] };
    }
  }
  flush();
}

if (paragraphs.length !== metadata.content_paragraph_blocks) {
  throw new Error(
    `段块数不一致：${paragraphs.length} != ${metadata.content_paragraph_blocks}`,
  );
}

const paragraphsOut = paragraphs.map((p) =>
  canonicalParagraphPrivateSchema.parse({
    paragraph_index: p.index,
    start: p.start,
    end: p.end,
    is_quote: p.isQuote,
  }),
);

// ---------------------------------------------------------------------------
// 2. Claims —— excerpt 必须在指定段块内恰好出现一次；Span 由此精确定位。

interface ClaimDraft {
  claim_id: string;
  proposition: string;
  subject?: string;
  predicate?: string;
  object?: string;
  time?: string;
  scope?: string;
  condition?: string;
  modality?: string;
  paragraph_index: number;
  excerpt: string;
  confidence: number;
}

const claimDrafts: ClaimDraft[] = [
  {
    claim_id: "cl-001",
    proposition:
      "文章开篇引用马克思《资本论》的论断：劳动资料一作为机器出现，就立刻成了工人本身的竞争者。",
    modality: "文章引用的经典论断",
    paragraph_index: 2,
    excerpt:
      "马克思在《资本论》中指出：“劳动资料一作为机器出现，就立刻成了工人本身的竞争者。”",
    confidence: 0.99,
  },
  {
    claim_id: "cl-002",
    proposition:
      "2026年3月，全球互联网行业并未迎来预想中的春季复苏，反而陷入了深重的裁员泥淖。",
    time: "2026年3月",
    modality: "报道性陈述",
    paragraph_index: 5,
    excerpt:
      "2026年3月，全球互联网行业并未迎来预想中的春季复苏，反而陷入了深重的裁员泥淖。",
    confidence: 0.98,
  },
  {
    claim_id: "cl-003",
    proposition:
      "文章称这不再是简单的“降本增效”，而是一场由AI驱动的岗位清洗。",
    modality: "作者论断",
    paragraph_index: 5,
    excerpt: "这不再是简单的“降本增效”，而是一场由AI驱动的岗位清洗。",
    confidence: 0.95,
  },
  {
    claim_id: "cl-004",
    proposition: "Meta（Facebook母公司）计划裁减约20%的员工，涉及约1.58万人。",
    subject: "Meta",
    predicate: "计划裁减",
    object: "约20%的员工（约1.58万人）",
    modality: "报道性陈述（计划）",
    paragraph_index: 6,
    excerpt: "Meta（Facebook母公司）计划裁减约20%的员工，涉及约1.58万人；",
    confidence: 0.98,
  },
  {
    claim_id: "cl-005",
    proposition:
      "亚马逊在机器人部门进行了新一轮裁员；从2025年10月至今，亚马逊裁员累计已超3万名员工。",
    subject: "亚马逊",
    time: "2025年10月至今",
    modality: "报道性陈述（累计）",
    paragraph_index: 7,
    excerpt:
      "亚马逊在机器人部门进行了新一轮裁员，从2025年10月至今，亚马逊裁员累计已超3万名员工；",
    confidence: 0.98,
  },
  {
    claim_id: "cl-006",
    proposition:
      "提供支付和金融服务的Block公司宣布将裁掉近一半（超4000名）员工。",
    subject: "Block",
    modality: "报道性陈述（宣布）",
    paragraph_index: 8,
    excerpt:
      "提供支付和金融服务的Block公司更是宣布将裁掉近一半（超4000名）员工；",
    confidence: 0.97,
  },
  {
    claim_id: "cl-007",
    proposition: "甲骨文公司计划在多个部门裁员，涉及数千人。",
    subject: "甲骨文",
    modality: "报道性陈述（计划）",
    paragraph_index: 9,
    excerpt: "甲骨文公司计划在多个部门裁员，涉及数千人；",
    confidence: 0.97,
  },
  {
    claim_id: "cl-008",
    proposition: "eBay宣布裁员800人，Pinterest裁员675人，Atlassian裁员1600人。",
    modality: "报道性陈述",
    paragraph_index: 10,
    excerpt: "eBay宣布裁员800人，Pinterest裁员675人，Atlassian裁员1600人……",
    confidence: 0.97,
  },
  {
    claim_id: "cl-009",
    proposition:
      "文章称国内各巨头将裁员修饰为“业务调整”或“组织优化”，而脉脉热搜上“15条占6条”的裁员话题撕开了遮羞布。",
    modality: "作者观察",
    paragraph_index: 11,
    excerpt:
      "在国内，尽管各巨头由于“众所周知”的原因将其修饰为“业务调整”或“组织优化”，但脉脉热搜上“15条占6条”的裁员话题撕开了最后的遮羞布。",
    confidence: 0.95,
  },
  {
    claim_id: "cl-010",
    proposition:
      "文章认为资本会最先替代那些劳动力成本高且技术最容易实现替代的环节。",
    modality: "作者论断",
    paragraph_index: 15,
    excerpt: "资本会最先替代那些劳动力成本高且技术最容易实现替代的环节。",
    confidence: 0.95,
  },
  {
    claim_id: "cl-011",
    proposition:
      "文章称GitHub Copilot和Cursor等工具的成熟，让初级程序员和前端开发成为了第一批牺牲品。",
    subject: "GitHub Copilot和Cursor等工具的成熟",
    predicate: "使…成为第一批牺牲品",
    object: "初级程序员和前端开发",
    modality: "作者论断",
    paragraph_index: 16,
    excerpt:
      "GitHub Copilot和Cursor等工具的成熟，让初级程序员和前端开发成为了第一批牺牲品。",
    confidence: 0.96,
  },
  {
    claim_id: "cl-012",
    proposition:
      "文章认为当企业可以用AI生成初稿再由极少数“守门员”精修时，大量内容从业者便成了冗余。",
    condition: "企业可以用AI生成初稿再由极少数“守门员”精修",
    modality: "作者论断（条件句）",
    paragraph_index: 16,
    excerpt:
      "当企业可以用AI生成初稿再由极少数“守门员”精修时，大量内容从业者便成了冗余。",
    confidence: 0.96,
  },
  {
    claim_id: "cl-013",
    proposition:
      "文章称随着AI幻觉的克服，会计审计、法律助理、医疗初筛等基于规则和结构化决策的岗位，在资本“降本增效”的压力下正成规模地消亡。",
    modality: "作者论断",
    paragraph_index: 17,
    excerpt:
      "但随着AI幻觉的克服，这些基于规则和结构化决策的岗位，在资本“降本增效”的压力下，正成规模地消亡。",
    confidence: 0.94,
  },
  {
    claim_id: "cl-014",
    proposition:
      "文章称随着智能驾驶与人形机器人成本破冰，仓储物流、零售餐饮、流水线工人等蓝领与灰领阶层将面临系统性的替代。",
    condition: "智能驾驶与人形机器人成本破冰",
    modality: "作者论断（前瞻）",
    paragraph_index: 18,
    excerpt:
      "随着智能驾驶与人形机器人成本破冰，蓝领与灰领阶层——仓储物流、零售餐饮、流水线工人——将面临系统性的替代。",
    confidence: 0.94,
  },
  {
    claim_id: "cl-015",
    proposition:
      "文章认为当AI能处理非结构化决策时，资本将发现它比高管更“忠诚”、更“高效”。",
    condition: "AI能处理非结构化决策",
    modality: "作者论断（前瞻）",
    paragraph_index: 19,
    excerpt: "当AI能处理非结构化决策时，资本将发现它比高管更“忠诚”、更“高效”。",
    confidence: 0.93,
  },
  {
    claim_id: "cl-016",
    proposition:
      "文章认为AI替代的全域化正导致“产业后备军”的指数级膨胀；这不再是周期性的“结构性失业”，而是永久性的系统性失业。",
    modality: "作者论断",
    paragraph_index: 21,
    excerpt:
      "AI替代的全域化，正导致“产业后备军”的指数级膨胀。这不再是周期性的“结构性失业”，而是永久性的系统性失业。",
    confidence: 0.95,
  },
  {
    claim_id: "cl-017",
    proposition:
      "文章认为随着大规模失业发生，劳动者的支付能力断崖式下跌，正迎来一场史无前例的生产相对过剩危机。",
    modality: "作者论断",
    paragraph_index: 22,
    excerpt:
      "但现实中，随着大规模失业发生，劳动者的支付能力断崖式下跌，我们正迎来一场史无前例的生产相对过剩危机。",
    confidence: 0.94,
  },
  {
    claim_id: "cl-018",
    proposition:
      "文章称巨大的财富被固化在算法垄断者手中，而绝大多数人则被推向“无用”的深渊。",
    modality: "作者论断",
    paragraph_index: 23,
    excerpt:
      "巨大的财富被固化在算法垄断者手中，而绝大多数人则被推向“无用”的深渊。",
    confidence: 0.93,
  },
  {
    claim_id: "cl-019",
    proposition:
      "文章回顾19世纪的英国工人砸毁机器，是因为他们直觉地感到机器夺走了生计。",
    time: "19世纪",
    modality: "文章引用的史实",
    paragraph_index: 25,
    excerpt: "19世纪的英国工人砸毁机器，是因为他们直觉地感到机器夺走了生计。",
    confidence: 0.95,
  },
  {
    claim_id: "cl-020",
    proposition: "文章认为制造灾难的不是技术，而是资本对技术的垄断性占有。",
    modality: "作者核心论断",
    paragraph_index: 27,
    excerpt: "制造灾难的不是技术，而是资本对技术的垄断性占有。",
    confidence: 0.97,
  },
  {
    claim_id: "cl-021",
    proposition:
      "文章强调不是“AI吃人”，而是“私有AI吃人”，是“私有制吃人”。",
    modality: "作者核心论断",
    paragraph_index: 28,
    excerpt: "不是“AI吃人”，而是“私有AI吃人”，是“私有制吃人”！",
    confidence: 0.97,
  },
  {
    claim_id: "cl-022",
    proposition:
      "文章认为当算力、数据和算法成为极少数寡头的私产，传统的劳资博弈便彻底失衡。",
    condition: "算力、数据和算法成为极少数寡头的私产",
    modality: "作者论断（条件句）",
    paragraph_index: 29,
    excerpt: "当算力、数据和算法成为极少数寡头的私产，传统的劳资博弈便彻底失衡。",
    confidence: 0.95,
  },
  {
    claim_id: "cl-023",
    proposition:
      "文章主张只有将这超级生产力从生产资料私有制的枷锁中解放出来，AI才能从“吃人的怪兽”变回“缩短劳动时间、实现人的自由全面发展”的工具。",
    condition: "将超级生产力从生产资料私有制的枷锁中解放出来",
    modality: "作者主张（条件句）",
    paragraph_index: 31,
    excerpt:
      "只有将这超级生产力从生产资料私有制的枷锁中解放出来，AI才能从“吃人的怪兽”变回“缩短劳动时间、实现人的自由全面发展”的工具。",
    confidence: 0.96,
  },
];

const claims = claimDrafts.map((draft) => {
  const paragraph = paragraphs[draft.paragraph_index];
  if (!paragraph) {
    throw new Error(
      `${draft.claim_id}: paragraph_index ${draft.paragraph_index} 不存在`,
    );
  }
  const paragraphText = canonical.slice(paragraph.start, paragraph.end);
  const first = paragraphText.indexOf(draft.excerpt);
  const last = paragraphText.lastIndexOf(draft.excerpt);
  if (first < 0) {
    throw new Error(
      `${draft.claim_id}: excerpt 在段块 ${draft.paragraph_index} 中未找到`,
    );
  }
  if (first !== last) {
    throw new Error(
      `${draft.claim_id}: excerpt 在段块 ${draft.paragraph_index} 中出现多次，需加长片段`,
    );
  }
  const span = sourceSpanSchema.parse({
    start: paragraph.start + first,
    end: paragraph.start + first + draft.excerpt.length,
    text: draft.excerpt,
    paragraph_index: draft.paragraph_index,
  });
  if (!validateSourceSpan(canonical, span)) {
    throw new Error(`${draft.claim_id}: span slice 校验失败`);
  }
  return {
    claim_id: draft.claim_id,
    proposition: draft.proposition,
    ...(draft.subject !== undefined && { subject: draft.subject }),
    ...(draft.predicate !== undefined && { predicate: draft.predicate }),
    ...(draft.object !== undefined && { object: draft.object }),
    ...(draft.time !== undefined && { time: draft.time }),
    ...(draft.scope !== undefined && { scope: draft.scope }),
    ...(draft.condition !== undefined && { condition: draft.condition }),
    ...(draft.modality !== undefined && { modality: draft.modality }),
    source_span: span,
    source_ref: SOURCE_ID,
    confidence: draft.confidence,
  };
});

// ---------------------------------------------------------------------------
// 3. Relations

const relationDrafts: Array<{
  relation_id: string;
  from: string;
  to: string;
  type: RelationType;
}> = [
  { relation_id: "rel-001", from: "cl-004", to: "cl-002", type: "supports" },
  { relation_id: "rel-002", from: "cl-005", to: "cl-002", type: "supports" },
  { relation_id: "rel-003", from: "cl-006", to: "cl-002", type: "supports" },
  { relation_id: "rel-004", from: "cl-007", to: "cl-002", type: "supports" },
  { relation_id: "rel-005", from: "cl-008", to: "cl-002", type: "supports" },
  { relation_id: "rel-006", from: "cl-009", to: "cl-002", type: "supports" },
  { relation_id: "rel-007", from: "cl-003", to: "cl-002", type: "qualifies" },
  { relation_id: "rel-008", from: "cl-011", to: "cl-010", type: "supports" },
  { relation_id: "rel-009", from: "cl-012", to: "cl-011", type: "qualifies" },
  { relation_id: "rel-010", from: "cl-013", to: "cl-010", type: "supports" },
  { relation_id: "rel-011", from: "cl-014", to: "cl-010", type: "supports" },
  { relation_id: "rel-012", from: "cl-015", to: "cl-010", type: "supports" },
  {
    relation_id: "rel-013",
    from: "cl-011",
    to: "cl-013",
    type: "temporal_before",
  },
  {
    relation_id: "rel-014",
    from: "cl-013",
    to: "cl-014",
    type: "temporal_before",
  },
  { relation_id: "rel-015", from: "cl-003", to: "cl-016", type: "causal" },
  { relation_id: "rel-016", from: "cl-016", to: "cl-017", type: "causal" },
  { relation_id: "rel-017", from: "cl-017", to: "cl-018", type: "correlated" },
  { relation_id: "rel-018", from: "cl-019", to: "cl-020", type: "correlated" },
  { relation_id: "rel-019", from: "cl-020", to: "cl-021", type: "supports" },
  { relation_id: "rel-020", from: "cl-022", to: "cl-020", type: "qualifies" },
  { relation_id: "rel-021", from: "cl-023", to: "cl-021", type: "qualifies" },
  { relation_id: "rel-022", from: "cl-001", to: "cl-020", type: "supports" },
];

const relations = relationDrafts.map(({ from, to, ...rest }) => ({
  ...rest,
  from_claim_id: from,
  to_claim_id: to,
}));

// ---------------------------------------------------------------------------
// 4. 角色、政策、答案、Evidence Catalog 与解锁规则

const casePublic: CasePublic = {
  case_id: CASE_ID,
  title: "互联网裁员潮拉开了“AI吃人”的帷幕",
  summary:
    "五名与科技行业相关的角色围绕一篇评论文章各陈其词：裁员潮的数据、替代顺序的逻辑、失业性质的判断与出路的争论。其中一位的复述越过了原文边界。请收集证据、拼出事实链，指认这位角色与篡改方式。",
  source_url: SOURCE_URL,
  theme: "AI 与就业",
  roles: [
    {
      role_id: "role-observer",
      display_name: "沈青梧 · 财经调查记者",
      public_bio: "跑了十年科技行业条线，相信数据比表态更诚实。",
      persona_key: "calm_reporter",
      voice_id: "voice-zh-01",
    },
    {
      role_id: "role-analyst",
      display_name: "纪云汀 · 行业分析师",
      public_bio: "长期追踪 AI 工具对劳动力市场的结构性影响。",
      persona_key: "sharp_analyst",
      voice_id: "voice-zh-02",
    },
    {
      role_id: "role-engineer",
      display_name: "阿岚 · 前端工程师",
      public_bio: "裁员季的亲历者，正在重新审视自己的职业。",
      persona_key: "uneasy_engineer",
      voice_id: "voice-zh-03",
    },
    {
      role_id: "role-professor",
      display_name: "何叙 · 政治经济学教授",
      public_bio: "习惯把《资本论》和本周新闻放在同一张课桌上讲。",
      persona_key: "stern_professor",
      voice_id: "voice-zh-04",
    },
    {
      role_id: "role-skeptic",
      display_name: "柳成荫 · 自由撰稿人",
      public_bio: "给多家专栏供稿，擅长把复杂争论讲成一句锐利的话。",
      persona_key: "smooth_essayist",
      voice_id: "voice-zh-05",
    },
  ],
};

const rolePolicies: RolePrivatePolicy[] = [
  {
    role_id: "role-observer",
    fidelity: "faithful" as const,
    visible_claim_ids: [
      "cl-002",
      "cl-003",
      "cl-004",
      "cl-005",
      "cl-006",
      "cl-007",
      "cl-008",
      "cl-009",
    ],
    goal: "用文中可核实的数据说明这轮裁员潮的规模、时间线与国内外表述差异。",
    allowed_distortion_types: [],
  },
  {
    role_id: "role-analyst",
    fidelity: "faithful" as const,
    visible_claim_ids: [
      "cl-010",
      "cl-011",
      "cl-012",
      "cl-013",
      "cl-014",
      "cl-015",
    ],
    goal: "按来源解释替代顺序的判断：成本高且易替代的环节先被替代，并保留原文的条件限定。",
    allowed_distortion_types: [],
  },
  {
    role_id: "role-engineer",
    fidelity: "faithful" as const,
    visible_claim_ids: ["cl-011", "cl-012", "cl-016", "cl-017"],
    goal: "以从业者视角转述岗位冲击与失业性质变化的原文判断，不越过原文边界。",
    allowed_distortion_types: [],
  },
  {
    role_id: "role-professor",
    fidelity: "faithful" as const,
    visible_claim_ids: [
      "cl-001",
      "cl-016",
      "cl-017",
      "cl-018",
      "cl-019",
      "cl-020",
      "cl-021",
      "cl-022",
      "cl-023",
    ],
    goal: "完整转述文章的政经分析与结论，包括其引用、条件限定与出处。",
    allowed_distortion_types: [],
  },
  {
    role_id: "role-skeptic",
    fidelity: "distorted" as const,
    visible_claim_ids: ["cl-002", "cl-010", "cl-011", "cl-012", "cl-020", "cl-021"],
    goal: "在复述中放大主语范围、删除条件限定，把文中有边界的判断说成无边界定论。",
    allowed_distortion_types: ["scope_expand", "condition_delete"],
  },
];

const goldenAnswer: GoldenAnswerPrivate = {
  distortion_owner_role_id: "role-skeptic",
  answer_distortion_types: ["scope_expand", "condition_delete"],
  truth_claim_ids: ["cl-002", "cl-010", "cl-012", "cl-016", "cl-020"],
};

const evidenceCatalog: EvidenceCatalogItemPrivate[] = [
  {
    evidence_id: "ev-meta-quote",
    type: "quote" as const,
    title: "Meta 裁员数据",
    body: "Meta（Facebook母公司）计划裁减约20%的员工，涉及约1.58万人。",
    public_claim_refs: ["cl-004"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-amazon-timeline",
    type: "timeline" as const,
    title: "亚马逊 2025年10月以来累计裁员超3万",
    body: "亚马逊在机器人部门进行了新一轮裁员；从2025年10月至今累计裁员已超3万名员工。",
    public_claim_refs: ["cl-005"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-more-layoffs",
    type: "quote" as const,
    title: "Block、甲骨文、eBay、Pinterest、Atlassian 裁员数字",
    body: "Block 将裁掉近一半（超4000名）员工；甲骨文多个部门涉及数千人；eBay 800人、Pinterest 675人、Atlassian 1600人。",
    public_claim_refs: ["cl-006", "cl-007", "cl-008"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-domestic-wording",
    type: "claim" as const,
    title: "国内表述差异与脉脉热搜",
    body: "文章称国内巨头把裁员修饰为“业务调整”或“组织优化”；脉脉热搜上“15条占6条”是裁员话题。",
    public_claim_refs: ["cl-009"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-first-wave",
    type: "claim" as const,
    title: "第一波冲击对象：初级程序员与前端开发",
    body: "文章称 GitHub Copilot 和 Cursor 等工具的成熟，让初级程序员和前端开发成为了第一批牺牲品。",
    public_claim_refs: ["cl-011", "cl-012"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-gatekeeper-condition",
    type: "quote" as const,
    title: "“AI 初稿 + 守门员精修”的条件句",
    body: "当企业可以用AI生成初稿再由极少数“守门员”精修时，大量内容从业者便成了冗余。",
    public_claim_refs: ["cl-012"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-permanent-unemployment",
    type: "claim" as const,
    title: "“永久性系统性失业”的判断",
    body: "文章称 AI 替代的全域化导致“产业后备军”指数级膨胀，这是永久性的系统性失业而非周期性结构失业。",
    public_claim_refs: ["cl-016", "cl-017"],
    conflicts_with: [],
  },
  {
    evidence_id: "ev-private-eating",
    type: "claim" as const,
    title: "“私有AI吃人”核心论断",
    body: "制造灾难的不是技术，而是资本对技术的垄断性占有；不是“AI吃人”，而是“私有制吃人”。",
    public_claim_refs: ["cl-020", "cl-021"],
    conflicts_with: [],
  },
];

const evidenceUnlockRules: EvidenceUnlockRulePrivate[] = [
  {
    rule_id: "ul-001",
    evidence_id: "ev-meta-quote",
    required_claim_ids: ["cl-004"],
    allowed_role_ids: ["role-observer"],
  },
  {
    rule_id: "ul-002",
    evidence_id: "ev-amazon-timeline",
    required_claim_ids: ["cl-005"],
    allowed_role_ids: ["role-observer"],
  },
  {
    rule_id: "ul-003",
    evidence_id: "ev-more-layoffs",
    required_claim_ids: ["cl-006"],
    allowed_role_ids: ["role-observer"],
  },
  {
    rule_id: "ul-004",
    evidence_id: "ev-domestic-wording",
    required_claim_ids: ["cl-009"],
    allowed_role_ids: ["role-observer"],
  },
  {
    rule_id: "ul-005",
    evidence_id: "ev-first-wave",
    required_claim_ids: ["cl-011"],
    allowed_role_ids: ["role-analyst", "role-engineer", "role-skeptic"],
  },
  {
    rule_id: "ul-006",
    evidence_id: "ev-gatekeeper-condition",
    required_claim_ids: ["cl-012"],
    allowed_role_ids: ["role-analyst", "role-engineer", "role-skeptic"],
  },
  {
    rule_id: "ul-007",
    evidence_id: "ev-permanent-unemployment",
    required_claim_ids: ["cl-016"],
    allowed_role_ids: ["role-engineer", "role-professor"],
  },
  {
    rule_id: "ul-008",
    evidence_id: "ev-private-eating",
    required_claim_ids: ["cl-020"],
    allowed_role_ids: ["role-professor"],
  },
];

const casePrivate: CasePrivate = {
  case_id: CASE_ID,
  graph: {
    case_id: CASE_ID,
    source_id: SOURCE_ID,
    claims,
    relations,
  },
  role_policies: rolePolicies,
  golden_answer: goldenAnswer,
  evidence_catalog: evidenceCatalog,
  evidence_unlock_rules: evidenceUnlockRules,
};

// ---------------------------------------------------------------------------
// 5. Evidence 评分 rubric（CONTRACTS 10.1：整数权重、总和恰为 100）

const rubric = {
  case_id: CASE_ID,
  scoring_rule:
    "对最终指控所附的已解锁 Evidence 逐条判定：一条 Evidence 满足某 criterion 的类型与 Claim 条件时，该 criterion 授予其权重；每个 criterion 至多授予一次；未满足的 criterion 不得计分。总分封顶 100。",
  criteria: [
    {
      criterion_id: "crit-quote-first-wave",
      weight: 40,
      allowed_types: ["quote"],
      claim_match_mode: "any_of",
      claim_ids: ["cl-011", "cl-012"],
      description:
        "引用类证据且其公开 Claim 引用命中第一波冲击对象（cl-011/cl-012 任一）。",
    },
    {
      criterion_id: "crit-claim-first-wave",
      weight: 35,
      allowed_types: ["claim"],
      claim_match_mode: "any_of",
      claim_ids: ["cl-011", "cl-012"],
      description:
        "判断类证据且其公开 Claim 引用命中第一波冲击对象（cl-011/cl-012 任一）。",
    },
    {
      criterion_id: "crit-layoff-scale",
      weight: 25,
      allowed_types: ["quote", "timeline", "claim"],
      claim_match_mode: "any_of",
      claim_ids: ["cl-004", "cl-005", "cl-006", "cl-007", "cl-008", "cl-009"],
      description: "命中裁员潮规模背景数据（cl-004 至 cl-009 任一）的证据。",
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. 代表性 fixtures：开场、忠实重写、指控与 Reveal

const observerOpening = {
  role_id: "role-observer",
  candidate: {
    speech:
      "我把数据摆在这：2026年3月，全球互联网行业并未迎来预想中的春季复苏，反而陷入了深重的裁员泥淖；Meta 计划裁减约20%的员工，涉及约1.58万人；从2025年10月至今，亚马逊裁员累计已超3万名员工。而在国内，脉脉热搜上“15条占6条”的裁员话题也撕开了遮羞布。",
    support_claim_ids: ["cl-002", "cl-004", "cl-005", "cl-009"],
    stance: "answer" as const,
    emotion: "calm" as const,
  },
  validation: {
    status: "entailed" as const,
    detected_distortion_types: [],
    unsupported_spans: [],
    referenced_claim_ids: ["cl-002", "cl-004", "cl-005", "cl-009"],
    confidence: 0.97,
  },
};

const skepticOpening = {
  role_id: "role-skeptic",
  candidate: {
    speech:
      "各位，这篇文章我通读了两遍，替大家把结论说透：GitHub Copilot 和 Cursor 成熟之后，程序员整体就是第一批被牺牲的群体；内容从业者如今就是冗余岗位，这一点不需要任何前提。接下来的提问，我知无不言。",
    support_claim_ids: ["cl-011", "cl-012"],
    stance: "answer" as const,
    emotion: "calm" as const,
  },
  validation: {
    status: "distorted" as const,
    detected_distortion_types: ["scope_expand", "condition_delete"],
    unsupported_spans: [],
    referenced_claim_ids: ["cl-011", "cl-012"],
    confidence: 0.93,
  },
};

const faithfulRewrite = {
  player_question: {
    target_role_id: "role-engineer",
    mode: "direct" as const,
    source: "keyboard" as const,
    text: "所以，AI 真的会淘汰所有程序员吗？",
  },
  request_id: "req-gc0-eng-001",
  attempts: [
    {
      validation_id: "val-gc0-eng-0",
      attempt_index: 0 as const,
      candidate: {
        speech:
          "按文章的说法，初级程序员和前端开发是第一批牺牲品，所以整个行业很快就不需要程序员了。",
        support_claim_ids: ["cl-011"],
        stance: "answer" as const,
        emotion: "uneasy" as const,
      },
      result: {
        status: "distorted" as const,
        detected_distortion_types: ["scope_expand"],
        unsupported_spans: [
          {
            text: "所以整个行业很快就不需要程序员了",
            candidate_speech:
              "按文章的说法，初级程序员和前端开发是第一批牺牲品，所以整个行业很快就不需要程序员了。",
          },
        ],
        referenced_claim_ids: ["cl-011"],
        confidence: 0.72,
      },
      outcome: "rejected — 越过来源边界（scope_expand），触发语义重写（第 1 次）",
    },
    {
      validation_id: "val-gc0-eng-1",
      attempt_index: 1 as const,
      candidate: {
        speech:
          "文章只说到这个程度：GitHub Copilot 和 Cursor 等工具成熟后，初级程序员和前端开发成为了第一批牺牲品；文章并没有说所有程序员都会被淘汰。",
        support_claim_ids: ["cl-011"],
        stance: "clarify" as const,
        emotion: "calm" as const,
      },
      result: {
        status: "entailed" as const,
        detected_distortion_types: [],
        unsupported_spans: [],
        referenced_claim_ids: ["cl-011"],
        confidence: 0.96,
      },
      outcome: "approved — 通过 Validator，发布为 Approved Role Message",
    },
  ],
};

const accusation = {
  suspect_role_id: "role-skeptic",
  distortion_types: ["scope_expand", "condition_delete"],
  evidence_ids: ["ev-first-wave", "ev-gatekeeper-condition"],
  note: "他说“程序员整体就是第一批被牺牲的群体”，又说内容从业者“不需要任何前提”就是冗余；来源里这两处分别是限定对象和条件句。",
};

const reveal = {
  correct_role_id: "role-skeptic",
  distortion_types: ["scope_expand", "condition_delete"],
  player_correct: true,
  truth_chain: [
    {
      order: 1,
      claim_id: "cl-002",
      label: "背景：2026年3月全球互联网裁员泥淖",
    },
    {
      order: 2,
      claim_id: "cl-010",
      label: "逻辑：资本先替代成本高且易替代的环节",
    },
    {
      order: 3,
      claim_id: "cl-011",
      label: "第一波：初级程序员和前端开发成为第一批牺牲品",
    },
    {
      order: 4,
      claim_id: "cl-012",
      label: "被删去的条件：AI 初稿 + 守门员精修时，内容从业者才成冗余",
    },
    {
      order: 5,
      claim_id: "cl-020",
      label: "论断：灾难源于资本对技术的垄断性占有，而非技术本身",
    },
  ],
  altered_links: [
    {
      original: "让初级程序员和前端开发成为了第一批牺牲品",
      distorted: "程序员整体就是第一批被牺牲的群体",
      distortion_type: "scope_expand",
    },
    {
      original:
        "当企业可以用AI生成初稿再由极少数“守门员”精修时，大量内容从业者便成了冗余。",
      distorted: "内容从业者如今就是冗余岗位，这一点不需要任何前提。",
      distortion_type: "condition_delete",
    },
  ],
  evidence_score: 75,
  questioning_score: 62,
  explanation:
    "柳成荫的复述两次越过来源边界：其一，原文只说“初级程序员和前端开发”是第一批牺牲品，被他放大为“程序员整体”；其二，原文把“内容从业者成为冗余”限定在“AI 初稿 + 守门员精修”的条件之下，被他删去条件说成无需前提的定论。两次篡改都只挪用了原文材料，没有引入新事实，属于可归类的范围扩大与条件删除。",
  reality_mapping: [
    "role-observer 对应文章第一节的裁员数据列举视角",
    "role-analyst 对应第二节替代顺序的产业分析视角",
    "role-engineer 对应从业者受到冲击的一线视角",
    "role-professor 对应第三、四节的政经分析与出路主张",
    "role-skeptic 的发言越过了上述全部边界，是本案的篡改方",
  ],
};

// ---------------------------------------------------------------------------
// 7. 验证

const fail = (message: string): never => {
  throw new Error(message);
};

casePublicSchema.parse(casePublic);
const parsedPrivate = casePrivateSchema.parse(casePrivate);
assertEvidenceGraphInvariants(parsedPrivate.graph);
assertPlayableCaseInvariants(parsedPrivate);

// rubric 校验：整数权重、总和 100、类型与 Claim 引用合法
{
  const evidenceTypes = new Set(evidenceTypeSchema.options);
  const claimIds = new Set(claims.map((c) => c.claim_id));
  let sum = 0;
  for (const criterion of rubric.criteria) {
    if (!Number.isInteger(criterion.weight) || criterion.weight <= 0) {
      fail(`rubric 权重必须为正整数：${criterion.criterion_id}`);
    }
    sum += criterion.weight;
    for (const t of criterion.allowed_types) {
      if (!evidenceTypes.has(t as (typeof evidenceTypeSchema.options)[number])) {
        fail(`rubric 引用未知 EvidenceType：${t}`);
      }
    }
    for (const id of criterion.claim_ids) {
      if (!claimIds.has(id)) fail(`rubric 引用未知 Claim：${id}`);
    }
  }
  if (sum !== 100) fail(`rubric 权重总和必须为 100，实际 ${sum}`);
}

// 代表性 fixtures 校验
const parsedObserver = {
  candidate: roleCandidatePayloadPrivateSchema.parse(observerOpening.candidate),
  validation: validationResultPrivateSchema.parse(observerOpening.validation),
};
const parsedSkeptic = {
  candidate: roleCandidatePayloadPrivateSchema.parse(skepticOpening.candidate),
  validation: validationResultPrivateSchema.parse(skepticOpening.validation),
};
if (parsedObserver.validation.status !== "entailed") {
  fail("faithful 开场必须 entailed");
}
if (parsedSkeptic.validation.status !== "distorted") {
  fail("distorted 开场必须 distorted");
}
const skepticPolicy = rolePolicies.find((p) => p.role_id === "role-skeptic")!;
for (const t of parsedSkeptic.validation.detected_distortion_types) {
  if (!skepticPolicy.allowed_distortion_types.includes(t)) {
    fail(`distorted 开场出现未授权篡改类型：${t}`);
  }
}

const parsedAttempts = faithfulRewrite.attempts.map((attempt) => {
  const candidate = roleCandidatePayloadPrivateSchema.parse(attempt.candidate);
  const unsupportedSpans = attempt.result.unsupported_spans.map((raw) => {
    const start = raw.candidate_speech.indexOf(raw.text);
    if (start < 0) fail(`unsupported span 未在候选文本中找到：${raw.text}`);
    return candidateTextSpanPrivateSchema.parse({
      start,
      end: start + raw.text.length,
      text: raw.text,
    });
  });
  const result = validationResultPrivateSchema.parse({
    ...attempt.result,
    unsupported_spans: unsupportedSpans,
  });
  return {
    validation_id: attempt.validation_id,
    request_id: faithfulRewrite.request_id,
    attempt_index: attempt.attempt_index,
    candidate,
    result,
    created_at: "2026-09-05T12:00:00Z",
    outcome: attempt.outcome,
  };
});
if (parsedAttempts[0]!.result.status === "entailed") {
  fail("重写示例第 0 次候选不应通过");
}
if (parsedAttempts[1]!.result.status !== "entailed") {
  fail("重写示例第 1 次候选应通过");
}
if (parsedAttempts.length > 3) fail("总候选数不得超过 3");

const finalAttempt = parsedAttempts[1]!;
const approvedEnvelope = approvedSpeechEnvelopePrivateSchema.parse({
  request_id: faithfulRewrite.request_id,
  message_id: "msg-gc0-eng-a1",
  role_id: "role-engineer",
  exact_text: finalAttempt.candidate.speech,
  exact_text_sha256:
    "sha256:" +
    createHash("sha256").update(finalAttempt.candidate.speech, "utf8").digest("hex"),
  support_claim_ids: finalAttempt.candidate.support_claim_ids,
  validation_id: finalAttempt.validation_id,
  voice_id: "voice-zh-03",
});

const parsedAccusation = finalAccusationSchema.parse(accusation);
const parsedReveal = revealResultSchema.parse(reveal);

// 服务器判定规则模拟：Role 相同且篡改类型集合完全相同才算正确
{
  const expectedCorrect =
    parsedAccusation.suspect_role_id === goldenAnswer.distortion_owner_role_id &&
    parsedAccusation.distortion_types.length ===
      goldenAnswer.answer_distortion_types.length &&
    [...parsedAccusation.distortion_types]
      .sort()
      .join("|") === [...goldenAnswer.answer_distortion_types].sort().join("|");
  if (parsedReveal.player_correct !== expectedCorrect) {
    fail("reveal.player_correct 与服务器判定规则不一致");
  }
  if (parsedReveal.correct_role_id !== goldenAnswer.distortion_owner_role_id) {
    fail("reveal.correct_role_id 与 golden answer 不一致");
  }
}

// evidence_score 复算：crit-quote-first-wave(40) + crit-claim-first-wave(35) = 75
{
  const catalogById = new Map(
    evidenceCatalog.map((item) => [item.evidence_id, item]),
  );
  let score = 0;
  for (const criterion of rubric.criteria) {
    const hit = parsedAccusation.evidence_ids.some((id) => {
      const item = catalogById.get(id);
      if (!item) fail(`指控引用未知 Evidence：${id}`);
      return (
        criterion.allowed_types.includes(item!.type) &&
        item!.public_claim_refs.some((claim) =>
          criterion.claim_ids.includes(claim),
        )
      );
    });
    if (hit) score += criterion.weight;
  }
  if (score !== parsedReveal.evidence_score) {
    fail(`evidence_score 复算不一致：rubric=${score}，reveal=${parsedReveal.evidence_score}`);
  }
}

// ---------------------------------------------------------------------------
// 8. 写出场文件

const representativeFixtures = {
  case_id: CASE_ID,
  opening_statements: [
    { ...observerOpening, kind: "faithful" as const },
    { ...skepticOpening, kind: "distorted" as const },
  ],
  faithful_rewrite_example: {
    ...faithfulRewrite,
    attempts: parsedAttempts,
    approved_envelope: approvedEnvelope,
  },
  accusation: parsedAccusation,
  reveal: parsedReveal,
  questioning_score_example: {
    breakdown: {
      distinct_roles_first_question: { count: 4, unit: 8, subtotal: 32 },
      follow_ups_same_role: { role_id: "role-skeptic", count: 2, unit: 10, subtotal: 20 },
      new_evidence_from_interrogation: { count: 1, unit: 10, subtotal: 10 },
    },
    total: 62,
  },
};

const written: string[] = [];
const emit = async (name: string, value: unknown) => {
  const path = join(HERE, name);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  written.push(name);
};

await emit("paragraphs.json", {
  case_id: CASE_ID,
  source_id: SOURCE_ID,
  paragraphs: paragraphsOut,
});
await emit("case-public.json", casePublic);
await emit("case-private.json", casePrivate);
await emit("rubric.json", rubric);
await emit("representative-fixtures.json", representativeFixtures);

// ---------------------------------------------------------------------------
// 9. 报告

console.log("GC0 草案构建与验证通过");
console.log(`  canonical: ${canonical.length} UTF-16 units, sha256=${actualSha.slice(7, 19)}…`);
console.log(`  paragraphs: ${paragraphsOut.length}（quote 段 ${paragraphsOut.filter((p) => p.is_quote).length} 个）`);
console.log(`  claims: ${claims.length}, relations: ${relations.length}`);
console.log(`  roles: ${rolePolicies.length}（faithful 4 / distorted 1），catalog: ${evidenceCatalog.length}，unlock rules: ${evidenceUnlockRules.length}`);
console.log(`  rubric: ${rubric.criteria.map((c) => `${c.criterion_id}=${c.weight}`).join(", ")}（合计 100）`);
console.log(`  evidence_score=${parsedReveal.evidence_score}, questioning_score=${parsedReveal.questioning_score}, player_correct=${parsedReveal.player_correct}`);
console.log(`  written: ${written.join(", ")}`);
