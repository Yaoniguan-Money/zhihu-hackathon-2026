# 2026-09-04-developer-a-plan-migration：开发人员 A 根计划迁移

状态：`complete`  
完成时间：`2026-09-04`  
负责人：`开发人员 A / Codex`

## 实际完成

- 对现场文档、工程入口、Git 状态和现有实施路线进行了只读审计，确认 A1–A9 仍无业务代码、工程骨架或业务测试。
- 新建根目录 [DEVELOPER_A_IMPLEMENTATION_PLAN.md](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md)，作为 A 的唯一实施顺序来源；它记录当前事实、D0 修复包、Gate、Interface/Error/A1–A9 矩阵、P0/P1 边界和每阶段交接定义。
- 将 [旧计划路径](../developer-a/IMPLEMENTATION_PLAN.md) 收缩为迁移跳转，避免出现两个可独立编辑的实施顺序。
- 更新 [AGENTS.md](../../AGENTS.md)、[开发人员 A README](../developer-a/README.md)、本索引和基础资源历史记录中的计划入口与优先级说明。
- 本环节仅改 Markdown 文档；没有初始化项目、安装依赖、创建/修改业务代码、配置 Secret、调用知乎 API、创建 Git 提交或推送远端。

## 明确未完成

- VCS0、PF0、PF1、GC0、TB1–TB10、REL0、P1-1/P1-2/P1-3、REL1 与 AUTH1 均未执行。
- D0 仍待 A 更新权威契约/规格及开发人员 B 对 Public Contract、认证、错误和 P0 Cut 的签署。
- G0 与 G1 仍缺用户提供的真实知乎 URL 与完整正文；不得用替代材料解除阻塞。
- 没有 Bun、Next.js、Convex、Auth、模型 Adapter、Golden Case、部署或真实模型 smoke 成果。

## 修改文件

- [DEVELOPER_A_IMPLEMENTATION_PLAN.md](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md) — 新的根目录唯一实施顺序、Gate、矩阵与验收定义。
- [AGENTS.md](../../AGENTS.md) — 根计划入口与冲突优先级。
- [开发人员 A README](../developer-a/README.md) — 文档入口、迁移说明与 D0 阻塞状态。
- [旧计划迁移说明](../developer-a/IMPLEMENTATION_PLAN.md) — 只保留根计划跳转。
- [handoff 索引](./README.md) — 增加本记录。
- [基础资源与工程文档记录](./2026-09-04-foundation-resources-and-docs.md) — 将历史计划链接修正为根计划。
- 本记录 — 文档迁移的工作事实、验证和接手入口。

## 权威文档更新

- [DEVELOPER_A_IMPLEMENTATION_PLAN.md](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md) — 新增；仅改变实施顺序事实来源，不使 D0 提案成为现行公开契约。
- [AGENTS.md](../../AGENTS.md) 与 [开发人员 A README](../developer-a/README.md) — 同步根计划入口和优先级导航。
- [CONTRACTS.md](../developer-a/CONTRACTS.md)、[ENGINEERING_SPEC.md](../developer-a/ENGINEERING_SPEC.md) 与 ADR — 无规范变更；D0 仍为后续 BLOCKED Gate。

## 定向验证

- Markdown 本地链接扫描（PowerShell + `rg --files -g *.md`）— 通过；所有已发现的本地 Markdown 链接均可解析。创建本记录前索引中预先登记的本记录链接曾是唯一预期失败项，创建后复检已通过。
- `Get-Content docs/developer-a/IMPLEMENTATION_PLAN.md` — 通过；旧文件只含迁移说明和根计划链接。
- `rg` 旧计划路径引用检查 — 通过；仅保留明确标注为迁移跳转的引用，不存在第二份计划正文。
- 根计划锁定决定标记扫描 — 通过；目录、Durable 编译、认证/额度、开场、Evidence Catalog、评分、Voice 与 OAuth Gate 均可定位。
- 新根计划与全部迁移入口人工逐段审阅 — 通过；状态保持为未实现/阻塞，未出现业务实现、凭证、私有候选或错误的完成声明。
- 新根计划与本记录的凭证字面量启发式扫描 — 通过；没有疑似 Secret、Bearer Token 或 Access Secret 值。
- 最终组合检查（链接、旧路径单跳、锁定决定标记、凭证启发式、根目录工程文件与 Git HEAD）— 全部通过；未生成工程文件，也未创建提交。
- Standards Review — 通过；handoff 模板字段完整，旧计划仅在明确的迁移入口中被提及，未出现第二份可编辑计划。
- Spec Review — 通过；根计划包含用户锁定的目录/编译、匿名认证与额度、开场、Evidence、评分、P0/P1、Voice 和 OAuth Gate 决定。
- `git status --short` — 通过现场事实核对；仍为无提交、项目成果未跟踪状态，未产生业务文件或 Git 写操作。

## 已知风险、阻塞与下一步

- 本计划不替代 D0：任何 Public schema、认证、错误、编译生命周期、评分或状态改变必须先更新权威契约/规格并获得 B 评审。
- G0/G1 的真实文章来源仍是全部语义 ticket 的外部阻塞；搜索摘要、缓存和合成内容均不可替代。
- 当前 Git 没有基线、Bun 未安装。后续另获实施授权后，先按根计划处理 VCS0，再沿 PF0/D0/GC0 依赖前沿推进。
- 下一位 Agent 的可执行起点是 [根计划](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md) 的 VCS0 与 D0 Gate；不得把本记录当作新契约来源。

## 最小接手阅读顺序

1. [项目术语](../../CONTEXT.md)
2. [项目 Agent 规则](../../AGENTS.md)
3. [产品技术基线](../../证据链狼人杀_产品技术分工开发流程与数据接口_v2.0.md)
4. [ADR](../adr/)、[契约](../developer-a/CONTRACTS.md) 与 [工程规格](../developer-a/ENGINEERING_SPEC.md)
5. [开发人员 A 根计划](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md)
6. 本记录
