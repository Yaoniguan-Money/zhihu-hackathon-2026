# TB2b：用户案件完整编译器（Claim 抽取 → 五角色案件）

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **版本化模型候选 schema**（`server/model/schemas/case-compilation.ts`，`case-compilation-v1@1`）：模型只产出 title/summary/theme、5 个角色人格内容（display_name/public_bio/persona_key）、Evidence Catalog 条目内容（type/title/body/claim_indices/conflict_indices 可省略）与 distortion_plan 下标引用候选。voice、role/ev/crit 可信 ID、4+1 结构、答案子集、unlock rule、rubric 均不由模型决定。
- **纯函数编译器**（`server/cases/compile-case.ts`）：`compileCaseFromCandidates` 完成全部服务器决定——role-1..5 与 `voice-zh-01..05` 固定轮换（voice 不来自模型）、忠实角色获准集合恒空且 goal 用服务器固定文案、answer_distortion_types ⊆ allowed 校验、Catalog/可见集/truth 下标越界与空可见集/冲突自指/不可解锁条目/无可判分证据全部 `CaseInvariantFailure`；unlock rule 由服务器从可见集合推导（required=条目全部公开 Claim，allowed=可见集覆盖该集合的角色）；rubric 只对命中 truth claims 的条目建 criterion，整数权重总和恰 100；Public Projection 以 `casePublicSchema` 服务端独立构造；最终过 `assertPlayableCaseInvariants`。
- **编译 worker 接线**（`convex/cases.ts`）：图谱校验后第二次模型调用（task `case` → `AI_CASE_MODEL`）→ 纯函数编译 → `finalizeCompilationSuccess` 扩展为完整工件原子落库（source + graph + policies + golden + catalog + rules + rubric + public_json + title/summary/theme 一次 ready）。写入边界全部经 contracts schema 复验，rubric 和恒 100、cases/case_private 跨字段一致性检查与 Golden 种子路径同构。
- **私有失败码 `CASE_INVARIANT_FAILED`**：加入 `contracts/private` 枚举与 CONTRACTS 13.2 清单、13.3 矩阵（编译期案件不变量 → `CASE_COMPILE_FAILED`，其余上下文 —）；`compileContextPublicError` 与 worker `toPrivateFailure` 同步映射，`ZodError`（模型候选未过严格 schema）映射 `MODEL_PROTOCOL_INVALID`。
- **真实模型端到端（DeepSeek，251.6s，两次调用）**：createFromSource → succeeded → 完整工件断言全过：4+1、rubric 和=100、Public 无 fidelity/visible_claim_ids/allowed_distortion_types/goal、voice 五枚互异、用户案件不进 listPublic、他人 getPublic=null、Owner getSource 可读、sessions.create 可建局。
- **纯函数测试**（`tests/tb2-compile.test.ts`，9 项）：合法候选全工件、答案子集违规、Claim 下标越界、空可见集、truth 下标越界、冲突自指、无可判分证据、用户 theme 优先。
- **提示词硬化（对模型 quirk 的唯一合法杠杆，未放宽任何 schema）**：DistortionType 十个 ID 全枚举禁止自造、可选字段禁空串、禁止额外字段、catalog/roles/distortion_plan 必填字段完整性清单。期间观察到 DeepSeek 实际不执行 responseFormat schema（AI SDK 警告），省略/自造字段为高频失败模式；严格 zod 复验将其全部判为 typed failure，无任何修复兜底。

## 明确未完成

- TB10（P0 全链证明）未开始。
- 模型编译成功率未做统计：候选不合规一律 `CASE_COMPILE_FAILED` 显式失败（契约要求，无重试兜底）；提示词继续调优是后续唯一杠杆。
- CONTRACTS 15 的私有审计事件（model_call_started/completed/failed 等）尚无持久化表——归入 TB10 范围。

## 修改文件

- `server/model/schemas/case-compilation.ts` — 新增：候选 schema + 提示词。
- `server/cases/compile-case.ts` — 新增：纯函数编译器。
- `convex/cases.ts` — worker 第二次模型调用、finalize 完整落库、ZodError 映射。
- `contracts/private/index.ts` — 枚举加 `CASE_INVARIANT_FAILED`。
- `convex/publicErrors.ts` — 编译上下文映射新码。
- `convex/admin.ts` — 新增 `caseArtifactsInternal` 测试查询。
- `tests/tb2-compile.test.ts`、`tests/tb2-compile-model.test.ts` — 新增。
- `docs/developer-a/CONTRACTS.md` — 13.2/13.3 增补（详见下）。

## 权威文档更新

- `docs/developer-a/CONTRACTS.md` — 13.2 私有码清单与 13.3 矩阵增加 `CASE_INVARIANT_FAILED`（CONTRACTS 13.2 为"至少实现"清单，新增属允许扩展；B 侧评审按用户 2026-09-05 夜间指示代行通过，留待批量验收复核）。

## 定向验证

- `bun test tests/tb2-compile.test.ts` — 9 pass / 0 fail。
- `RUN_MODEL_INTEGRATION=1 bun test tests/tb2-compile-model.test.ts` — **通过**（真实模型端到端 251.6s）。
- `bun test` 全套 — 106 pass / 0 fail / 5 skip；`bun run typecheck` 通过。

## 已知风险、阻塞与下一步

- `case-compilation-v1@1` 的模型成功率依赖 DeepSeek 对长提示词的字段纪律；失败显式可观察（`CASE_COMPILE_FAILED`），不影响已 ready 案件。
- 两次模型调用串行使建案耗时进入 2-5 分钟量级；`waitForTerminal` 默认 30s 对真实编译不够，模型测试已用显式超时。
- 下一步：TB10（P0 全链证明 + 私有审计事件 + 发布 Gate 完整套件与真实供应商 smoke）。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 4.2 / 9.3 / 10.1 / 13 节
3. `server/cases/compile-case.ts`、`server/model/schemas/case-compilation.ts`
4. `convex/cases.ts` compileCaseWorker / finalizeCompilationSuccess
5. `tests/tb2-compile.test.ts`
