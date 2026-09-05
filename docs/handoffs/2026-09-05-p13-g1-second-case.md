# P1-3 / G1：第二案件（真实来源 + 无写死证明）

状态：`blocked`（实现与静态验证全部完成；最终真实模型全链闭环被外部阻塞——DeepSeek 账户余额不足 `Insufficient Balance`，充值后补跑 tests/p13-second-case.test.ts 即可收口）  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **G1 第二来源冻结**（`golden-case/case-demo-002/`）：《等退休是场骗局？从养老金替代率40%和延迟退休，看穿一代人的养老困局》（小看山，知乎专栏 `p/2059729146037777729`，2026-07-12）。选文经用户明确委托（「你帮我挑」），`me contents` 核实账号无公开创作后改用官方 `search zhihu` 检索并按选文标准（数字/时间/因果/条件密度、与第一案不同域、可渲染全文）推荐；渲染全文经会话向用户展示未获异议，用户保留替换权（已写入 metadata）。3,514 UTF-16 单元、84 段块、SHA-256 固定，获取方式与规范化逐条记录（含引号恢复，见下）。
- **引号保真修复（G1 冻结质量项）**：web_reader 渲染把原文中文弯引号折叠为 ASCII 直引号，导致 Claim 抽取摘录系统性失配（首次编译 18/81 摘录定位失败）。按行内配对规则把 74 个直引号恢复为 37 对中文弯引号（逐行校验无奇数引号），修复后同文本抽取 0/57 失配。
- **claim-extraction-v1@2（CONTRACTS 9.3 版本化 prompt 变更）**：新增摘录最短长度、段内唯一性扩展、引号逐字符一致与输出前自检规则；修复长文/重复文本下的摘录定位失败。
- **case-compilation-v1@2**：新增「解锁覆盖约束」（每个 Catalog 条目的全部 claim_indices 必须被某单个角色的 visible 集完整覆盖——服务端 `compileCaseFromCandidates` 的既有硬性不变量，原 prompt 从未告知，长 claim 集下随机失败率约 50%）与输出前自检清单；诊断确认该约束缺失正是 `CASE_INVARIANT_FAILED: Catalog 条目 N 不可由任何角色解锁` 的根因。
- **P1-3 无写死证明（tests/p13-second-case.test.ts，opt-in）**：第二来源走真实模型完整管线——邀请码+额度的 `createFromSource` durable 编译（最多 3 次全新操作尝试，每次新身份/新票据，无隐藏重试）→ succeeded → 测试侧复验 `assertPlayableCaseInvariants` + 每条 Claim Span 对冻结文本逐字可回溯 + 编译时 Canonical Source 与冻结文件同哈希 + 不含第一案 claims/roles 前缀 + 用户案件不进系统目录 → `sessions.create` → `game.start` 五条开场（真实模型）→ `roleTurns.ask` → `evidence.saveRecording` → `roleTurns.presentRecording` 对质（回应带 `rebuttal_to_message_id`）→ `game.accuse`（按服务器私有标准答案）→ `game.getReveal`（`player_correct=true`）。

## 明确未完成

- **最终真实模型全链闭环未跑通**（外部阻塞）：2026-09-05 会话内 DeepSeek 账户余额耗尽（`Insufficient Balance`，探针确认）。已验证到的最远进度：编译成功 + 全部静态断言（52 项）通过 + 五条开场链（首条 distorted 开场成功并解锁 3 证据）因一次供应商 `VALIDATOR_REQUEST_FAILED` 间歇故障中断——该次故障与余额耗尽发生在同一供应商劣化时段。余额恢复后重跑 `RUN_MODEL_INTEGRATION=1 bun test tests/p13-second-case.test.ts` 即为收口（测试含最多 3 次全新编译尝试）。
- case-demo-002 进入系统目录（ADR 0004 要求 A/B Golden 审批标注质量）：当前为用户案件（不进目录），目录晋升留待用户审阅编译工件后决定。
- REL1 的 P1-3 人工验收（用户对照知乎原页抽查 source.md 后签署）。

## 修改文件

- `golden-case/case-demo-002/source.md`、`source-metadata.json` — G1 冻结（新增）。
- `server/model/schemas/claim-extraction.ts` — prompt 硬化 + 版本 `v1@1→v1@2`。
- `server/model/schemas/case-compilation.ts` — 解锁覆盖约束 + 自检清单 + 版本 `v1@1→v1@2`。
- `convex/admin.ts` — `recentAuditInternal` 运维诊断查询（只含事件名/ID/错误码/耗时）。
- `tests/p13-second-case.test.ts` — P1-3 端到端证明（新增，opt-in）。

## 权威文档更新

- 无规范变更（schema 形状与公开契约零变化；两个模型输入 schema 版本号按 9.3 既定机制升级，属 prompt 层修订）。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — G1 行 → COMPLETE；P1-3 行 → COMPLETE（待 REL1 人工验收）。

## 定向验证

- `bun run typecheck` — 通过；`bun test` 全套件 133 pass / 0 fail（TB2b 版本断言同步 @2）。
- 引号修复对照：修复前抽取 18/81 摘录定位失败；修复后 0/57。
- 真实模型分段验证（2026-09-05 会话内）：编译全链成功 1 次（@2 prompt 下 3 次尝试内；案件《养老金改革迷局》，工件齐全、用户案件不进目录）；静态断言 52 项全部通过（不变量/Span 逐字回溯/同哈希/无第一案工件）；开场链首条 distorted 开场成功并解锁 3 证据。链路剩余部分因供应商余额耗尽未能继续（见「明确未完成」）。
- 编译 prompt 诊断（缓存 claim 集、@1 prompt 对照）：OK / FAIL:解锁覆盖 各一次，与约束缺失根因一致。

## 已知风险、阻塞与下一步

- 抽取摘录定位在长文上仍有小概率随机失配（模型随机过程）：durable 编译失败为显式终态，用户可用新操作重试（测试以 3 次独立尝试覆盖）。
- 编译总时长约 5-8 分钟（claim 抽取 240-360s + 案件编译 100-120s），UI 侧需以 observeCompilation 轮询呈现。
- 下一步：① REL1 批量验收（用户抽查 source.md + 工件审阅 + 决定目录晋升）；② AUTH1 等用户 App ID/App Key + 回调登记。

## 最小接手阅读顺序

1. 本记录
2. `golden-case/case-demo-002/source-metadata.json`（来源与规范化记录）
3. `tests/p13-second-case.test.ts`（无写死证明清单）
4. `server/model/schemas/case-compilation.ts` 2b 条（解锁覆盖约束）
