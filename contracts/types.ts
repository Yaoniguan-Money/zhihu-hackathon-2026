// ===== A端公开接口类型 (contracts/public) =====
// B端只能消费这些类型，Private 类型不导出

// --- 案件目录 ---
export interface CaseCatalogItemPublic {
  case_id: string;
  title: string;
  summary: string;
  theme: string;
  source_url: string;
}

// --- 案件公开信息 (cases.getPublic) ---
export interface CasePublic {
  case_id: string;
  title: string;
  summary: string;
  theme: string;
  source_url: string;
  roles: RolePublic[];  // 5个角色，公开信息不得暗示谁是篡改方
}

// --- 角色公开信息 (RolePublic) ---
// fidelity/persona 是私有的，B端永远拿不到 is_distorted
export interface RolePublic {
  role_id: string;           // 语义化ID: "role-professor", "role-skeptic" 等
  display_name: string;      // "陈教授"
  public_bio: string;       // 公开人设描述
  persona_key: string;      // 人设关键词
  voice_id: string;          // "voice-zh-01" ~ "voice-zh-05"
}

// --- 原文公开信息 (cases.getSource) ---
export interface SourceDocumentPublic {
  case_id: string;
  canonical_text: string;    // 结构化正文
  content_sha256: string;     // 内容哈希
  source_url: string;
}

// --- 证据碎片公开信息 (evidence.getAll) ---
// unlock_rule 是私有的，B端只拿已解锁的证据
export interface EvidenceFragmentPublic {
  evidence_id: string;
  type: "dialogue" | "claim" | "contradiction";
  source_turn_id?: string;
  source_claim_id?: string;
  content: string;
  related_role_ids: string[];           // 涉及角色（语义化ID）
  conflicts_with?: string;                // 服务端预置冲突提示（可为空）
}

// --- 对话 (roleTurns.observe 推送) ---
export interface DialogueTurn {
  turn_id: string;
  role_id: string;                        // 语义化ID
  content: string;
  timestamp: number;
  audio_url?: string;
  pressure_level: number;                 // 0-100
  is_interrupted: boolean;
  metadata?: {
    related_claim_ids?: string[];
    newly_unlocked_evidence_ids?: string[]; // 新解锁的证据ID（公开信号）
  };
  // distortion_type 是私有的，B端不可见
}

// --- 证据板连线 (玩家自己拉) ---
export interface BoardLink {
  link_id: string;
  source_evidence_id: string;
  target_evidence_id: string;
  relation: BoardRelation;
}

export type BoardRelation =
  | "contradicts"      // 矛盾
  | "supports"         // 支持
  | "before"           // 时间在前
  | "after"            // 时间在后
  | "qualifies"        // 限定/补充
  | "claims_causal";   // 声称因果

// --- 最终指控 ---
export interface Accusation {
  accused_role_id: string;    // 语义化ID
  evidence_ids: string[];
  reasoning: string;
}

// --- 揭晓结果 (GM揭晓) ---
// score.criteria 细节是私有的，B端只展示总分
export interface RevealResult {
  is_correct: boolean;
  distorted_role_id: string;              // 语义化ID
  distortion_types: DistortionType[];      // 篡改方式数组
  original_text: string;
  distorted_text: string;
  explanation: string;
  reality_mapping: string[];
  score: {
    evidence_score: number;                // 满分100（含40+35+25加权项）
    questioning_score: number;             // 审讯质量分
    total: number;                          // 总分
  };
}

// --- 篡改类型枚举 ---
export type DistortionType =
  | "scope_expand"         // 范围扩大
  | "degree_strengthen"    // 程度加强
  | "condition_delete"     // 条件删除
  | "causal_swap"          // 因果倒置
  | "time_montage"         // 时间拼接
  | "source_splice"        // 来源拼接
  | "context_omit"         // 语境遗漏
  | "subject_swap"         // 主语替换
  | "concept_shift"        // 概念偷换
  | "cherry_pick";         // 选择性引用

// --- 游戏状态 (SessionView 镜像) ---
export type GameState =
  | "lobby"
  | "briefing"
  | "interrogation"
  | "evidence_review"
  | "accusation"
  | "reveal"
  | "game_over";

export interface SessionView {
  session_id: string;
  case_id: string;
  current_round: number;
  max_rounds: number;
  time_remaining: number;
  state: GameState;
}

// --- GM配置（从CasePublic推断，不含私有配置） ---
export interface GameConfig {
  max_rounds: number;
  interrogation_time_limit: number;
  evidence_slots: number;
}
