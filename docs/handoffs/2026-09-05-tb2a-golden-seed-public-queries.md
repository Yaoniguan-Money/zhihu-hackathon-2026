# TB2a：Golden 系统案件种子与公开查询

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`  
（TB2 的一部分；用户案件完整编译器＝TB2b 另行记录）

## 实际完成

- **Golden 系统案件种子**：`admin:seedSystemCase`（internalMutation，仅 admin 路径）把冻结的 case-demo-001 标注直接落库——不走模型（ADR 0004「进入系统目录只能由内部操作完成并经 A/B Golden 审批」）。写入边界经 contracts zod 复验（CasePublic / CasePrivate / 段落索引）+ `assertPlayableCaseInvariants` + 跨字段一致性（case_id 三处一致、source_id=`src-<case_key>`、rubric 权重和=100）；幂等（已存在返回 created:false）。种子装载器 `tests/helpers/golden-seed.ts`（校验 source.md sha256 与 metadata 一致后装载）+ `scripts/seed-golden-case.ts`。
- **cases.getPublic**（query）：任意身份可读 ready 系统案件；用户案件仅 Owner；不存在/越权/未 ready 一律安全 null；输出经 casePublicSchema 校验。cases 表新增 `public_json` 列。
- **cases.getSource**（query）：返回 SourceDocumentPublic（source_id=`src-<case_key>`），可见性规则同上。
- **case_private 表扩展**：新增 policies_json / golden_answer_json / catalog_json / rules_json / rubric_json（可选列）；TB1 worker 仍只写 graph_json，完整标注由种子写入（TB2b 编译器将写全部）。

## 明确未完成

- TB2b：用户案件完整编译器（模型生成角色/Policy/Catalog 候选，服务器决定 4+1 与答案，Public Projection）。
- rubric 目前仅落库（TB9 Reveal 评分时消费）。

## 修改文件

- `convex/schema.ts`、`convex/cases.ts`（getPublic/getSource）、`convex/admin.ts`（seedSystemCase）
- `tests/helpers/golden-seed.ts`、`tests/tb2-golden.test.ts`、`scripts/seed-golden-case.ts`
- 本记录、索引、根计划第 5 节。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 第 5 节 TB2 行 IN PROGRESS（TB2a 完成、TB2b 待做）。无契约变更。

## 定向验证

- `bun test tests/tb2-golden.test.ts` — 4 pass / 0 fail：listPublic 含 Golden（schema 校验）、getPublic 5 角色且 zod 通过、无身份 AUTH_REQUIRED、不存在→null、getSource canonical_text 与冻结正文逐字一致。
- `bun test` 全套 — 65 pass / 0 fail / 1 skip（opt-in 模型测试）。
- `bun run typecheck` — 通过。

## 已知风险、阻塞与下一步

- 种子装载器读取 `golden-case/case-demo-001/gc0-draft/`（工作基线位置）；GC0 冻结移动文件后需同步更新路径（golden-seed.ts 顶部常量）。
- 下一步：TB2b（用户案件完整编译器）或按依赖前沿先做 TB3（Session Authority，仅依赖系统案件可读，已被本环节解锁）。

## 最小接手阅读顺序

1. 本记录
2. `convex/admin.ts`（seedSystemCase）、`convex/cases.ts`（getPublic/getSource）
3. `tests/tb2-golden.test.ts`
