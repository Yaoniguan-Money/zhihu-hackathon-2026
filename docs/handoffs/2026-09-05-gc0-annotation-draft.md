# 2026-09-05-gc0-annotation-draft：GC0 标注草案产出（待确认冻结）

状态：`blocked`（草案已完成并全部程序化验证通过；阻塞在 A/B 与用户逐项确认，确认前不冻结）  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 同一环节先完成 **PF1 关闭**：在 ASCII 工作区重启本地 Convex 后端，复验 schema push（`bunx convex dev --once` → `Convex functions ready!`）与 `auth:signIn '{"provider":"anonymous"}'` 匿名会话签发；`bun run typecheck` 与 `bun test`（26 pass）通过。[PF1 handoff](./2026-09-04-pf1-schema-auth-model-seam.md) 已改 `complete`，根计划第 2、5 节同步。
- **GC0 标注草案**（`golden-case/case-demo-001/gc0-draft/`）：
  - `build-and-verify.ts` — 构建+验证脚本；Canonical Source sha256/长度校验、33 段块索引、Claim Span 在段块内唯一定位并通过 `text === slice` 校验、全部输出经 contracts zod schema 与 `assertPlayableCaseInvariants` 验证、rubric 整数权重复算与服务器正确性规则模拟。
  - `paragraphs.json`（33 块，0 个 quote 段）、`case-public.json`（5 角色公开设定）、`case-private.json`（23 claims / 22 relations / 4+1 policies / golden answer / 8 catalog 条目 / 8 解锁规则）、`rubric.json`（40+35+25=100）、`representative-fixtures.json`（faithful 开场 entailed、distorted 开场 distorted 且类型⊆允许集、忠实重写示例 0 拒 1 过 + 批准信封、指控、Reveal 75/62/true、questioning_score 计分示例）。
  - `README.md` — 草案状态、设计要点、九项确认清单、冻结流程。
- 篡改设计：`role-skeptic` 为答案归属，答案类型 `scope_expand` + `condition_delete`（与允许集合一致）；代表性 distorted 开场仅挪用原文材料，无新事实。

## 明确未完成

- 九项确认清单（见 gc0-draft/README.md）未经 A/B 与用户确认，**GC0 未冻结、不得标记 COMPLETE**。
- ~~八项 `AI_*` 配置仍未提供~~ **[2026-09-05 修正]** 已配置并完成真实供应商 smoke：见 [2026-09-05-ai-config-deepseek-smoke](./2026-09-05-ai-config-deepseek-smoke.md)。
- G1 第二案件仍 BLOCKED（等用户输入）。

## 修改文件

- `golden-case/case-demo-001/gc0-draft/`（新增目录）：`build-and-verify.ts`、`paragraphs.json`、`case-public.json`、`case-private.json`、`rubric.json`、`representative-fixtures.json`、`README.md`。
- `docs/handoffs/2026-09-04-pf1-schema-auth-model-seam.md` — 状态 `blocked` → `complete`，新增 2026-09-05 复验记录。
- `docs/handoffs/README.md` — PF1 状态更新；新增本记录索引。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — PF1 → COMPLETE（第 2、5 节现场事实与阶段表）；GC0 → IN PROGRESS（草案待确认）。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 第 2 节现场事实段、第 2/5 节 PF1 与 GC0 状态行。无契约/规格变更：GC0 草案是 CONTRACTS.md 已冻结 schema 的实例化，未改动任何契约文本。

## 定向验证

- `bun golden-case/case-demo-001/gc0-draft/build-and-verify.ts` — 通过（sha256 一致；33 段块；23/22；不变量与 rubric 复算全绿）。
- `bun run typecheck` — 通过（含 gc0-draft 脚本，strict 模式）。
- `bun test` — 26 pass / 0 fail。
- 本地后端：`curl 127.0.0.1:3210/version`、`bunx convex dev --once`、`bunx convex run auth:signIn` — 均通过（后端进程保持后台运行中）。

## 已知风险、阻塞与下一步

- 阻塞：GC0 冻结需用户/A/B 按九项清单逐项确认；确认后按 gc0-draft/README.md 冻结流程执行（移出目录、重跑脚本、更新计划与 handoff）。
- 本地后端为常驻开发依赖；重启命令见 [2026-09-05-workspace-ascii-path](./2026-09-05-workspace-ascii-path.md)。CLI 一律 `bunx convex` + `CONVEX_SELF_HOSTED_URL/ADMIN_KEY` 直连。
- 下一步顺序：① 用户确认 GC0 标注 → 冻结；② TB1（Source 与 Durable 建案）开工——PF1 与 AI_* 配置均已就绪。

## 最小接手阅读顺序

1. `golden-case/case-demo-001/gc0-draft/README.md`
2. `docs/developer-a/CONTRACTS.md` 第 3、4、6、10 节
3. `docs/handoffs/2026-09-04-pf1-schema-auth-model-seam.md`（复验记录）
4. 本记录
