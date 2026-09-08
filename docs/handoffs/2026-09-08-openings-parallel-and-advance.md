# 2026-09-08 · 开场五条并行生成 + 跳过即切下一条 + Validator 提示词瘦身

状态：`complete`  
完成时间：2026-09-08  
负责人：AI 代理（用户批准方案后实施）

## 实际完成

对应方案 `.trae/documents/openings-parallel-and-advance-plan.md`（用户四问：音频为何慢/跳转为何不跳/为何串行/写稿为何久）：

1. **五条开场并行生成**（`convex/game.ts`）：`start` 一次创建五条 `opening_statement` Ticket（各自独立 lease），`scheduler.runAfter(i*1000)` 1 秒错峰调度；删除 `openingTicketFor` 链式创建与 `enterInvestigation`；新增 `openingsProgressCheck`（幂等：phase 守卫下统计 succeeded 开场 Ticket，满五条才翻 investigation）。失败语义不变：任一失败 → Session failed，其余在飞成功落库保留为历史。开场 question 加 120 字限长。总耗时从 Σ(五条)（≈6 分钟）降为 max(五条)（≈1~2 分钟量级）。
2. **契约先行**：CONTRACTS §11 与 ENGINEERING_SPEC §5.2 由"串行、禁止预建队列"改为"五条并行、自我介绍式开场（各自上下文不含其他开场）"；失败/进入审讯语义保持。
3. **Validator 提示词瘦身**（`server/model/schemas/role-turn.ts` `validatorUserPrompt`，Round 10 既定合规修法）：候选 `support_claim_ids` 引用的 claim 给全文，其余可见 claim 只列 ID——大 claim 图案件请求 token 大幅下降，降低供应商大请求拒绝（VALIDATOR_REQUEST_FAILED 间歇失败）。Tradeoff：`referenced_claim_ids` 对未展开 claim 的识别受限；unsupported_spans/篡改判定不受影响（依赖所引 claim 全文）。
4. **前端开场剧场前进控制**（`app/game/interrogation/page.tsx`）：新增 `viewingIndex` 浏览位（恢复会话定位最新条）；语音自然播完（`finishVoice`）或点「跳过 ⏭」→ 下一条已到达立即切换并自动朗读，未到达显示"第 N+1 条正在生成，完成后自动开始朗读…"，到达自动接上；3D 气泡与口型同步跟随当前查看消息；开场进度点改为按到达数显示。

## 明确未完成

- 运维项（不在本轮代码内）：经 `/admin/providers` 把 role/validator 路由到更快模型（当前 env 兜底为 zhipu glm-4.7-flash，时段性 1305 过载；DeepSeek 注册表覆盖层已被无模型测试清空，见"已知风险"）。
- 真人实局计时对比（并行后五条总耗时、跳过切条体验）留待用户验证。

## 修改文件

- `convex/game.ts` — 并行 Ticket 创建/错峰调度/openingsProgressCheck/限长；删 openingTicketFor、enterInvestigation
- `server/model/schemas/role-turn.ts` — validatorUserPrompt 瘦身
- `app/game/interrogation/page.tsx` — viewingIndex/advanceOpening/finishVoice 前进/OpeningTheater 重构
- `docs/developer-a/CONTRACTS.md`、`docs/developer-a/ENGINEERING_SPEC.md` — 开场并行契约

## 权威文档更新

- `docs/developer-a/CONTRACTS.md` §11 — 开场编排改为五条并行（各自独立 lease、错峰调度、自我介绍式上下文）。
- `docs/developer-a/ENGINEERING_SPEC.md` §5.2 — 同步改为并行语义，注明 Σ→max 的动机与幂等性。

## 定向验证

- `bun run typecheck` — 通过。
- `bun test tests/p11-engine.test.ts` — 8 pass（prompt/回合引擎不回归）。
- `bun test tests/tb7-game-start.test.ts` — 3 pass / 1 fail：失败用例"无模型 → SERVICE_NOT_CONFIGURED"在**改动前后行为一致**（git stash 对照复跑同样失败）——环境性预存问题：本地后端加载了 .env.local 的真实 AI_* 配置，"无模型"前提不成立（真实调用快速失败映射为 ROLE_TURN_FAILED），与本轮变更无关。
- 并行功能验证（一次性脚本，已删）：`game:start` 后出现 **5 条 `role_turn_working` 事件**、无模型下 Session 快速 failed——五条 Ticket 并行运行实证。

## 已知风险、阻塞与下一步

- **P0 运维事项（用户需操作）**：`tests/tb7-game-start.test.ts` 的"清空 AI 供应商注册表覆盖层"前置与本轮验证脚本已清空 DB 注册表（`ai_provider_config`）；当前网关回落到 `.env.local` 的 zhipu glm-4.7-flash（时段性 1305 过载）。**用户下一局前请经 `/admin/providers` 重新登记 DeepSeek（或可用供应商）**——DeepSeek API Key 仅存于原注册表，已被清除且不可恢复，需用户重新录入。
- 并行后五路角色调用 + 渐次 Validator 有供应商并发限流风险（1s 错峰缓解）；被限流时按不变量显式失败，不自动重试。
- Validator 瘦身的识别力 tradeoff（见"实际完成"3）持续观察：若 distorted 角色的篡改检出率异常，回退方案为恢复全量 proposition。
- 开场陈述互不引用（并行前history含先前开场）——内容上自我介绍式开场成立；若产品要求"听到前一条再发言"，需回串行或两段式，另立决策。

## 最小接手阅读顺序

1. `.trae/documents/openings-parallel-and-advance-plan.md`（四问定论与取舍）
2. `convex/game.ts` start / openingWorker / openingsProgressCheck
3. `app/game/interrogation/page.tsx` viewingIndex / advanceOpening / OpeningTheater
