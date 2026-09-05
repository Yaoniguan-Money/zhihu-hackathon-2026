# TB10：P0 全链证明（审计、lease、并发、泄漏扫描、发布 Gate smoke）

状态：`complete`（P0 无模型全链 + 发布 Gate 完整套件 + 全部真实供应商 smoke 通过）  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **私有审计事件**（CONTRACTS 15 / SPEC 11）：新增 `private_audit` 表（仅 ID、任务名、attempt、耗时、错误码；无 Prompt/候选/正文/Secret）与 `convex/audit.ts`（recordInternal + metricsInternal 按事件聚合）。埋点覆盖：
  - 编译（cases worker）：`model_call_started/completed/failed`（claim、case 两任务分开计时）、`case_compile_succeeded/failed`（detail=schema 版本/私有失败码）。
  - 角色回合（run-turn emit 钩子 → roleTurns/game worker）：`model_call_started/completed/failed`（role/validator 各自 attempt+耗时）、`candidate_generated`、`validation_completed`（detail=entailed/distorted/invalid）、`rewrite_started`；`evidence_unlock_evaluated`、`role_turn_succeeded/failed`。
  - Reveal：`reveal_judged`（correct/incorrect）；gate 拒绝在 accuse action 层落 `reveal_gate_rejected`。
  - 拒绝类审计落点说明：mutation 内 throw 会回滚同事务写入，因此 busy/冲突类审计统一在 **action 层捕获后另起事务写入**（`evidence.updateBoard` 改为 action 包装 + `updateBoardCore` internal mutation，与 `roleTurns.ask` 同构）。
- **Ticket lease**（CONTRACTS 8.2 / 13.2）：`role_turn_tickets.lease_expires_at_ms`；accept 时设置、markWorking 时刷新（10 分钟）；`initializeAskTurn` 在检查排他锁前显式清扫过期 Ticket——公开 `ROLE_TURN_FAILED`、审计 `turn_lease_expired`，**不自动重新调用模型**。缺省 lease（旧数据/seed）视为未过期。
- **SPEC 11 聚合指标**：`audit:metricsInternal` 输出事件计数（含 asr/tts P0 恒 0 占位）。实测一晚累计：role_turn_busy 5、board_revision_conflict 4、board_evidence_rejected 4、idempotency_conflict 5、turn_lease_expired 8、role_turn_failed 14、role_turn_succeeded 13、model_call_started 45 / completed 44 / failed 1、candidate_generated 17、validation_completed 17、rewrite_started 3、evidence_unlock_evaluated 12、reveal_judged、reveal_gate_rejected 2、case_compile_succeeded 5 / failed 4。
- **TB10 全链测试**（`tests/tb10-full-chain.test.ts`，6 项，无模型确定性）：并发 CAS 恰好一成一冲突；排他锁 BUSY 且不落玩家消息；lease 过期显式失败并释放锁（worker 无模型时确定性 SERVICE_NOT_CONFIGURED 终态）；幂等 sweep（create/updateBoard 同键同哈希、异载荷 IDEMPOTENCY_CONFLICT）；公开表面泄漏扫描（11 个私有标记 × 6 个公开接口）；刷新恢复（事件 sequence 从 1 连续、last_event_sequence 一致、SessionView board/allowed_actions 一致）；审计聚合计数断言。
- **发布 Gate 完整套件 + 真实供应商 smoke**（DeepSeek，今晚累计）：TB1 真实编译（199.7s ✓，含 TB2b 双调用管线）、TB4 真实回合（3.5s/回合 ✓）、TB2b 完整编译器端到端（251.6s ✓）、TB7 五条开场（225.8s ✓）、**TB9 完整 golden 闭环（297.6s ✓，Gate 末次重跑通过：开场→审讯→解锁→正确指控→Reveal 全部断言通过）**。`bun test` 全套 112 pass / 0 fail / 5 skip；`bun run typecheck` 通过。
- **运维工具**：`admin:debugModelProbe`（action 运行时内最小结构化模型调用，返回 provider 层错误名/cause，无 Secret）；`admin:seedActiveTicket` 支持注入已过期 lease。

## 明确未完成

- 无（本环节范围内）。
- ASR/TTS 失败计数为 P1 占位（P0 无 Voice）。

## 修改文件

- `convex/schema.ts` — private_audit 表 + ticket lease 字段。
- `convex/audit.ts` — 新增：审计记录与指标聚合。
- `convex/evidence.ts` — updateBoard 改 action 包装 + updateBoardCore；拒绝类审计。
- `convex/roleTurns.ts` — lease 清扫/设置/刷新、busy/幂等审计（action 层）、worker emit 接线、finalize 审计。
- `convex/game.ts` — 开场 Ticket lease、开场 emit 接线、accuse gate 拒绝审计。
- `convex/reveal.ts` — reveal_judged 审计。
- `convex/cases.ts` — 编译期模型调用与成败审计。
- `convex/admin.ts` — seedActiveTicket lease 参数、debugModelProbe。
- `server/turn-engine/run-turn.ts` — 可选 TurnAuditEmitter（向后兼容）。
- `tests/tb10-full-chain.test.ts` — 新增；`tests/tb8-evidence.test.ts`、`tests/tb1-compile-model.test.ts` — updateBoard 改 action 调用、编译等待时限随双调用管线放大。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — TB10 → COMPLETE。无契约变更（审计与 lease 均为 CONTRACTS 15 / 8.2 / SPEC 11 既有要求的实现）。

## 定向验证

- `bun test tests/tb10-full-chain.test.ts` — 6 pass / 0 fail。
- `bun test` 全套 — 112 pass / 0 fail / 5 skip；`bun run typecheck` 通过。
- 真实供应商 smoke（RUN_MODEL_INTEGRATION=1）全部通过：tb1-compile-model ✓、tb4-model ✓、tb2-compile-model ✓、tb7-model ✓、tb9-model ✓（297.6s）。Gate 期间曾出现 3 次供应商级瞬时失败（MODEL_REQUEST_FAILED ~2s 快速拒绝、VALIDATOR_REQUEST_FAILED 35s），冷却后重跑即通过，判定为外部供应商间歇故障；审计表保留了全部失败 detail_code 证据。

## 已知风险、阻塞与下一步

- DeepSeek v4 对连续模型调用存在间歇性 ~2s 快速拒绝（限流或容量）；失败按契约显式终止（无重试兜底），全链路测试需在供应商健康窗口执行。
- 编译/开场链对 provider 抖动敏感：一次调用失败即整个建案/对局显式失败。这是契约要求（无降级），产品层面如需更高成功率只能调提示词或更换供应商配置（显式、人工决定）。
- 下一步：REL0（公网部署 Vercel + Convex Cloud）BLOCKED——需要用户账号/凭据与 GC0 冻结签署（批量验收）；AUTH1/G1/P1 保持 BLOCKED。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 8.2 / 15 节；`ENGINEERING_SPEC.md` 第 8 / 11 节
3. `convex/audit.ts`、`convex/evidence.ts`（action 包装模式）、`server/turn-engine/run-turn.ts`
4. `tests/tb10-full-chain.test.ts`
