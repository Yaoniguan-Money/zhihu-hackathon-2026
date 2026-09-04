# TB3：Session Authority 与公开查询

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **sessions.create**（public mutation，纯服务端无外部调用）：auth → UUID 校验 → 幂等命中先于阶段校验（键 `(sessions.create, case_id, client_action_id)`，载荷哈希 = canonical JSON of {case_id} → SHA-256）→ Case 可读性检查（不存在/越权 → `CASE_NOT_FOUND`；未 ready → `CASE_NOT_READY`）→ 单事务创建 Session（phase=briefing、Board revision 0、`allowed_actions=["start"]`）+ `session_created` 事件（sequence 1）+ 幂等记录，返回 `SessionView`（经 sessionViewSchema 校验）。
- **sessions.getPublic**（query）：仅 Owner 可读；他人与不存在返回 null；从持久化状态重建 SessionView（含 `last_event_sequence`、failed 时的 terminal_error）。
- **messages.listPublic**（`convex/messages.ts`）：v1 全量返回、`created_at + message_id` 稳定排序；越权/不存在 → 空数组（同一安全结果）。
- **events.listPublic**（`convex/events.ts`）：`after_sequence` 增量恢复、sequence 升序、越权/不存在 → 空数组；`after_sequence` 非负整数校验。
- **阶段 → 动作矩阵**（CONTRACTS 7.1）：briefing→[start]、investigation→[ask, update_board, accuse]（save/present_recording 属 P1）、opening_statements/judging/revealed/failed→[]。
- **schema**：sessions / messages / events 三表及索引；idempotency_records 增加 `scope_id`（建案 ""、create 为 case_id、Session 域为 session_id；TB1 早期行缺此字段故列为 optional，新写入一律携带）。

## 明确未完成

- `game.start`（TB7）尚未实现：Session 目前停在 briefing，进入 investigation 的唯一路径是 TB7 的五条开场。TB4 的回合测试将需要 admin 种子工具把 Session 置于 investigation（仅测试用，生产路径仍必须经 game.start）。
- TB2b（用户案件完整编译器）未开始。

## 修改文件

- `convex/schema.ts`（sessions/messages/events、idempotency scope_id）
- `convex/sessions.ts`、`convex/messages.ts`、`convex/events.ts`
- `convex/cases.ts`（幂等键补 scope_id=""）
- `tests/tb3-sessions.test.ts`
- 本记录、索引、根计划第 5 节。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — TB3 → COMPLETE。无契约变更。

## 定向验证

- `bun test tests/tb3-sessions.test.ts` — 4 pass / 0 fail：briefing 初始视图与幂等重放（同 ID 同 Session；同 ID 不同 case 独立）、Owner 隔离（他人 null）、session_created 事件与增量恢复、空消息列表、无身份/非法 UUID/CASE_NOT_FOUND/CASE_NOT_READY 全部命中。
- `bun test` 全套 — 69 pass / 0 fail / 1 skip。
- `bun run typecheck` — 通过。

## 已知风险、阻塞与下一步

- 接口模块路径遵循契约命名（`messages.listPublic` / `events.listPublic` 为独立模块）；曾误并入 sessions.ts，已拆分。
- 跨运行的全局日额度残留会独立阻塞任何含建案的测试套件；需要建案的测试文件在 beforeAll 调 `admin:resetQuotaState`（仅本地开发）。
- 下一步（依赖前沿）：TB4 Faithful 成功回合 → TB5 重写 → TB6 Distorted → TB7 game.start。TB2b 穿插或其后补。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 5、7、12 节
3. `convex/sessions.ts`
4. `tests/tb3-sessions.test.ts`
