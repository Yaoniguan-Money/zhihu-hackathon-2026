# REPLY-WAIT-UX-AND-MODEL-TIMEOUT：开场等待文案/面板重叠/回复无响应超时

状态：`complete`  
完成时间：`2026-09-12`  
负责人：`agent (Trae)`

## 实际完成

- 开场剧场红色等待文案由「第 N 条正在生成，完成后自动开始朗读…」改为「<陈述人名>正在整理措辞…」，陈述人取案件固定顺序中第一个尚未到达开场者。
- 修复审讯页右上选中角色卡与右侧「审讯记录」面板重叠：面板 top 在角色卡可见时让位（70px → 132px，带过渡），并加固面板头部 chip 挤压（shrink-0 / truncate）。
- Model Gateway 新增单次请求无响应超时 `REQUEST_TIMEOUT_MS = 120s`：挂起连接（对端不回包也不断开）原先既不报错也不重试，回合卡在 working、前端"正在回答"无限计时（实测 168s 无回复）。超时 abort（AbortError / TimeoutError）归类为网络类瞬时错误，复用 2026-09-11 已批准的传输层重试口径（一般调用 2 次 + 指数退避；Reveal 路径经同一 `isTransientNetworkError` 判定享 10 次重试），重试耗尽抛 `MODEL_REQUEST_FAILED` typed failure，不静默吞掉。

## 明确未完成

- 无（本环节内）。Lint 仓库级预存错误（setState-in-effect 等）与本环节无关，未处理。

## 修改文件

- `app/game/interrogation/page.tsx` — 等待文案改为陈述人名 + 面板 top 让位与头部 chip 加固。
- `server/model-gateway/openai-compatible-gateway.ts` — `REQUEST_TIMEOUT_MS`、`isTransientNetworkError` 增加 AbortError/TimeoutError 判定、`generateObject` 挂 `abortSignal`（手动 AbortController + setTimeout，兼容 Convex runtime）。
- `tests/model-gateway.test.ts` — 新增超时 abort 判定的定向用例。

## 权威文档更新

无规范变更（超时 abort 归入既有"网络类瞬时错误"已批准口径，未新增恢复种类、未改变契约形状）。

## 定向验证

- `bun test tests/model-gateway.test.ts` — 通过（21 pass / 0 fail，含新增用例）。
- `npm run typecheck` — 通过。
- `npm run lint` — 失败，但全部为预存错误（react-hooks compiler 规则，多文件），本环节改动行无新增告警。

## 已知风险、阻塞与下一步

- 单次模型请求最长约 120s×3 次 + 退避 ≈ 6 分钟；回合 ticket lease 10 分钟，超时路径不会越过 lease。
- Convex scheduler 延迟或 action 队列堆积仍可能让前端等待偏久，属平台侧，未在本环节处理。
- 下一步：真实供应商 smoke 一局，观察"正在回答"是否在异常窗口内最终转为显式错误面板。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `AGENTS.md`（不变量与失败策略：已批准的三种恢复）
3. `docs/handoffs/2026-09-11-model-json-enforcement-and-transport-retry.md`
4. 本记录
