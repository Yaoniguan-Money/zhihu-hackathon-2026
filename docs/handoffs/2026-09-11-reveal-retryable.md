# 2026-09-11-REVEAL-RETRYABLE：揭晓失败退回审讯中（不整局作废）+ Reveal 网络重试 10 次

状态：`complete`  
完成时间：`2026-09-11`  
负责人：`Agent（Trae，GLM）`

## 实际完成

**诊断**：19:05–19:06 中转站再次进入坏窗口（一条 role 调用重试 3 次共 12.5s 仍失败——此为网络层重试按设计工作的证据），随后玩家提交指控，Reveal 单次模型调用失败 → 按既有设计 `REVEAL_FAILED` 直接整局作废。评分/真凶/事实链均为服务器确定性计算，模型只生成解释文字——单点失败否决整局且提示中的"稍后重试"无实际路径。

**修复（用户 2026-09-11 批准："重试也是至少10次"）**：

- Reveal 模型调用：网络类瞬时错误最多 10 次尝试（指数退避 500ms 起、单次封顶 4s）；仅 `ModelRequestFailedError` 且 cause 为网络类瞬时错误时重试，schema/协议错误仍立即失败。
- `failRevealInternal` 不再把对局置为 `failed`：改为退回 `investigation`（证据/进度/回合历史全保留），记私有审计 `reveal_failed_retryable`；玩家在指控页重新提交指控即可。错误经 accuse action 的 Public Error 呈现。
- `errorCodeHint` 为 `REVEAL_FAILED` 增加准确提示（重新提交指控，不再谎称回大厅重开）。
- 排查结论（服务商 vs 程序）：中转站存在分钟级间歇坏窗口（健康窗口 20/20、24/24 全过；坏窗口内含单发调用在内随机掐断连接）；程序侧放大器（无 JSON 强制、SDK 重试盲区、单点终局、零语义重试）已全部在前几轮修复。

## 明确未完成

- "judging" 瞬态阶段若 action 进程崩溃可能停留（先于本环节已存在的风险，未处理）。
- git 提交随本记录一并推送（用户指示"推送"）。

## 修改文件

- `convex/reveal.ts` — Reveal 网络重试 ×10；`failRevealInternal` 改为退回 investigation
- `lib/convex-errors.ts` — `REVEAL_FAILED` 提示文案
- `AGENTS.md` — 失败策略第三种恢复补充 Reveal 特例

## 权威文档更新

- `AGENTS.md` 不变量与失败策略节 — 见上。公开契约无形状变化；行为变化：Reveal 失败由"整局终局"改为"可重试非终局"（用户批准）。

## 定向验证

- `bun run typecheck` — 通过
- `bun test tests/tb9-accuse.test.ts tests/tb9-model.test.ts` — 2 pass / 1 skip（model 用例为显式 opt-in）
- `bunx convex dev --once` — `Convex functions ready!`（19:12）

## 已知风险、下一步

- Reveal 最坏情况 10 次尝试 × 退避 ≈ 数十秒的"合议中"等待；前端已有合议遮罩。
- 建议用户切换官方 DeepSeek API（`.env.local` 已有官方 Key），中转站坏窗口是剩余失败的主要来源。

## 最小接手阅读顺序

1. `convex/reveal.ts`（accuseCore 重试循环 + failRevealInternal）
2. `AGENTS.md`（失败策略）
3. 前序 [2026-09-11-model-json-enforcement-and-transport-retry](./2026-09-11-model-json-enforcement-and-transport-retry.md)
4. 本记录
