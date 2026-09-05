# P1-1：Recording Evidence 与角色对质

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **契约先导**：CONTRACTS.md 新增 6.1「Recording Evidence（P1-1）」小节与 8.2 对质回合具体规则；7.1 阶段矩阵的 `investigation` 行改为按资源前置条件动态开放 `save_recording` / `present_recording`；10.1 明确录音参与 `evidence_score` 命中判定。公开 schema 形状零变化（`presentRecordingArgsSchema`、`recording_saved` / `recording_presented` 事件、`TurnIntentPrivate.recording_presented` 均为 D0 冻结的既有形状）。按用户 2026-09-05 夜间授权，B 侧评审由用户代行、视为通过。
- **`evidence.saveRecording`（mutation）**：只能引用当前 Session 已发布 Approved Role Message（玩家/GM/跨 Session/不存在消息一律 `EVIDENCE_UNAVAILABLE`）；`type=quote`、`body` 逐字复制 `exact_text`、`title` 由服务器从角色公开名生成、`source_message_id` 指向来源消息；`public_claim_refs` = 来源消息私有支持 Claim ∩ 已公开可见 Claim（不暴露 `support_claim_ids`、不借录音引入未解锁 Claim）；创建即解锁（`session_evidence_unlocked`，`via_kind=recording_saved`）；幂等键 `(operation, session_id, client_action_id)`；同消息重复保存返回首次创建的同一录音（内容级确定性）。
- **`roleTurns.presentRecording`（action）**：与 ask 相同的薄 action + 单事务初始化；只接受当前 Session 已解锁录音（`EVIDENCE_UNAVAILABLE`）；目标 Role 校验（`ROLE_NOT_FOUND`）；与 ask / 开场共用排他锁与 lease（`ROLE_TURN_BUSY`）；公开事件 `recording_presented`；幂等重放返回同一 receipt，同 ID 不同载荷 `IDEMPOTENCY_CONFLICT`。
- **对质 worker**：复用 `runGenerationAttempts`（生成 → Validator → 按 Fidelity 重写规则）；生成 prompt 以「录音对质块」替代玩家问题块；服务器硬约束 `requireSupportClaims`——对质候选 `support_claim_ids` 非空且全部可见，违反按 `NEW_FACT_INTRODUCED` 立即终止（→ `ROLE_TURN_FAILED`），不进入语义重写；批准消息由服务器设置 `rebuttal_to_message_id` 指向录音来源 Message（模型 ID 字段不具权威性）。
- **联动**：`sessions.getPublic` 的 `allowed_actions` 在 investigation 中按资源前置条件开放 `save_recording`（已有已发布角色消息）与 `present_recording`（已有已解锁录音）；`evidence.getAll` 合并 Catalog 条目与录音投影；`evidence.updateBoard` / `game.accuse` 直接兼容录音（自动已解锁）；`questioning_score` 不受录音影响（`kind!=="ask"` 与 `via_kind!=="ask"` 均不计入）；录音按 `type` 与推导后的 `public_claim_refs` 参与 `evidence_score` 加权 criteria 命中。
- Ticket 私有记录新增 `confront_message_id`；`validation_json` 增补 `support_claim_ids`（服务器私有数据，供录音引用推导；早期行回退 `referenced_claim_ids`）。

## 明确未完成

- 无（本环节范围内）。产品 UI（录音保存/投递按钮、对质消息展示）属开发人员 B，不在本环节。

## 修改文件

- `convex/schema.ts` — 新增 `recordings` 表（Session 级动态证据）与 Ticket `confront_message_id` 字段。
- `convex/evidence.ts` — `saveRecording` / `saveRecordingCore` / `recordingSourceSupportInternal`；`getAll` 合并录音投影。
- `convex/roleTurns.ts` — `presentRecording` / `initializePresentRecordingTurn`；worker 对质上下文与 `rebuttal_to_message_id`；`validation_json` 增补支持 Claim。
- `convex/sessions.ts` — `allowed_actions` 资源前置条件扩展。
- `convex/reveal.ts` — `computeScoresInternal` 合并录音参与 evidence criteria 命中。
- `convex/game.ts` — 开场 worker 的 `validation_json` 增补 `support_claim_ids`。
- `convex/admin.ts` — 测试种子 `seedRoleMessage`；`seedActiveTicket` 支持 `kind` 参数（对质锁测试）。
- `server/turn-engine/run-turn.ts` — `requireSupportClaims` 硬约束（`NEW_FACT_INTRODUCED` 终止）与 `confrontation` 上下文。
- `server/model/schemas/role-turn.ts` — 生成 prompt 支持录音对质块（版本号不变：prompt 变更随 role_candidate-v1@1 既有版本，未改 schema 形状）。
- `tests/p11-engine.test.ts`、`tests/p11-recording.test.ts`、`tests/p11-model.test.ts` — 新增定向测试（Scripted 引擎 / 本地后端集成 / 真实模型 opt-in）。

## 权威文档更新

- `docs/developer-a/CONTRACTS.md` — 新增 6.1 节；8.2 对质具体规则；7.1 矩阵 investigation 行；10.1 录音计分说明。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — §2 Gate 表 GC0/REL0 状态与 §5 对齐（修正滞后行）；§5 P1-1 行 → COMPLETE。

## 定向验证

- `bun run typecheck` — 通过。
- `bun test tests/p11-engine.test.ts` — 8 pass / 0 fail（硬约束、不调 Validator、忠实重写、篡改单次、prompt 形态）。
- `bun test tests/p11-recording.test.ts` — 7 pass / 0 fail（鉴权、Owner 隔离、阶段、来源消息校验、投影泄漏扫描、事件、allowed_actions、幂等/去重、锁双向、无模型终态 SERVICE_NOT_CONFIGURED）。
- `bun test`（全套件）— 127 pass / 0 fail / 6 skip（模型测试显式 opt-in），TB1–TB10 零回归。
- `RUN_MODEL_INTEGRATION=1 bun test tests/p11-model.test.ts` — **1 pass / 0 fail（85s）**：真实模型完整闭环——忠实 ask（解锁 ev-meta-quote）→ saveRecording（`public_claim_refs` 推导出 `cl-004`）→ presentRecording 对质（role-analyst 回应带 `rebuttal_to_message_id` 指向来源消息、事件 `recording_presented`）→ accuse（录音作为唯一附带证据）→ revealed（`player_correct=true`、`evidence_score ≥25`（录音命中 crit-layoff-scale）、`questioning_score ≥18`）。

## 已知风险、阻塞与下一步

- 录音 `public_claim_refs` 采用「支持 Claim ∩ 已公开可见 Claim」的隐私安全推导；若玩家在全部相关证据解锁前保存录音，引用可能为空——这是契约规定行为（CONTRACTS 6.1），不是缺陷。
- `evidence.saveRecording` 拒绝路径（如 `IDEMPOTENCY_CONFLICT`）不写私有审计：契约接口类型为 mutation，事务回滚使 action 层补偿审计不可用；幂等冲突聚合已由 ask/updateBoard 等覆盖。
- 对质回应的验证与批准完全复用按 Fidelity 的既有规则：篡改角色被对质时其回应必须构成获准篡改（与 TB6 语义一致）。
- 下一步：① P1-3 第二案件（等用户第二篇真实 URL + 全文，G1）；② P1-2 本地 Voice（含用户音色 A/B 试听）；③ B 端按 `allowed_actions` 接入录音/对质交互。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 6.1 / 7.1 / 8.2 / 10.1
3. `convex/evidence.ts`（saveRecordingCore）与 `convex/roleTurns.ts`（initializePresentRecordingTurn / roleTurnWorker）
4. `tests/p11-recording.test.ts`（行为验收清单）
