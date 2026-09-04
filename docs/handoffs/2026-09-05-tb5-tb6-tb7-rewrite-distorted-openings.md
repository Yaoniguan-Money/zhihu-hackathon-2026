# TB5 + TB6 + TB7：重写矩阵、Distorted 门控与五条开场

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **回合引擎抽取（TB5/TB6 前置）**：`server/turn-engine/run-turn.ts` —— 生成-校验-重写循环成为接 `ModelGateway` Seam 的纯模块（无 Convex 依赖）：忠实=初始+最多两次语义重写（总候选 ≤3）；Distorted=单次候选、无重写兜底；协议/校验器失败立即终止不消耗重写（SPEC §7.3）；支持 Claim 越出可见集合一律拦截。`convex/roleTurns.ts` worker 改为调用该模块。
- **TB5 覆盖（Scripted Adapter，确定性）**：首试通过（1 候选）/一次重写通过（2）/两次重写通过（3）/三次全拒 → `VALIDATION_EXHAUSTED`；生成器协议失败 → `MODEL_REQUEST_FAILED` 立即终止；校验器失败 → `VALIDATOR_REQUEST_FAILED` 立即终止。
- **TB6 覆盖（Scripted）**：distorted+类型⊆允许集 → 通过；entailed（未构成篡改）→ 立即 `VALIDATION_EXHAUSTED`；未授权类型 → `DISTORTION_POLICY_VIOLATION`；支持 Claim 越界 → 终止（不引入新事实）。公开错误一律 `ROLE_TURN_FAILED`，不泄露 Fidelity 细节（13.3）。
- **TB7 game.start**（`convex/game.ts`）：briefing → opening_statements + `game_started` 事件；按 CasePublic.roles 固定顺序串行五条开场——worker 成功后才由 `openingTicketFor` 创建下一条（禁止预建队列）；开场复用同一生成-校验引擎（opening 提示词）；全部批准 → `enterInvestigation`（allowed=ask/update_board/accuse）；任一失败 → Ticket failed + `failSessionInternal`（phase=failed、terminal_error、`session_failed` 事件，历史保留）。幂等键 `(game.start, session_id, client_action_id)` 命中先于阶段校验，失败后同 ID 重放返回首次结果。
- **真实模型验证（DeepSeek，opt-in）**：五条开场 218s 全部通过 Validator（含 distorted 角色 skeptor 开场被判 distorted 并按门控批准）→ investigation；5 条角色消息、5 个不同 speaker；公开投影无 support_claim_ids/fidelity 字段。

## 明确未完成

- 开场是否解锁 Evidence：当前实现允许（开场是 Approved Role Message，规则照常计算）—— Contract 未禁止；如产品上要"开场不解锁"，属规则调整待 A/B 决定。
- 私有 Validation Audit 表仍未建（TB4 handoff 已记）。
- TB2b、TB8、TB9、TB10 未开始。

## 修改文件

- 新增 `server/turn-engine/run-turn.ts`、`convex/game.ts`、`tests/tb5-tb6-engine.test.ts`、`tests/tb7-game-start.test.ts`、`tests/tb7-model.test.ts`
- `convex/roleTurns.ts`（worker 改用引擎模块）
- 本记录、索引、根计划。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — TB5/TB6/TB7 → COMPLETE。无契约变更。

## 定向验证

- `bun test tests/tb5-tb6-engine.test.ts` — 11 pass（重写矩阵 + distorted 门控，全确定性）。
- `bun test tests/tb7-game-start.test.ts` — 3 pass（幂等/阶段/失败终止/历史保留）。
- `RUN_MODEL_INTEGRATION=1 bun test tests/tb7-model.test.ts` — **通过**（五条开场 218s → investigation）。
- `bun test` 全套 — 87 pass / 0 fail / 3 skip；`bun run typecheck` 通过。

## 已知风险、阻塞与下一步

- distorted 开场依赖模型"确实改写"：真实测试一次通过；若未来模型偶发 entailed，将按契约立即终止本局（无重写兜底）——这是设计行为，不是缺陷。
- 下一步：TB8（Evidence 与 Board：evidence.getAll/updateBoard、Catalog 投影、CAS）→ TB9（accuse/Reveal + rubric/questioning 评分）→ TB10；TB2b（用户案件完整编译器）穿插。

## 最小接手阅读顺序

1. 本记录
2. `server/turn-engine/run-turn.ts`、`convex/game.ts`
3. `tests/tb5-tb6-engine.test.ts`
