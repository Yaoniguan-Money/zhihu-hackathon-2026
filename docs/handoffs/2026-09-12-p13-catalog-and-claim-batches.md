# P1-3：第二案晋升系统目录 + flash 长文抽取批处理

状态：`complete`
完成时间：`2026-09-12`
负责人：`agent`

## 实际完成

- **系统目录晋升**（ADR 0004 内部操作，用户 REL1 已批准）：冻结工件 `case_id` 从编译 UUID 改为稳定 `case-demo-002` / `src-case-demo-002`；`paragraphs.json` 与第一案同样包一层 `{case_id,source_id,paragraphs}`。经 `admin:seedSystemCase` 幂等落库，`visibility=system` + `status=ready`。
- **本地**：`bun scripts/seed-golden-case.ts` → `case-demo-001` already exists，`case-demo-002` created。`cases.listPublic` 同时含两案；getPublic 五角色、getSource 与冻结正文逐字一致。
- **生产** `agile-turtle-860`：先 `convex deploy`（旧函数拒收 `compiler_version`），再 `bun scripts/seed-golden.ts https://agile-turtle-860.convex.cloud` → `case-demo-002` created。
- **flash 长文抽取**：`claim-extraction-v1@3` → `v1@4`。长文按 12 段一批调用（全局 `paragraph_index`）；切片允许空 claims。服务器 `materializeEvidenceGraph` 只接受 Canonical Source 内逐字、段内唯一摘录：声称段块不对但另一段唯一命中则纠正编号；对不上的候选丢弃（「宁可少抽」），关系端点随之丢弃；**全部**无法定位仍 `SOURCE_SPAN_INVALID`。无模糊重定位、无 JSON 猜测修复、无新恢复通道。
- 种子脚本 `scripts/seed-golden.ts` / `scripts/seed-golden-case.ts` 与 helper 同时种两案；`verify-rel0.ts` 增加 case-demo-002 存在检查。

## 明确未完成

- `RUN_MODEL_INTEGRATION=1 bun test tests/p13-second-case.test.ts` 未在本环节复跑（该测试走用户建案编译，不断言系统目录已含第二案）。
- AUTH1 仍 BLOCKED；遗留清理（旧中文目录 / 空部署）仍未做。

## 修改文件

- `server/model/schemas/claim-extraction.ts` — v1@4、批大小、切片 schema、全局编号 prompt。
- `server/source/materialize-claims.ts` — 合并切片、精确摘录定位、丢弃无法定位候选。
- `convex/cases.ts` — 编译 worker 按批抽取后 materialize。
- `convex/admin.ts` — `seedSystemCase` 可选 `compiler_version`。
- `tests/helpers/golden-seed.ts` — 通用按目录种子；`seedSecondGoldenCaseViaAdmin`。
- `tests/materialize-claims.test.ts`、`tests/p13-frozen-invariants.test.ts`、`tests/tb2-golden.test.ts` — 定向覆盖。
- `scripts/seed-golden.ts`、`scripts/seed-golden-case.ts`、`scripts/verify-rel0.ts`。
- `golden-case/case-demo-002/*` — 稳定 ID 与 paragraphs 包装。
- `docs/REL1-acceptance-checklist.md`、`DEVELOPER_A_IMPLEMENTATION_PLAN.md`、`docs/handoffs/README.md`、本记录。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — P1-3 行补晋升与 v1@4；无公开契约形状变更。
- `docs/REL1-acceptance-checklist.md` — 第 4 节晋升项改为已执行。

无规范变更：公开 schema / 错误码未改；Span 仍要求逐字唯一，禁止模糊重定位。prompt 版本按 9.3 升级。

## 定向验证

- `bun test tests/materialize-claims.test.ts tests/p13-frozen-invariants.test.ts` — 9 pass。
- `bun run typecheck` — 通过。
- `bunx convex dev --once` — Convex functions ready。
- `bun scripts/seed-golden-case.ts` — 本地 `case-demo-002` created。
- `bun test tests/tb2-golden.test.ts tests/tb1-source.test.ts tests/materialize-claims.test.ts tests/p13-frozen-invariants.test.ts` — 28 pass / 0 fail。
- `CONVEX_DEPLOY_KEY=… bunx convex deploy --yes` — 部署到 `agile-turtle-860`。
- `bun scripts/seed-golden.ts https://agile-turtle-860.convex.cloud` — `case-demo-001` already exists，`case-demo-002` created。

## 已知风险、阻塞与下一步

- 批处理增加 claim 调用次数（约 84 段 / 12 ≈ 7 次），编译更慢，lease 仍 30 分钟。单批模型失败仍整次编译失败（无新兜底）。
- 丢弃无法定位摘录后，剩余图谱若不够支撑 4+1 / 解锁覆盖，会在编译器不变量处显式失败。
- 大厅 `cases.listPublic` 现含两案；刷新即可玩第二案，无需再走用户建案。
- 下一步：浏览器开第二案走一局；可选复跑 p13 模型集成测试。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `docs/adr/0004-case-catalog-durable-compilation-and-anonymous-access.md`
3. 本记录
4. `server/source/materialize-claims.ts`
