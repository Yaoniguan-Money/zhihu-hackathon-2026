# 2026-09-11-OPENING-FAIL-TOAST-STORM：开场失败诊断与死亡排水/弹窗风暴修复

状态：`complete`  
完成时间：`2026-09-11`  
负责人：`Agent（Trae，GLM）`

## 实际完成

**诊断（根因已定位，证据为本地审计与 smoke）**：

1. 现象：点"开始游戏"后先弹「开场陈述失败，本局无法继续 ROLE_TURN_FAILED」，随后「N 条证据已加入证据池」与「当前阶段不能合成语音 SESSION_PHASE_CONFLICT」交替刷屏。
2. 因果链（全部静态确认 + 审计实证）：
   - 开场是 5 条并行 Ticket、全对才进 investigation（`convex/game.ts` `start`，契约 §11 / TB7）；任一条失败 → 整局 `failed` + `session_failed` 事件。
   - 失败后其余 4 条在飞/未开工的开场**不被叫停**：`finalizeTurnSuccess` 无对局相位守卫，照常发布消息、解锁证据、发 `evidence_unlocked` / `role_message_published` 事件（审计会话 `b76d844b`：1 条 MODEL_REQUEST_FAILED 后仍有 4×`role_turn_succeeded`、`unlocked:4`、`unlocked:1`）。
   - 审讯页对新到角色消息自动朗读（ADR 0006）→ 对局已 `failed`，`convex/voice.ts` `approvedEnvelope` 相位门控拒绝 → `SESSION_PHASE_CONFLICT` 弹窗。
   - 前端 `gameMachine` EVENTS 对死后的每条事件照常弹 toast → 弹窗风暴。
3. 开场失败本身的运行时根因：**BYOK 供应商在 5 路并行开场 + validator 的请求突发下间歇性拒绝个别请求**（`MODEL_REQUEST_FAILED` / `VALIDATOR_REQUEST_FAILED`，4s 左右失败；同批其他调用 3–7s 成功；直连 smoke 200 正常）。网关 `maxRetries: 0` 一次失败即终，无传输层重试（符合失败策略不变量）。当前运行时配置为用户 BYOK `user-provider` / `deepseek-v4-flash`。历史库 1677 个会话中 121 个 failed，近 4 个均为开场 ROLE_TURN_FAILED。

**修复（drain-on-fail + 死亡静默 + 终局指引）**：

- 服务端排水：`openingWorker` 开工前检查对局相位（`failed` → 取消，不调模型）；`finalizeTurnSuccess` 增加相位守卫（`failed` → 不发布/不解锁/不发事件，Ticket 以 `failed` + "对局已终止，本回合已取消" 取消终结）；新增 `finalizeTurnCancelled` internal mutation（不发公开事件，仅记私有审计 `role_turn_cancelled`）。
- 前端死亡静默：`gameMachine` EVENTS 见 `session_failed` 后（或快照已 `failed`）不再为后续事件弹通知；`session_failed` 跨批次只提示一次；同批多条 `evidence_unlocked` 合并为一条通知（健康开场的连环弹窗也一并解决）。
- 自动朗读相位前置检查：仅 `opening_statements` / `investigation` 发起 TTS（服务端门控的同源镜像）。
- 终局指引：三个终局面板（审讯/证据板/指控）对 `SERVICE_NOT_CONFIGURED` 增加「去设置模型」入口（`ModelSettingsButton` 新增可选 `label`）；`ROLE_TURN_FAILED` 保持「回大厅开新局」。

## 明确未完成

- 真实模型 happy-path 全链 smoke（`RUN_MODEL_INTEGRATION=1 bun test tests/tb7-model.test.ts`）未运行：属发布前门槛，且当前供应商间歇拒绝会造成假阴性信号。建议用户在浏览器用本人 BYOK 身份实测一局正常开局。
- 供应商间歇拒绝本身（根因 3）未处理：按失败策略不变量不新增自动重试；可选后续为开场错峰间隔（现为 1s/条）加长或由用户换供应商，需用户决策。

## 修改文件

- `convex/game.ts` — `openingContextInternal` 返回 `session_phase`；`openingWorker` 开工前排水检查
- `convex/roleTurns.ts` — `finalizeTurnSuccess` 相位守卫 + 取消终结；新增 `finalizeTurnCancelled`
- `context/gameMachine.ts` — EVENTS 死亡静默、`session_failed` 去重、`evidence_unlocked` 同批合并
- `app/game/interrogation/page.tsx` — 自动朗读相位前置检查；终局面板加「去设置模型」
- `app/game/evidence/page.tsx`、`app/game/accusation/page.tsx` — 终局面板加「去设置模型」
- `components/settings/ModelSettingsDialog.tsx` — `ModelSettingsButton` 可选 `label`
- `tests/tb7-game-start.test.ts` — 新增死亡排水定向测试

## 权威文档更新

无规范变更：`contracts/` 公开 schema、错误码集合、事件类型均未动；`publicRoleTurnSchema.status` 仍为 accepted/working/succeeded/failed（取消映射为 failed + 明确消息）。行为变化仅限服务端内部取消语义与本记录所述 UI 呈现。

## 定向验证

- `bun run typecheck` — 通过
- `bunx convex dev --once`（self-hosted 3210）— `Convex functions ready!`
- `bun test tests/tb7-game-start.test.ts` — 5/5 通过；新排水测试实证：首条失败后仅 1×`role_turn_failed` + 1×`session_failed`，死后零 `role_message_published` / `evidence_unlocked`
- `bun test tests/tb4-role-turns.test.ts tests/tb10-full-chain.test.ts tests/tb8-evidence.test.ts tests/tb9-accuse.test.ts` — 21/21 通过
- `bunx eslint <改动文件>` — 仅存量问题（setState-in-effect / 未用变量，均在本环节未触碰的行；`interrogation/page.tsx:380` 的 `speakMessage` 调用为原有模式），未引入新违规
- 诊断：`bunx convex run --inline-query`（private_audit / sessions / ai_user_provider_config，未读取 Key）+ DeepSeek 直连 smoke（HTTP 200）

## 已知风险、阻塞与下一步

- 供应商间歇拒绝仍会发生：失败后现在会干净收口（单条终局错误 + 静默 + 可回大厅），但"这一局开不成"的概率未变。若要降低失败率，可选：加长开场错峰、或用户更换更稳的供应商（需用户决策，涉及失败策略边界）。
- 浏览器实测建议：开一局正常局（确认开场 5 条 + 合并后的单条证据通知）；再观察一次失败局（确认无风暴、终局面板唯一、指引正确）。
- 下一位 Agent 起点：`convex/game.ts` `openingWorker`（排水检查）→ `convex/roleTurns.ts` `finalizeTurnCancelled` → `tests/tb7-game-start.test.ts` 排水用例。

## 最小接手阅读顺序

1. `CONTEXT.md`（领域语言）
2. `AGENTS.md`（失败策略不变量）
3. 本记录
