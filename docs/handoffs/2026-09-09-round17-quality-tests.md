# 2026-09-09-round17-quality-tests：sfx/评分逻辑单测

状态：`complete`

完成时间：2026-09-09 07:55
负责人：ZCode（自治迭代第 17 轮）

## 实际完成

- 新增 `tests/sfx.test.ts`（6 用例全过）：静音持久化/toggle/静音跳过/无 AudioContext 容错/节流；附带 `calcDiscernmentLevel` 边界分档。

## 明确未完成（登记待办）

- 全量 bun test 有 7 个"本地后端"集成用例失败（5s 超时族），与前端改动无关，疑与后端持久化数据/AI 覆盖层状态相关 → 第 43 轮用干净库复跑定位。

## 权威文档更新

无规范变更。

## 定向验证

- `bun test tests/sfx.test.ts` 6 pass / 0 fail。

## 下一步

- 第 18 轮：BGM 分层情绪音乐引擎。
