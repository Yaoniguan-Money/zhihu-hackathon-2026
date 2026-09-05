import {
  CaseCatalogItemPublic,
  CasePublic,
  SourceDocumentPublic,
  EvidenceFragmentPublic,
  DialogueTurn,
  RevealResult,
  RolePublic,
  GameConfig,
} from '@/contracts/types';

// ===== Mock API 层 — 模拟 Convex 的公开查询 =====
// A端私有数据(is_distorted/distortion_types/unlock_rule等) B端永远拿不到

// --- cases.listPublic → CaseCatalogItemPublic[] ---
export function mockListPublic(): CaseCatalogItemPublic[] {
  return [
    {
      case_id: 'case-demo-001',
      title: '星辰科技裁员事件：AI取代了谁？',
      summary: '2024年Q1星辰科技组织架构调整，技术部门裁员30人，与引入AI自动化流程有关。匿名员工称实际超50人，公司否认。',
      theme: 'AI时代的职场真相',
      source_url: 'https://zhuanlan.zhihu.com/p/example',
    },
  ];
}

// --- cases.getPublic(case_id) → CasePublic | null ---
export function mockGetPublic(case_id: string): CasePublic | null {
  if (case_id !== 'case-demo-001') return null;
  return {
    case_id: 'case-demo-001',
    title: '星辰科技裁员事件：AI取代了谁？',
    summary: '2024年Q1星辰科技组织架构调整，技术部门裁员30人，与引入AI自动化流程有关。匿名员工称实际超50人，公司否认。',
    theme: 'AI时代的职场真相',
    source_url: 'https://zhuanlan.zhihu.com/p/example',
    roles: mockRoles,
  };
}

// --- cases.getSource(case_id) → SourceDocumentPublic | null ---
export function mockGetSource(case_id: string): SourceDocumentPublic | null {
  if (case_id !== 'case-demo-001') return null;
  return {
    case_id: 'case-demo-001',
    canonical_text: `# 星辰科技裁员事件

2024年3月，星辰科技有限公司进行了一轮组织架构调整。
据内部通知，技术部门裁员30人，占技术团队约15%。

被裁员工中，部分岗位涉及AI模型训练数据标注。
公司发言人表示，此次调整与引入AI自动化流程有关，
但强调AI并未完全取代这些岗位，而是"部分流程优化"。

财报显示，2024年Q1星辰科技研发成本下降了12%，
其中人力成本降低是主要因素。

不过，一位匿名员工透露，实际裁员人数可能超过50人，
且不仅限于技术部门。产品部门也有多人离开。

对此，公司回应称"以官方公告为准"，
否认了"大规模裁员"的说法。`,
    content_sha256: 'a1b2c3d4e5f6',
    source_url: 'https://zhuanlan.zhihu.com/p/example',
  };
}

// --- RolePublic[] — 公开角色信息，无 is_distorted ---
export const mockRoles: RolePublic[] = [
  {
    role_id: 'role-professor',
    display_name: '陈教授',
    public_bio: 'AI领域学者，理性客观，喜欢引用数据',
    persona_key: '理性·数据派',
    voice_id: 'voice-zh-01',
  },
  {
    role_id: 'role-skeptic',
    display_name: '小林',
    public_bio: '星辰科技前员工，情绪化，有内幕消息',
    persona_key: '情绪·内幕派',
    voice_id: 'voice-zh-02',
  },
  {
    role_id: 'role-observer',
    display_name: '阿凯',
    public_bio: '科技记者，追求事实，喜欢追问细节',
    persona_key: '求实·追问派',
    voice_id: 'voice-zh-03',
  },
  {
    role_id: 'role-engineer',
    display_name: '老王',
    public_bio: '公司退休高管，了解内幕，说话含蓄',
    persona_key: '含蓄·内行派',
    voice_id: 'voice-zh-04',
  },
  {
    role_id: 'role-analyst',
    display_name: '豆豆',
    public_bio: 'AI助手，引用资料但可能有AI幻觉',
    persona_key: 'AI·引用派',
    voice_id: 'voice-zh-05',
  },
];

// --- GameConfig (从CasePublic推断) ---
export const mockGameConfig: GameConfig = {
  max_rounds: 3,
  interrogation_time_limit: 90,
  evidence_slots: 3,
};

// --- mockDialogues — 初始5条角色陈述 ---
// distortion_type 是私有的，metadata 里不包含
export const mockDialogues: DialogueTurn[] = [
  {
    turn_id: 't-001',
    role_id: 'role-professor',
    content: '根据财报数据，星辰科技技术部门裁员30人，占技术团队约15%。',
    timestamp: Date.now() - 60000,
    pressure_level: 20,
    is_interrupted: false,
    metadata: { related_claim_ids: ['c-001', 'c-002'] },
  },
  {
    turn_id: 't-002',
    role_id: 'role-skeptic',
    content: '我记得实际裁员超过了50人，而且不止技术部门，产品部门也裁了不少。',
    timestamp: Date.now() - 45000,
    pressure_level: 45,
    is_interrupted: false,
    metadata: { related_claim_ids: ['c-006', 'c-007'] },
  },
  {
    turn_id: 't-003',
    role_id: 'role-observer',
    content: '我向公司求证过，官方回应称"以公告为准"，否认了大规模裁员。',
    timestamp: Date.now() - 30000,
    pressure_level: 30,
    is_interrupted: false,
    metadata: { related_claim_ids: ['c-008'] },
  },
  {
    turn_id: 't-004',
    role_id: 'role-engineer',
    content: '这个嘛...技术部门确实有调整，但具体数字我不方便说。公司的官方说法是30人。',
    timestamp: Date.now() - 15000,
    pressure_level: 55,
    is_interrupted: false,
    metadata: { related_claim_ids: ['c-001'] },
  },
  {
    turn_id: 't-005',
    role_id: 'role-analyst',
    content: '根据我检索到的资料，星辰科技2024年Q1研发成本下降了12%，主要原因是人力成本降低。',
    timestamp: Date.now() - 5000,
    pressure_level: 10,
    is_interrupted: false,
    metadata: { related_claim_ids: ['c-005'] },
  },
];

// --- evidence.getAll(session_id) → EvidenceFragmentPublic[] ---
// 只返回已解锁的证据，unlock_rule 不存在
export const mockEvidences: EvidenceFragmentPublic[] = [
  {
    evidence_id: 'e-001',
    type: 'dialogue',
    source_turn_id: 't-001',
    content: '陈教授：技术部门裁员30人，占技术团队约15%',
    related_role_ids: ['role-professor'],
  },
  {
    evidence_id: 'e-002',
    type: 'dialogue',
    source_turn_id: 't-002',
    content: '小林：实际裁员超过50人，不止技术部门',
    related_role_ids: ['role-skeptic'],
    conflicts_with: 'e-001',
  },
  {
    evidence_id: 'e-003',
    type: 'claim',
    source_claim_id: 'c-001',
    content: '原文：技术部门裁员30人',
    related_role_ids: [],
  },
  {
    evidence_id: 'e-004',
    type: 'claim',
    source_claim_id: 'c-006',
    content: '原文：匿名员工称可能超过50人',
    related_role_ids: [],
  },
  {
    evidence_id: 'e-005',
    type: 'contradiction',
    content: '数量矛盾：30人 vs 50人',
    related_role_ids: ['role-professor', 'role-skeptic'],
    conflicts_with: 'e-001',
  },
  {
    evidence_id: 'e-006',
    type: 'dialogue',
    source_turn_id: 't-005',
    content: '豆豆：Q1研发成本下降12%',
    related_role_ids: ['role-analyst'],
  },
  {
    evidence_id: 'e-007',
    type: 'claim',
    source_claim_id: 'c-005',
    content: '原文：2024年Q1研发成本下降12%',
    related_role_ids: [],
  },
  {
    evidence_id: 'e-008',
    type: 'dialogue',
    source_turn_id: 't-003',
    content: '阿凯：公司否认大规模裁员',
    related_role_ids: ['role-observer'],
  },
];

// --- mockRevealResult ---
// criteria细节是私有的，B端只展示 evidence_score + questioning_score + total
export const mockRevealResult: RevealResult = {
  is_correct: true,
  distorted_role_id: 'role-skeptic',
  distortion_types: ['scope_expand', 'condition_delete'],
  original_text: '技术部门裁员30人',
  distorted_text: '实际裁员超过50人，不止技术部门',
  explanation: '小林将"技术部门裁员30人"的范围扩大为"公司裁员超过50人且不限部门"（scope_expand），同时去掉了原文中"可能"这一限定条件，将猜测当作确定事实陈述（condition_delete）。',
  reality_mapping: [
    '交叉验证法：当不同来源的数据冲突时，回到原文核实确切措辞',
    '注意限定词："可能""部分""约"等限定词被去掉后，结论会完全不同',
    'AI幻觉警惕：AI可能会像小林一样，把不确定的信息当作确定事实输出',
  ],
  score: {
    evidence_score: 78,       // 含 40+35+25 加权项总分
    questioning_score: 62,    // 审讯质量分
    total: 78,                // 总分（满分100）
  },
};

// --- Mock AI 回复（审讯桌用） ---
export const mockReplies: { roleId: string; content: string; pressure: number; claims: string[] }[] = [
  { roleId: 'role-professor', content: '根据我了解的数据，技术部门确实裁员了30人，这个数字在财报中有明确记录。', pressure: 25, claims: ['c-001', 'c-002'] },
  { roleId: 'role-skeptic', content: '我记得实际裁员超过了50人，而且不止技术部门，产品部门也裁了不少。', pressure: 50, claims: ['c-006', 'c-007'] },
  { roleId: 'role-observer', content: '我向公司求证过，官方回应称"以公告为准"，否认了大规模裁员。', pressure: 35, claims: ['c-008'] },
  { roleId: 'role-engineer', content: '这个嘛...技术部门确实有调整，但具体数字我不方便说。公司的官方说法是30人。', pressure: 60, claims: ['c-001'] },
  { roleId: 'role-analyst', content: '根据我检索到的资料，星辰科技2024年Q1研发成本下降了12%，主要原因是人力成本降低。', pressure: 15, claims: ['c-005'] },
];
