# REL1：签署记录

状态：`complete`
完成时间：`2026-09-12`
负责人：`项目所有者签署 / Agent 记录`

## 实际完成

- 用户于 2026-09-12 后一次会话中再次明确「通过」，接续 [部分签署](./2026-09-12-rel1-partial-signoff.md)（当时第 0–3 节已过）。本次签署范围：**第 4 节 P1-3**（第二来源抽查、编译工件审阅、是否晋升系统目录的决定）。
- 第 4 节三项按所有者签署勾选。目录晋升**决定为批准**；晋升本身是内部操作，本环节未执行，第二案仍保持用户案件、不进系统目录。
- REL1 Gate 在根计划中标记 COMPLETE。P0 / REL0 不被回写或改写。
- 可追溯证据即本记录与用户会话决定。

## 明确未完成

- 遗留清理未完成、**不勾**：本机 `D:\Users\yaoni\Desktop\知乎黑客松` 在签署时仍存在；空部署 `woozy-alpaca-64` 未在本会话删除。此项不阻塞 REL1 Gate（计划定义是 Recording / 对质 / Voice / 第二案件分别验收）。
- 第二案晋升系统目录：签署当时仅批准、未执行；已由 [2026-09-12-p13-catalog-and-claim-batches](./2026-09-12-p13-catalog-and-claim-batches.md) 执行。
- `tests/p13-second-case.test.ts` 未在本签署会话复跑；flash 档长文抽取风险见后续 P1-3 晋升记录（claim-extraction v1@4）。用户签署解除的是 REL1 人工验收 Gate，不是该风险消失。
- AUTH1 知乎 OAuth 仍 BLOCKED（独立外部 Gate，不在 REL1 范围）。

## 修改文件

- `docs/REL1-acceptance-checklist.md` — 第 4 节勾选；第 5 节签署项改为完整签署；遗留清理保持未勾。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — P1-3 → COMPLETE；REL1 → COMPLETE；Gate 表新增 REL1。
- `docs/handoffs/README.md` — 索引新增本记录；P1-3 索引状态与 REL1 对齐。
- 本记录。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 仅阶段/Gate 状态列；无规范事实变更。
- `docs/REL1-acceptance-checklist.md` — 仅勾选与签署摘要。

无规范变更。

## 定向验证

- 旧路径 `D:\Users\yaoni\Desktop\知乎黑客松` — `Test-Path` 为 True，故遗留清理不勾。
- `golden-case/case-demo-002/source.md`、`case-private.json`、`case-public.json` 均存在。
- 签署范围与用户决定对照：第 0–4 节通过；第 5 节第二项未通过/未做。

## 已知风险、阻塞与下一步

- 第二案进系统目录需另做内部晋升，不是本签署的副作用。
- 长文抽取仍依赖非 flash 档才能稳定复现 P1-3 全链测试。
- 下一步：用户可删旧目录与空部署；AUTH1 仍等官方 OAuth 材料。不要在本记录上叠加新玩法。

## 最小接手阅读顺序

1. `docs/REL1-acceptance-checklist.md`
2. `docs/handoffs/2026-09-12-rel1-partial-signoff.md`
3. `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 第 2、5、10 节
4. 本记录
