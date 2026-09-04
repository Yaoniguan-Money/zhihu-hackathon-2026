# D0-A：契约修复包（A 侧写入）

状态：`complete`（本环节；D0 Gate 整体仍开放，待开发人员 B 签署）  
完成时间：`2026-09-04`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 按根计划第 3 节，把用户锁定的 D0 决定全部写入权威契约与规格，并建立 D0 交付物要求的三张矩阵：
  1. **Interface → 阶段矩阵**：已在根计划第 6 节存在（`cases.createFromSource`/`observeCompilation`/`listPublic` → TB1 等），本环节未改动其映射。
  2. **Phase → Action 矩阵**：新增于 [CONTRACTS.md](../../docs/developer-a/CONTRACTS.md) 7.1（`briefing` 只允许 `start`；`investigation` 按资源前置条件动态开放 `ask`/`update_board`/`accuse`；`save_recording`/`present_recording` 属 P1）。
  3. **Private Failure × 操作上下文 → Public Error 矩阵**：新增于 CONTRACTS.md 13.3，覆盖全部 22 个私有码与建案/回合/Reveal/Voice 四类上下文。
- CONTRACTS.md 其他增补：3.3 段落/Quote 定义与 `CanonicalParagraphPrivate`；4.3 匿名身份与所有权；4.4 `CaseCatalogItemPublic`、`CaseCompileReceipt`、`CaseCompilationStatusPublic` 与目录/生命周期不变量；4.5 邀请码（只存哈希）与额度（滚动 24h ≤3、并发 ≤1、UTC 日 ≤50、30,000 UTF-16 code units）；CasePrivate 增加 `evidence_catalog`；7.2 `messages.listPublic` v1 全量稳定排序与 `game.start` 串行开场；8.x 删除 server-only `role_confrontation`（P1 对质仅由 `presentRecording` 触发）；9.3 版本化模型候选 schema；10.1 `evidence_score` 整数权重（总和 100）与 `questioning_score` 公式（8×角色 ≤40、追问 10 ≤30、新证据 10 ≤30）；11 表新增 `observeCompilation`/`listPublic` 并把 `createFromSource` 改为 receipt 语义；12 额度扣减在幂等命中之后；13 扩充 Public/Private 错误码。
- [ENGINEERING_SPEC.md](../../docs/developer-a/ENGINEERING_SPEC.md) 同步：A8 交付物补身份/邀请码/额度；5.1 改为 Durable 编译数据流（含额度检查与 Ticket）；5.2 `game.start` 串行开场；5.5 评分以 CONTRACTS 10.1 为唯一事实来源；8 幂等先于额度扣减。
- 新增 [ADR 0004](../../docs/adr/0004-case-catalog-durable-compilation-and-anonymous-access.md)（accepted）：系统案件目录、Durable 编译、匿名身份+邀请码+额度取代 v2.0 隐含假设；记录了每项决定的理由。
- **Fixture 更新计划**（D0 交付物 2）：仓库当前无任何 fixture；GC0 将按本修复包之后的 schema 首建全部 Golden fixture（`case-public`、`claims`、`relations`、`role-policies.private`、`golden-answer.private`、`evidence-catalog.private`、faithful/distorted 候选、validation、reveal），无存量 fixture 需要迁移。

## 明确未完成

- **D0 交付物 3：B 的可追溯评审/签署证据**——外部输入，等待开发人员 B 对 Public 类型、错误、认证与 P0 Cut 签署。签署前，D0 修复包文本是待评审提案，不得进入生产行为（PF1 保持 BLOCKED）。
- B 端确认后的 schema→Convex validator 实现、fixture 与 TB1+ 实现均未开始。

## 修改文件

- `docs/developer-a/CONTRACTS.md` — D0 修复包主体（见上）。
- `docs/developer-a/ENGINEERING_SPEC.md` — 同步数据流、开场、评分、身份与幂等顺序。
- `docs/adr/0004-case-catalog-durable-compilation-and-anonymous-access.md` — 新增，accepted。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — D0 状态 BLOCKED → IN PROGRESS（第 2、5 节）。
- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。

## 权威文档更新

- `docs/developer-a/CONTRACTS.md` — 状态行更新为“D0 修复包已写入、待 B 评审签署”，并按第 3 节扩充规范性文本。
- `docs/developer-a/ENGINEERING_SPEC.md` — 与契约同步的行为变更（无独立新增行为）。
- ADR 目录 — 新增 0004。
- 无 Secret、私有候选、Fidelity、GM 真相或未解锁 Claim 进入上述文档。

## 定向验证

- 三张矩阵完整性自查 — Interface→阶段（计划第 6 节）、Phase→Action（契约 7.1）、私有失败→公开错误（契约 13.3，22 个私有码全覆盖）。
- 契约交叉引用自查 — `CaseCompilationStatusPublic.error` 引用的 `PublicError`、`EvidenceCatalogItemPrivate` 引用的 `EvidenceType`/`ClaimId`/`EvidenceId` 均在文件内已定义；删除 `role_confrontation` 后 `RoleTurnKind` 与 `TurnIntentPrivate` 无残留引用。
- Markdown 本地链接检查 — 见下方命令结果。
- 与 v2.0 冲突核查 — 偏离点（同步建案→Durable、无鉴权→匿名+邀请码+额度）已由 ADR 0004 承接，符合“只有已接受 ADR 可有意偏离 v2.0”。

## 已知风险、阻塞与下一步

- Convex Auth 处于 beta：PF1 必须固定版本并跑兼容 smoke；不通过则保持 BLOCKED，不得自制鉴权。
- `messages.listPublic` 从增量 `after` 改为 v1 全量，是 B 端可见的接口变化，需在评审中显式确认。
- 下一步：B 签署 D0（可用本记录与契约 diff 作为评审入口）→ PF1（`shared/public/private` 物理入口、runtime schema、Anonymous Auth、八项 `AI_*` 显式配置、生产 OpenAI-compatible Adapter 与测试 Scripted Adapter）。G0（真实知乎 URL + 完整正文）仍是 GC0 及全部语义 ticket 的独立外部阻塞。

## 最小接手阅读顺序

1. `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 第 3 节（决定原文）
2. `docs/adr/0004-case-catalog-durable-compilation-and-anonymous-access.md`
3. `docs/developer-a/CONTRACTS.md`（3.3、4.3–4.5、7.1–7.2、8、9.3、10.1、11、12、13.3）
4. `docs/developer-a/ENGINEERING_SPEC.md`（5.1、5.2、5.5、8、2.2）
5. 本记录
