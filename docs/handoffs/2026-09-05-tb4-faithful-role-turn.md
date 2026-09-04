# TB4：Faithful 成功回合（角色回合引擎）

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **roleTurns.ask**（薄 action）：auth → `AskRoleArgs` 运行时校验（UUID、mode/source 枚举、非空 text）→ 全部权威判定在 `initializeAskTurn` 单事务内：幂等命中先于阶段校验（键 `(roleTurns.ask, session_id, client_action_id)`，载荷哈希含 session/role/mode/text/source）→ Owner 隔离（`SESSION_NOT_FOUND`）→ 阶段门控（仅 investigation，`SESSION_PHASE_CONFLICT`）→ Role 存在性（`ROLE_NOT_FOUND`）→ 排他锁（accepted/working 存在即 `ROLE_TURN_BUSY`，不排队）→ 原子写玩家消息 + `player_question_submitted` 事件 + accepted Ticket + 幂等记录 → 调度 worker，返回 receipt。
- **roleTurns.observe**（query）：按 request_id 重建 `PublicRoleTurn`（accepted/working/succeeded{message,newly_unlocked_evidence_ids}/failed{error}）；他人与不存在返回 null（防枚举）。
- **worker**（internalAction）：working + `role_turn_working` 事件 → 读取 Role Policy 与可见 Claim（私有）→ 生成（task=role，`role_candidate-v1@1`）→ 服务器前置检查（support_claim_ids ⊆ 可见集合）→ Validator（task=validator，`role_validation-v1@1`）→ 忠实门控：entailed 且无 unsupported_spans；失败携带私有校验反馈语义重写，最多 3 次候选 → 耗尽记 `VALIDATION_EXHAUSTED`（公开仅 `ROLE_TURN_FAILED`）。
- **原子发布 finalize**：角色消息 + `role_message_published` 事件 + 服务器计算的 Evidence 解锁决策（规则 required ⊆ support 且 role 在 allowed_role_ids、去重）+ `evidence_unlocked` 事件 + Ticket succeeded（同一 mutation）。失败 finalize 映射 13.3 角色回合列（MODEL_*/VALIDATOR_*/VALIDATION_EXHAUSTED→ROLE_TURN_FAILED；MODEL_CONFIG_MISSING→SERVICE_NOT_CONFIGURED）+ `role_turn_failed` 事件。
- **版本化 schema**（`server/model/schemas/role-turn.ts`）：`role_candidate-v1@1`、`role_validation-v1@1` + 服务端 prompt 构造器（枚举显式列出——修正 DeepSeek 输出 `stance:"neutral"`/漏 `referenced_claim_ids` 两类 schema 拒绝）。
- **测试工具**：`admin:forcePhase`（生产唯一路径仍是 TB7 game.start）、`admin:seedActiveTicket`（锁占用）。
- **真实模型验证（DeepSeek）**：问 role-observer Meta 数据 → entailed 发布、`ev-meta-quote` 按 ul-001 解锁、公开消息不含 support_claim_ids/visible_claim_ids（投影隔离）。

## 明确未完成

- 私有 Validation Audit 持久化（SPEC §11）暂缺：重写次数/unsupported spans 只进公开终态，不入私有审计表；TB5/TB10 补。
- TB6 Distorted 门控代码已参数化（faithful 分支独立），但 distort 专属测试在 TB6。
- TB7 game.start 未做：进入 investigation 的生产路径尚缺（测试用 admin:forcePhase）。

## 修改文件

- `convex/schema.ts`（role_turn_tickets、session_evidence_unlocked）
- `convex/roleTurns.ts`（新，最深模块）、`convex/admin.ts`（forcePhase/seedActiveTicket）
- `server/model/schemas/role-turn.ts`（新）
- `tests/tb4-role-turns.test.ts`、`tests/tb4-model.test.ts`、`tests/helpers/convex-local.ts`（waitForTurnTerminal）
- 本记录、索引、根计划。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — TB4 → COMPLETE。无契约变更。

## 定向验证

- `bun test tests/tb4-role-turns.test.ts` — 4 pass / 0 fail：阶段冲突、ROLE_NOT_FOUND、幂等重放与 IDEMPOTENCY_CONFLICT、排他锁 BUSY、AUTH_REQUIRED、SERVICE_NOT_CONFIGURED 终态、observe 隔离。
- `RUN_MODEL_INTEGRATION=1 bun test tests/tb4-model.test.ts` — **通过**（约 15s，一次真实生成+校验）。
- `bun run typecheck` — 通过；`bun test` 全套 69 pass / 0 fail / 1 skip。

## 已知风险、阻塞与下一步

- DeepSeek JSON 模式（responseFormat 未声明）依赖 prompt 注入；枚举字段曾在提示词未显式时被模型写出界值——已修正提示词并在引擎侧由 schema 硬拒（重写路径消化）。若失败率上升，再在 adapter 层启用 `supportsStructuredOutputs`（json_schema）。
- bun test 单测默认 5s 超时：凡等待 worker 的测试显式传 `{timeout}`。
- 下一步：TB5（重写与失败矩阵）→ TB6（Distorted）→ TB7（game.start 五条开场）。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 8、9 节，`ENGINEERING_SPEC` 5.2/7
3. `convex/roleTurns.ts`
4. `tests/tb4-model.test.ts`
