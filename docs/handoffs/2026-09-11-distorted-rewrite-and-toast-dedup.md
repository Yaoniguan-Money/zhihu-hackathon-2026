# 2026-09-11-DISTORTED-REWRITE-AND-TOAST-DEDUP：篡改角色语义重试 + 弹窗去重/语音赛跑静默

状态：`complete`  
完成时间：`2026-09-11`  
负责人：`Agent（Trae，GLM）`

> **2026-09-11 追记（用户决定）**：语义重试上限由"共 3 次候选"上调为**共 10 次候选**（首试 + 9 次重写，忠实与篡改同限，用户原话"每一个人都至少给他 10 次"）。`MAX_SEMANTIC_ATTEMPTS = 10`；AGENTS.md 失败策略同步修订；tb5/tb6 耗尽类测试改为 10 对脚本。typecheck + 37 项相关测试全过 + Convex 已推送。

## 实际完成

**18:35 开局失败的诊断（审计实锤，区别于此前两轮根因）**：5 条开场 4 条成功发布（右侧审讯记录为真实成功），1 条篡改角色的开场被 Validator 判定使用了未获准的篡改类型（`DISTORTION_POLICY_VIOLATION`）——按现行契约篡改角色单次候选、零重试，一票否决整局。在飞重写被死亡排水正确取消（前轮修复工作正常）。

**修复**：

1. 篡改角色语义重写（用户 2026-09-11 批准，AGENTS.md 失败策略同步修订）：`runGenerationAttempts` 对 distorted 与 faithful 统一 `MAX_SEMANTIC_ATTEMPTS = 3`；未构成获准篡改 / 类型越出允许集 / 引用越界 → 带反馈语义重写；耗尽 → `VALIDATION_EXHAUSTED`。对质回合的 `NEW_FACT_INTRODUCED` 硬约束不变（立即终止）。`DISTORTION_POLICY_VIOLATION` 不再由回合引擎产出（私有 schema 中保留该码，无契约变化）。
2. 弹窗去重：`gameMachine` EVENTS 对同一批内含 `session_failed` 的逐条 `role_turn_failed` 不再弹"这条回应失败了"；开场阶段的回合失败一律不弹（终局面板 + 一条终局 toast 已完整覆盖）。一次开局失败从最多 3 个错误表面降为 1 个终局面板 + 1 条 toast。
3. 语音相位赛跑静默：自动朗读在对局失败前一瞬发起、响应回来被服务端相位门控拒绝（`SESSION_PHASE_CONFLICT`）时，`failVoice` 与流式 `onVoiceError` 静默跳过不弹错误（文字内容不受影响，属正常收口）。

## 明确未完成

- 用户 BYOK 配置尚未激活结构化输出能力位（`supports_structured_outputs: false`，保存时间早于该功能上线）：**需在设置里重新点一次「测试并保存」**。18:11 的两例 `MODEL_REQUEST_FAILED`（纯文本解析失败）依赖该修复消除。
- 真实模型全链 smoke（`RUN_MODEL_INTEGRATION=1`）未运行；建议用户浏览器实测。

## 修改文件

- `server/turn-engine/run-turn.ts` — 语义重写扩展至篡改角色；`MAX_FAITHFUL_ATTEMPTS` → `MAX_SEMANTIC_ATTEMPTS`
- `context/gameMachine.ts` — 批内 session_failed 先扫、开场阶段回合失败不弹 toast
- `app/game/interrogation/page.tsx` — `failVoice` 与流式 `onVoiceError` 对 `SESSION_PHASE_CONFLICT` 静默
- `tests/tb5-tb6-engine.test.ts` — TB6 用例改为重写语义（违规重写后通过 / 三次耗尽）
- `AGENTS.md` — 失败策略第一条扩展（篡改角色纳入语义重写）

## 权威文档更新

- `AGENTS.md` 不变量与失败策略节 — 见上。公开契约（`contracts/`、错误码、事件）无变化；`DISTORTION_POLICY_VIOLATION` 仍为合法私有失败码，仅回合引擎不再产出。

## 定向验证

- `bun run typecheck` — 通过
- `bun test tests/tb5-tb6-engine.test.ts tests/p11-engine.test.ts tests/model-gateway-user-config.test.ts` — 27/27 通过
- `bun test tests/tb4-role-turns.test.ts tests/tb7-game-start.test.ts tests/tb10-full-chain.test.ts` — 17/17 通过（含死亡排水回归）
- `bunx convex dev --once` — `Convex functions ready!`
- 诊断：18:35 会话审计还原（4 成功 + 1 policy violation + 1 排水取消）

## 已知风险、下一步

- 语义重写上限 3 候选对回合时长的影响：篡改角色失败时最多 3 次 role + 3 次 validator 调用（此前 1+1），最坏情况回合耗时约 3 倍；前端已有等待秒数提示。
- 用户重新保存设置激活 JSON 强制后，观察一次完整开局；若仍有失败查 `private_audit.model_call_failed.detail_code`。

## 最小接手阅读顺序

1. `AGENTS.md`（失败策略）
2. `server/turn-engine/run-turn.ts`（重写循环）
3. 前序记录 [2026-09-11-model-json-enforcement-and-transport-retry](./2026-09-11-model-json-enforcement-and-transport-retry.md)
4. 本记录
