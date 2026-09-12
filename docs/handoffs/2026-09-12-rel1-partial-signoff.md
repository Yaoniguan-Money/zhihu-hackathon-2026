# REL1：部分签署（P0 / P1-1 / P1-2）

状态：`complete`（本记录为当时部分签署事实；已被 [完整签署](./2026-09-12-rel1-signoff.md) 接续）
完成时间：`2026-09-12`
负责人：`项目所有者签署 / Agent 记录`

## 实际完成

- 用户于 2026-09-12 会话中对 [REL1 验收清单](../REL1-acceptance-checklist.md) 明确决定「通过」。签署范围按当时约定：**第 0–3 节**（前置、P0 完整游玩、P1-1 录音与对质、P1-2 本地语音）；**第 4 节 P1-3 第二案件仍 ⛔，本次跳过、不视为通过**。
- 可追溯证据即本记录与用户会话决定。未把 P1-3 失败回写为 P0 已完成；P0 / REL0 状态不变。
- 清单第 0–3 节已勾选；第 4 节保持未勾；第 5 节「REL1 handoff 签署」已勾，遗留清理两项仍未确认。

## 明确未完成

- P1-3 第二案件人工验收（对照原页抽查 `source.md`、审阅编译工件、决定是否晋升系统目录）仍 ⛔；flash 档长文抽取不满足契约，游玩链不受影响。解除后补验，不得用本签署冒充 REL1 COMPLETE。
- 遗留清理未确认：旧中文目录 `D:\Users\yaoni\Desktop\知乎黑客松` 删除；多余空部署 `woozy-alpaca-64` 删除。
- AUTH1 知乎 OAuth 仍 BLOCKED（独立外部 Gate）。

## 修改文件

- `docs/REL1-acceptance-checklist.md` — 第 0–3 节与第 5 节签署项勾选；P1-3 与遗留清理保持未勾。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — REL1 行改为部分签署仍 BLOCKED；P1-2 行去掉「REL1 批量验收另行执行」。
- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 仅阶段状态列；无规范事实变更。
- `docs/REL1-acceptance-checklist.md` — 仅勾选状态；验收口径未改。

无规范变更。

## 定向验证

- 签署范围与用户决定对照：第 0–3 节通过；第 4 节明确未通过/未验；未将 REL1 标 COMPLETE。

## 已知风险、阻塞与下一步

- REL1 COMPLETE 仍等 P1-3 补验（换满足长文逐字抽取的模型后重跑 `tests/p13-second-case.test.ts`，再由用户抽查并决定目录晋升）。
- 遗留清理需用户本机确认后才能勾第 5 节第二项。
- 下一位 Agent 起点：不要把本记录当成 REL1 关闭；要关账先处理 P1-3，或等用户另作决定。

## 最小接手阅读顺序

1. `docs/REL1-acceptance-checklist.md`
2. `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 第 2、5、10 节
3. 本记录
