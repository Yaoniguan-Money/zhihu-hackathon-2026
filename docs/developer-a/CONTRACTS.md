# Evidence / AI Engine 契约

状态：**规范性，接口冻结候选，待开发人员 B 共同评审**。

本文是 A/B 跨端数据形状、运行时校验、调用顺序和错误语义的唯一事实来源。示例 TypeScript 同时代表必须实现的运行时 schema；类型检查不能替代运行时验证。

## 1. 契约分区

实现必须物理分为三个导出入口：

- `shared`：ID、时间、Source Span、Distortion Type 等不携带秘密的基础类型。
- `public`：Browser、B 端页面和 XState 唯一可以导入的类型。
- `private`：只允许 Convex internal functions、AI Orchestrator、Validator、GM 与 Voice 实现导入。

Public 禁止出现：

- `fidelity`、`visible_claim_ids`、`support_claim_ids`、Role Policy。
- 篡改者 ID、获准 Distortion Type、标准答案或未解锁 Claim。
- ValidationResult、重写次数、Prompt、模型名称、候选或原始输出。
- 私有审计事件、provider 原始错误或任何 Secret。

不得先构造 Private 对象再依赖浏览器端 `omit`。Public Projection 必须在服务端以独立 schema 构造并校验。

## 2. Shared 类型

```ts
export type CaseId = string;
export type SessionId = string;
export type SourceId = string;
export type RoleId = string;
export type ClaimId = string;
export type MessageId = string;
export type EvidenceId = string;
export type RequestId = string;
export type EventId = string;
export type ClientActionId = string;
export type IsoDateTime = string;
export type Sha256Digest = `sha256:${string}`;

export type DistortionType =
  | "scope_expand"
  | "degree_strengthen"
  | "condition_delete"
  | "causal_swap"
  | "time_montage"
  | "source_splice"
  | "context_omit"
  | "subject_swap"
  | "concept_shift"
  | "cherry_pick";

export type RelationType =
  | "supports"
  | "qualifies"
  | "contradicts"
  | "temporal_before"
  | "temporal_after"
  | "causal"
  | "correlated"
  | "source_of";

export interface SourceSpan {
  start: number;
  end: number;
  text: string;
  paragraph_index: number;
}
```

所有 ID 是服务端生成的不透明非空字符串；调用方不得解析其结构。`ClientActionId` 是调用方生成的 UUID。`IsoDateTime` 是含时区的 RFC 3339 字符串。`Sha256Digest` 使用小写十六进制并带 `sha256:` 前缀。未知字段、未知枚举和越界数值一律拒绝。

## 3. Canonical Source 与 Source Span

### 3.1 规范化算法

`cases.createFromSource` 的 `source_text` 必须按以下唯一顺序处理：

1. 输入必须是用户手动提供的完整可见正文；空字符串或仅空白字符判为无效。
2. 如果第一个 UTF-16 code unit 是 U+FEFF，只移除这一个开头 BOM。
3. 将所有 CRLF 替换为 LF，再将剩余 CR 替换为 LF。
4. 不执行 trim、Unicode normalization、空白折叠、HTML 修复、标点转换、敏感词改写或截断。
5. `content_sha256` 对 Canonical Source 的 UTF-8 字节计算。

`source_url` 必须是绝对 HTTPS URL，仅作为来源记录；创建案件时不对该 URL 发起网络请求。当前系统不验证 URL 页面与正文是否一致。

### 3.2 Span 不变量

- `start` 与 `end` 是 Canonical Source 上的 UTF-16 code unit 偏移。
- 区间是半开区间 `[start, end)`；必须是整数且满足 `0 <= start < end <= canonical_text.length`。
- 必须满足 `text === canonical_text.slice(start, end)`。
- `paragraph_index` 从 0 开始；一个 Span 必须完整落在一个规范化段落内。
- 任何不匹配都使所属结构化结果无效；不得搜索“最相近文本”重新定位。

```ts
export interface SourceDocumentPublic {
  source_id: SourceId;
  case_id: CaseId;
  source_url: string;
  canonical_text: string;
  content_sha256: Sha256Digest;
}
```

## 4. Evidence Graph 与案件

### 4.1 Private 图谱

```ts
export interface ClaimPrivate {
  claim_id: ClaimId;
  proposition: string;
  subject?: string;
  predicate?: string;
  object?: string;
  time?: string;
  scope?: string;
  condition?: string;
  modality?: string;
  source_span: SourceSpan;
  source_ref: SourceId;
  confidence: number; // inclusive 0..1
}

export interface ClaimRelationPrivate {
  relation_id: string;
  from_claim_id: ClaimId;
  to_claim_id: ClaimId;
  type: RelationType;
}

export interface EvidenceGraphPrivate {
  case_id: CaseId;
  source_id: SourceId;
  claims: ClaimPrivate[];
  relations: ClaimRelationPrivate[];
}
```

每个 Claim ID 与 Relation ID 在案件内唯一；每条 Relation 的端点存在且不能自指。`confidence` 是审计信息，不能替代不变量校验，也不公开给 Browser。

### 4.2 Public / Private Case

```ts
export interface RolePublic {
  role_id: RoleId;
  display_name: string;
  public_bio: string;
  persona_key: string;
  voice_id: string;
}

export interface CasePublic {
  case_id: CaseId;
  title: string;
  summary: string;
  source_url: string;
  theme: string;
  roles: RolePublic[];
}

export interface RolePrivatePolicy {
  role_id: RoleId;
  fidelity: "faithful" | "distorted";
  visible_claim_ids: ClaimId[];
  goal: string;
  allowed_distortion_types: DistortionType[];
}

export interface GoldenAnswerPrivate {
  distortion_owner_role_id: RoleId;
  answer_distortion_types: DistortionType[];
  truth_claim_ids: ClaimId[];
}

export interface EvidenceUnlockRulePrivate {
  rule_id: string;
  evidence_id: EvidenceId;
  required_claim_ids: ClaimId[];
  allowed_role_ids: RoleId[];
}

export interface CasePrivate {
  case_id: CaseId;
  graph: EvidenceGraphPrivate;
  role_policies: RolePrivatePolicy[];
  golden_answer: GoldenAnswerPrivate;
  evidence_unlock_rules: EvidenceUnlockRulePrivate[];
}
```

可玩案件必须满足：

- `roles` 恰有五个，Role ID 唯一；Private Policy 与 Public Role 一一对应。
- 恰有四个 `faithful` 和一个 `distorted`。
- Faithful Policy 的 `allowed_distortion_types` 为空。
- Distorted Policy 的允许集合非空，且 `answer_distortion_types` 是其非空子集。
- Truth、visible Claim、unlock rule、Role、Relation 的全部引用属于当前案件。
- 任一不变量失败即案件编译失败，不保存 ready Case，不返回部分 Public Case。

## 5. Message 与已批准发言

```ts
export type QuestionMode = "gentle" | "direct" | "pressure";
export type QuestionSource = "keyboard" | "asr";

export type RoleStance =
  | "answer"
  | "deny"
  | "challenge"
  | "clarify"
  | "evade";

export type RoleEmotion =
  | "calm"
  | "uneasy"
  | "defensive"
  | "agitated";

export interface RoleProsody {
  pace: "slow" | "normal" | "fast";
  intensity: 0 | 1 | 2 | 3;
}

export interface PlayerMessagePublic {
  message_id: MessageId;
  session_id: SessionId;
  speaker_type: "player";
  exact_text: string;
  target_role_id: RoleId;
  mode: QuestionMode;
  source: QuestionSource;
  created_at: IsoDateTime;
}

export interface RoleMessagePublic {
  message_id: MessageId;
  session_id: SessionId;
  speaker_type: "role";
  speaker_id: RoleId;
  exact_text: string;
  stance: RoleStance;
  emotion: RoleEmotion;
  target_role_id?: RoleId;
  rebuttal_to_message_id?: MessageId;
  prosody?: RoleProsody;
  audio_ref?: string;
  created_at: IsoDateTime;
}

export interface GmMessagePublic {
  message_id: MessageId;
  session_id: SessionId;
  speaker_type: "gm";
  exact_text: string;
  created_at: IsoDateTime;
}

export type MessagePublic =
  | PlayerMessagePublic
  | RoleMessagePublic
  | GmMessagePublic;
```

`RoleMessagePublic` 是 Approved Role Message。Public Message 不含 `support_claim_ids` 或完整 `claim_refs`；已经解锁的公开 Claim 关联只通过 Evidence Fragment 投影。

## 6. Evidence 与 BoardState

```ts
export type EvidenceType =
  | "quote"
  | "claim"
  | "source"
  | "timeline"
  | "contradiction";

export interface EvidenceFragmentPublic {
  evidence_id: EvidenceId;
  type: EvidenceType;
  title: string;
  body: string;
  source_message_id?: MessageId;
  public_claim_refs: ClaimId[];
  conflicts_with: EvidenceId[];
  audio_ref?: string;
  unlocked_at: IsoDateTime;
}

export interface EvidenceUnlockDecisionPrivate {
  rule_ids: string[];
  approved_evidence_ids: EvidenceId[];
  rejected_evidence_ids: EvidenceId[];
}

export type BoardLane =
  | "source"
  | "retelling"
  | "timeline"
  | "scope"
  | "causal"
  | "condition";

export interface BoardPlacement {
  evidence_id: EvidenceId;
  lane: BoardLane;
  x: number; // inclusive 0..1
  y: number; // inclusive 0..1
}

export interface BoardLink {
  link_id: string;
  from_evidence_id: EvidenceId;
  to_evidence_id: EvidenceId;
  relation:
    | "supports"
    | "contradicts"
    | "before"
    | "after"
    | "qualifies"
    | "claims_causal";
}

export interface BoardState {
  session_id: SessionId;
  revision: number;
  placements: BoardPlacement[];
  links: BoardLink[];
  updated_at: IsoDateTime;
}
```

模型候选不得包含 `evidence_unlock_ids`。服务端根据 Approved Role Message 的私有支持 Claim、案件 unlock rule 与 Session 状态计算 `EvidenceUnlockDecisionPrivate`。

Board 规则：revision 从 0 开始；每个 Evidence 最多一个 placement；Link 两端不同且都已解锁、已放置；`updateBoard` 是带 `expected_revision` 的全量替换。版本不一致返回 `BOARD_REVISION_CONFLICT`，不得自动合并、使用 last-write-wins 或丢弃客户端内容。

## 7. SessionView 与公开事件

```ts
export type SessionPhase =
  | "briefing"
  | "opening_statements"
  | "investigation"
  | "judging"
  | "revealed"
  | "failed";

export type AllowedSessionAction =
  | "start"
  | "ask"
  | "save_recording"
  | "present_recording"
  | "update_board"
  | "accuse";

export interface FinalAccusation {
  suspect_role_id: RoleId;
  distortion_types: DistortionType[];
  evidence_ids: EvidenceId[];
  note?: string;
}

export interface SessionView {
  session_id: SessionId;
  case_id: CaseId;
  phase: SessionPhase;
  allowed_actions: AllowedSessionAction[];
  active_role_turn_request_id?: RequestId;
  board: BoardState;
  submitted_accusation?: FinalAccusation;
  reveal_available: boolean;
  last_event_sequence: number;
  terminal_error?: PublicError;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}
```

- `allowed_actions` 由服务器计算，不由 XState 推断权限。
- `active_role_turn_request_id` 只在某 Ticket 为 `accepted` / `working` 时存在。
- 五条开场消息全部批准后才能从 `opening_statements` 进入 `investigation`。
- `judging` 不接受角色回合、Board 修改或第二次指控。
- `reveal_available` 当且仅当阶段为 `revealed`；`terminal_error` 当且仅当阶段为 `failed`。
- `failed` 不伪装成上一个正常阶段，也不自动重启。

```ts
export type GameEventPayload =
  | { type: "session_created" }
  | { type: "game_started" }
  | {
      type: "opening_statement_published";
      role_id: RoleId;
      message_id: MessageId;
    }
  | {
      type: "player_question_submitted";
      message_id: MessageId;
      request_id: RequestId;
      target_role_id: RoleId;
      mode: QuestionMode;
      source: QuestionSource;
    }
  | {
      type: "role_turn_working";
      request_id: RequestId;
      role_id: RoleId;
    }
  | {
      type: "role_message_published";
      request_id: RequestId;
      message_id: MessageId;
      role_id: RoleId;
    }
  | {
      type: "role_turn_failed";
      request_id: RequestId;
      role_id: RoleId;
      error: PublicError;
    }
  | { type: "evidence_unlocked"; evidence_ids: EvidenceId[] }
  | {
      type: "recording_saved";
      evidence_id: EvidenceId;
      message_id: MessageId;
    }
  | {
      type: "recording_presented";
      evidence_id: EvidenceId;
      target_role_id: RoleId;
      request_id: RequestId;
    }
  | { type: "board_updated"; revision: number }
  | { type: "accusation_submitted"; accusation_id: string }
  | { type: "reveal_published" }
  | { type: "session_failed"; error: PublicError };

export interface GameEventPublic {
  event_id: EventId;
  session_id: SessionId;
  sequence: number;
  occurred_at: IsoDateTime;
  payload: GameEventPayload;
}
```

公开事件按 Session 使用独立、无缺口、从 1 开始的 sequence。私有审计事件使用另一条序列，禁止通过公开编号缺口暴露候选、验证或重写次数。

## 8. Durable Role Ticket

### 8.1 公开 Interface

```ts
export interface AskRoleArgs {
  session_id: SessionId;
  role_id: RoleId;
  mode: QuestionMode;
  text: string;
  source: QuestionSource;
  client_action_id: ClientActionId;
}

export interface PresentRecordingArgs {
  session_id: SessionId;
  evidence_id: EvidenceId;
  target_role_id: RoleId;
  client_action_id: ClientActionId;
}

export interface RoleTurnReceipt {
  request_id: RequestId;
}

export type RoleTurnKind =
  | "ask"
  | "present_recording"
  | "opening_statement"
  | "role_confrontation";

interface PublicRoleTurnBase {
  request_id: RequestId;
  session_id: SessionId;
  role_id: RoleId;
  kind: RoleTurnKind;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export type PublicRoleTurn =
  | (PublicRoleTurnBase & { status: "accepted" })
  | (PublicRoleTurnBase & { status: "working" })
  | (PublicRoleTurnBase & {
      status: "succeeded";
      message: RoleMessagePublic;
      newly_unlocked_evidence_ids: EvidenceId[];
    })
  | (PublicRoleTurnBase & {
      status: "failed";
      error: PublicError;
    });

roleTurns.ask(args: AskRoleArgs): Promise<RoleTurnReceipt>;

roleTurns.presentRecording(
  args: PresentRecordingArgs,
): Promise<RoleTurnReceipt>;

roleTurns.observe(
  args: { request_id: RequestId },
): Promise<PublicRoleTurn | null>;
```

`mode` 与 `source` 必填且无默认。`observe` 的 `null` 同时表示不存在或不可访问，不提供资源存在性侧信道。只有 `succeeded` 分支具有 Message；原始 token 不属于公开 Interface。

### 8.2 私有 Turn Intent

```ts
export type TurnIntentPrivate =
  | {
      kind: "player_question";
      question_message_id: MessageId;
      target_role_id: RoleId;
      mode: QuestionMode;
      source: QuestionSource;
    }
  | {
      kind: "recording_presented";
      evidence_id: EvidenceId;
      target_role_id: RoleId;
    }
  | {
      kind: "opening_statement";
      role_id: RoleId;
      trigger_event_id: EventId;
    }
  | {
      kind: "role_confrontation";
      role_id: RoleId;
      target_role_id: RoleId;
      rebuttal_to_message_id: MessageId;
      trigger_event_id: EventId;
    };
```

Browser 没有通用 execute Interface。`opening_statement` 与 `role_confrontation` 只能由服务端事件创建。

同一 Session 的全部角色生成共享一个排他锁：没有活动 Ticket 时原子创建 Ticket、相关玩家消息/事件和锁；已有 `accepted` 或 `working` Ticket 时立即返回 `ROLE_TURN_BUSY`。不排队、不延迟执行。Ticket 终止后释放锁；lease 异常显式失败且不自动再次调用模型。

## 9. 候选、Validator 与批准信封

```ts
export interface RoleCandidatePayloadPrivate {
  speech: string;
  support_claim_ids: ClaimId[];
  stance: RoleStance;
  emotion: RoleEmotion;
  target_role_id?: RoleId;
  rebuttal_to_message_id?: MessageId;
  prosody?: RoleProsody;
}

export interface CandidateTextSpanPrivate {
  start: number;
  end: number;
  text: string;
}

export interface ValidationResultPrivate {
  status: "entailed" | "distorted" | "invalid";
  detected_distortion_types: DistortionType[];
  unsupported_spans: CandidateTextSpanPrivate[];
  referenced_claim_ids: ClaimId[];
  confidence: number; // inclusive 0..1
}

export interface ValidationAttemptPrivate {
  validation_id: string;
  request_id: RequestId;
  attempt_index: 0 | 1 | 2;
  candidate: RoleCandidatePayloadPrivate;
  result: ValidationResultPrivate;
  created_at: IsoDateTime;
}

export interface ApprovedSpeechEnvelopePrivate {
  request_id: RequestId;
  message_id: MessageId;
  role_id: RoleId;
  exact_text: string;
  exact_text_sha256: Sha256Digest;
  support_claim_ids: ClaimId[];
  validation_id: string;
  voice_id: string;
  prosody?: RoleProsody;
}
```

模型只产生 `RoleCandidatePayloadPrivate`，不能产生可信 ID、Validation status、retry 标志或 Evidence unlock。原 v2.0 的 `retry_required` 被删除：是否重写由服务器固定规则决定。

### 9.1 批准规则

Faithful Role：支持 Claim 全部存在且可见；Validator 必须返回 `entailed`；不得出现新实体、数字、时间、事件、来源或无支持关系。

Distorted Role：全部材料仍来自可见 Claim；Validator 必须返回 `distorted`；检测到的类型非空且全部在允许集合中；仍不得引入来源外事实。

### 9.2 唯一重写规则

1. 初始候选的 `attempt_index=0`。
2. Faithful 候选得到语义 `distorted` 或 `invalid` 时，可以基于私有验证反馈生成 `attempt_index=1`。
3. 第一次重写仍是语义不通过时，可以生成最后一个 `attempt_index=2`。
4. 第二次重写仍不通过，私有记录 `VALIDATION_EXHAUSTED`，Public Ticket 返回 `ROLE_TURN_FAILED`。
5. Model/Validator 请求失败或协议/schema 错误不是语义重写机会，立即失败。
6. Distorted Role 验证失败不重写。
7. AI SDK/provider 自动重试为 0。
8. Failed Ticket 不发布 Role Message、不解锁 Evidence、不触发 TTS。

## 10. Final Accusation 与 Reveal

```ts
export interface RevealResult {
  correct_role_id: RoleId;
  distortion_types: DistortionType[];
  player_correct: boolean;
  truth_chain: Array<{
    order: number;
    claim_id: ClaimId;
    label: string;
  }>;
  altered_links: Array<{
    original: string;
    distorted: string;
    distortion_type: DistortionType;
  }>;
  evidence_score: number; // inclusive integer 0..100
  questioning_score: number; // inclusive integer 0..100
  explanation: string;
  reality_mapping: string[];
}
```

Final Accusation 必须引用当前案件有效 Role，包含至少一个且无重复的 Distortion Type，以及至少一个且无重复、属于当前 Session 且已经解锁的 Evidence ID。`player_correct` 当且仅当 Role 相同且 Distortion Type 集合与 Golden Answer 完全相同；Evidence 和 Questioning 分数不反向改变该布尔值。

RevealResult 必须完整持久化后才公开。`truth_chain.order` 从 1 开始、连续且唯一；每个 Claim 属于当前案件。`getReveal` 在非 revealed 阶段返回 `null`，不得返回部分内容或失败原因。

## 11. 逻辑 Interface 目录

所有参数和返回值都必须通过运行时 schema。

| Interface | 种类 | 输入 | 成功输出 / 语义 |
|---|---|---|---|
| `cases.createFromSource` | action | `source_url, source_text, theme?, client_action_id` | `{ case_id, status: "ready" }`；完整编译成功后才返回 |
| `cases.getPublic` | query | `case_id` | `CasePublic | null` |
| `cases.getSource` | query | `case_id` | `SourceDocumentPublic | null` |
| `sessions.create` | mutation | `case_id, client_action_id` | `SessionView`，初始 phase=`briefing` |
| `sessions.getPublic` | query | `session_id` | `SessionView | null` |
| `messages.listPublic` | query | `session_id, after?` | `MessagePublic[]`，稳定时间/ID 顺序 |
| `events.listPublic` | query | `session_id, after_sequence` | `GameEventPublic[]`，sequence 递增 |
| `game.start` | mutation | `session_id, client_action_id` | `{ session_id, phase: "opening_statements" }`，调度五个服务端回合 |
| `roleTurns.ask` | action | `AskRoleArgs` | `RoleTurnReceipt` |
| `roleTurns.presentRecording` | action | `PresentRecordingArgs` | `RoleTurnReceipt` |
| `roleTurns.observe` | query | `request_id` | `PublicRoleTurn | null` |
| `evidence.getAll` | query | `session_id` | `EvidenceFragmentPublic[]` |
| `evidence.saveRecording` | mutation | `session_id, message_id, client_action_id` | `EvidenceFragmentPublic`，type=`quote` |
| `evidence.updateBoard` | mutation | `session_id, placements, links, expected_revision, client_action_id` | 新 `BoardState` |
| `game.accuse` | action | `session_id, accusation, client_action_id` | `{ session_id, phase: "revealed" }`，完整 Reveal 已保存 |
| `game.getReveal` | query | `session_id` | `RevealResult | null` |

写 Interface 的 `client_action_id` 不能缺省。`cases.createFromUrl` 与 `game.submitQuestion` 不再存在；调用方必须使用 `cases.createFromSource` 与 `roleTurns.ask`。

## 12. 幂等

幂等键：

- `cases.createFromSource`：`(operation_name, client_action_id)`。
- `sessions.create`：`(operation_name, case_id, client_action_id)`。
- Session 范围写操作：`(operation_name, session_id, client_action_id)`。

处理顺序：输入 schema → 操作规定的内容规范化 → RFC 8785 canonical JSON → SHA-256。`client_action_id` 不进入载荷哈希。

- 同键同哈希：在阶段校验前返回首次持久化的同一 receipt / request / result，不重复模型调用、事件或数据写入。
- 同键不同哈希：返回 `IDEMPOTENCY_CONFLICT`。
- 失败 Ticket 的同 ID 重放仍返回同一失败；人工再次发起必须使用新 ID。
- 缺失、空白或非 UUID action ID 直接返回 `INVALID_ARGUMENT`；服务端不得补一个默认 ID。

## 13. 错误契约

### 13.1 Public Error

```ts
export type PublicErrorCode =
  | "INVALID_ARGUMENT"
  | "SOURCE_INVALID"
  | "CASE_NOT_FOUND"
  | "CASE_NOT_READY"
  | "CASE_COMPILE_FAILED"
  | "SESSION_NOT_FOUND"
  | "ROLE_NOT_FOUND"
  | "SESSION_PHASE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "ROLE_TURN_BUSY"
  | "EVIDENCE_UNAVAILABLE"
  | "BOARD_REVISION_CONFLICT"
  | "ROLE_TURN_FAILED"
  | "REVEAL_UNAVAILABLE"
  | "REVEAL_FAILED"
  | "VOICE_AUDIO_TOO_LONG"
  | "VOICE_NO_SPEECH"
  | "VOICE_ASR_FAILED"
  | "VOICE_TTS_FAILED"
  | "SERVICE_NOT_CONFIGURED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_INCIDENT";

export interface PublicError {
  code: PublicErrorCode;
  message: string;
  incident_id?: string;
}
```

Public message 只描述玩家可采取的明确动作，不包含 provider 响应、Model ID、Prompt、候选、Claim ID、Validation status、Fidelity 或私有 stack。

### 13.2 Private Failure

至少实现以下私有码：

```ts
export type PrivateFailureCode =
  | "INPUT_SCHEMA_INVALID"
  | "SOURCE_URL_INVALID"
  | "SOURCE_TEXT_EMPTY"
  | "SOURCE_PARSE_FAILED"
  | "SOURCE_SPAN_INVALID"
  | "MODEL_CONFIG_MISSING"
  | "MODEL_REQUEST_FAILED"
  | "MODEL_PROTOCOL_INVALID"
  | "VALIDATOR_REQUEST_FAILED"
  | "VALIDATOR_PROTOCOL_INVALID"
  | "VALIDATION_EXHAUSTED"
  | "DISTORTION_POLICY_VIOLATION"
  | "NEW_FACT_INTRODUCED"
  | "PRIVATE_PROJECTION_VIOLATION"
  | "TURN_LEASE_EXPIRED"
  | "REVEAL_JUDGE_FAILED"
  | "ASR_PROVIDER_FAILED"
  | "TTS_PROVIDER_FAILED"
  | "INTERNAL_INVARIANT_VIOLATION";
```

隐私映射：`VALIDATION_EXHAUSTED`、`DISTORTION_POLICY_VIOLATION`、`NEW_FACT_INTRODUCED` 与 Validator 失败一律公开为 `ROLE_TURN_FAILED`；否则错误码本身会泄露 Fidelity。具体原因通过 `incident_id` 对应私有审计。

错误对象不得包含 `retryable` 或任何会触发自动行为的标志。恢复动作固定：Board 冲突要求刷新后由用户重提；Busy 展示当前 Ticket；ASR 失败保留键盘输入且不自动提交；TTS 失败保留 Approved Role Message；其他模型/协议/验证失败显式终止。

## 14. Voice 契约

Browser 的 `Blob` 只属于 HTTP transport，不进入 Provider Interface。

```ts
export type SupportedAudioMimeType =
  | "audio/webm"
  | "audio/ogg"
  | "audio/wav"
  | "audio/mpeg";

export interface AsrInputPrivate {
  audio: Uint8Array;
  mime_type: SupportedAudioMimeType;
  language: "zh";
}

export interface TranscriptResultPublic {
  text: string;
  is_final: true;
  confidence?: number; // inclusive 0..1
  language: "zh";
  duration_ms: number;
}

export interface AsrProvider {
  transcribe(input: AsrInputPrivate): Promise<TranscriptResultPublic>;
}

export interface TtsInputPrivate {
  approved_speech: ApprovedSpeechEnvelopePrivate;
}

export interface SynthesizedAudioPrivate {
  bytes: Uint8Array;
  mime_type: "audio/wav";
  content_sha256: Sha256Digest;
  duration_ms: number;
}

export interface TtsProvider {
  synthesize(input: TtsInputPrivate): Promise<SynthesizedAudioPrivate>;
}
```

本地同源 transport：

- `POST /api/voice/transcriptions`：`multipart/form-data`，字段 `audio` 与 `client_action_id`；成功返回 `TranscriptResultPublic`，失败返回 Public Error。
- `POST /api/voice/messages/{message_id}/speech`：JSON `{ session_id, client_action_id }`；成功返回 `audio/wav`，失败返回 Public Error。

ASR v1 只返回最终中文文本，不流式返回中间结果。超过 30 秒直接返回 `VOICE_AUDIO_TOO_LONG`，不得截断；无语音返回 `VOICE_NO_SPEECH`，不得以空文本成功。Transcript 只回填输入框，玩家确认后调用 `roleTurns.ask` 并传 `source: "asr"`。

TTS Route 只接受 Message ID，不接受客户端 `text`、`voice_id` 或 prosody。服务器必须读取对应 Approved Speech Envelope，验证文本哈希，使用该 Role 的 voice 与 pace；合成文本逐字等于 `exact_text`。`intensity` 仅为 UI/Rive 元数据，不进入 Kokoro 声学承诺。

## 15. 公开与私有审计

每次建案、模型调用、角色回合和 Reveal 必须关联可用的 `case_id`、`session_id`、`request_id`、`client_action_id`、任务名和 attempt index。私有事件至少覆盖：

- `model_call_started` / `completed` / `failed`
- `candidate_generated`
- `validation_completed`
- `rewrite_started`
- `distortion_policy_checked`
- `public_projection_checked`
- `evidence_unlock_evaluated`
- `reveal_judged`
- `turn_lease_expired`

审计可以保存准确错误、候选和 unsupported span，但不能保存 API Key / Access Secret。常规结构化日志只记录 ID、hash、耗时、计数与错误码，不记录完整 Source、Prompt 或私有文本。

