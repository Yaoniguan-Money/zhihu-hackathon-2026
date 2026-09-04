# 阶段记录与 Agent 交接

`docs/handoffs/` 记录已经发生的工作事实，并让下一位 Agent 能在最小阅读量下安全接手。这里不是契约、架构或产品行为的事实来源；涉及这些内容时，记录必须链接到相应的权威文档。

## 何时创建

为每个已完成的 tracer bullet、独立资源/环境阶段、契约变更或可单独交接的修复创建一份记录。环节缺少记录时不得标记完成。

文件名使用稳定的阶段或 ticket ID：

```text
docs/handoffs/<ticket-or-stage-id>.md
```

例如：`PF0-shared-seams.md`、`TB3-faithful-role-turn.md`、`2026-09-04-foundation-resources-and-docs.md`。

## 记录规则

- 记录当前真实状态：`complete`、`blocked` 或 `failed`。不要把计划、部分完成或降级写成完成。
- 先更新被改变的权威开发文档，再链接它；没有规范事实变化时明确写“无规范变更”。
- 每份记录只描述当前环节，避免复制整个规格或契约。
- 不记录 Secret、Access Secret、API Key、完整私有 Prompt、私有候选、Fidelity、GM 真相或未解锁 Claim。
- 后续更正可以修改同一记录，但必须保留当前真实状态、补充验证与下一步。

## 模板

```md
# <环节 ID>：<简短名称>

状态：`complete | blocked | failed`  
完成时间：`YYYY-MM-DD`  
负责人：`<agent / role>`

## 实际完成

- <可验证的完成事实>

## 明确未完成

- <未完成内容；没有则写“无”>

## 修改文件

- `relative/path` — <为什么变更>

## 权威文档更新

- `relative/path` — <变更摘要>

若没有规范事实变化：无规范变更。

## 定向验证

- `<命令或检查>` — <通过 / 失败及关键结果>

## 已知风险、阻塞与下一步

- <风险或外部依赖>
- <下一位 Agent 可以立即执行的起点>

## 最小接手阅读顺序

1. `relative/path/to/CONTEXT.md`
2. <本环节相关的权威文档>
3. <本记录>
```

## 记录索引

| 环节 | 状态 | 记录 |
|---|---|---|
| 基础资源与工程文档 | complete | [2026-09-04-foundation-resources-and-docs](./2026-09-04-foundation-resources-and-docs.md) |
| 开发人员 A 根计划迁移 | complete | [2026-09-04-developer-a-plan-migration](./2026-09-04-developer-a-plan-migration.md) |
| 知乎 Access Secret 配置（含 CLI 重装） | complete | [2026-09-04-zhihu-access-secret-configured](./2026-09-04-zhihu-access-secret-configured.md) |
| VCS0 版本基线 | complete | [2026-09-04-vcs0-version-baseline](./2026-09-04-vcs0-version-baseline.md) |
| PF0 工具链骨架 | complete | [2026-09-04-pf0-toolchain-skeleton](./2026-09-04-pf0-toolchain-skeleton.md) |
