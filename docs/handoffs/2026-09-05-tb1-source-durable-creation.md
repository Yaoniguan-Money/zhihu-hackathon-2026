# TB1：Source 与 Durable 建案 Walking Path

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **A1 Source Ingestion 纯函数**（`server/source/normalize.ts`）：BOM/CRLF 规范化（CONTRACTS 3.1）、空白行段块与 Quote 段识别（3.3）、30,000 UTF-16 上限（超限拒绝不截断）、`ingestSourceSnapshot`（sha256、typed failure SOURCE_URL_INVALID/SOURCE_TEXT_EMPTY/SOURCE_TOO_LONG/SOURCE_PARSE_FAILED）、`locateSourceSpan`（段内唯一定位 + slice 精确校验，无模糊重定位，失败 SOURCE_SPAN_INVALID）。
- **幂等与额度纯函数**：`server/cases/idempotency.ts`（canonical JSON JCS 子集 + SHA-256；正文规范化参与哈希；`client_action_id` 不进载荷哈希）；`server/cases/quota.ts`（滚动 24h≤3 / 并发≤1 / 全站 UTC 日≤50 / 长度上限，拒绝顺序：SOURCE_TOO_LONG → 并发 → 滚动 → 全站日）；`server/cases/invites.ts`（只存 SHA-256 哈希，过期/撤销/用尽/不存在同一拒绝语义）。
- **版本化模型候选 schema**（CONTRACTS 9.3）：`server/model/schemas/claim-extraction.ts` = `claim-extraction-v1@1`，模型只产出摘录/命题/关系下标候选；可信 ID、Span、confidence 由服务器分配。
- **Convex 业务表**（`convex/schema.ts`）：cases、compilation_tickets、idempotency_records、invite_codes、creation_usage、source_documents、case_private（含全部索引）。结构化契约数据以 canonical JSON 字符串列存储，写读边界均经 contracts zod 校验（单一校验层，避免 zod/Convex validator 双份漂移）——存储格式选择，无契约变更。
- **公开 Interface**（`convex/cases.ts`）：`cases.createFromSource`（action：auth → UUID/HTTPS/空文/长度校验 → 幂等命中先于额度扣减 → 邀请码 → 额度 → 单事务原子建 Case+Ticket+幂等记录+额度消耗 → 调度 worker）；`cases.observeCompilation`（query：只公开 accepted/working/succeeded/failed + 安全 PublicError，不存在与越权同返回 null）；`cases.listPublic`（query：仅 approved+ready 系统案件，畸形系统案件抛 INTERNAL_INCIDENT）。
- **Durable 编译 worker**（internalAction）：ingest → 真实 Model Gateway（maxRetries=0，无修复无重试）→ 服务器定位 Span/分配 ID/装配图谱 → `assertEvidenceGraphInvariants` → 原子 finalize 成功/失败；失败写 ticket failed + 映射后 PublicError（CONTRACTS 13.3 建案/编译列），不留下可玩 Case。`convex/publicErrors.ts` 实现该列的私有失败→公开错误映射。
- **TB1 管线成功语义**：source_documents + graph 落库 + ticket succeeded。可玩性投影（5 角色/policy/catalog/getPublic）按计划属 TB2；TB1 阶段 `cases.getPublic` 尚不存在，因此无公开谎言。
- **运维/测试内部工具**（`convex/admin.ts`，仅 admin 路径可达）：邀请码创建（真实运维需求）、owner/artifact 内部查询、额度与并发测试种子、`resetQuotaState`（清额度记账，仅本地开发）。
- **集成测试基建**（`tests/helpers/convex-local.ts`）：直连本地后端 HTTP API（query/mutation/action；管理键 `Authorization: Convex`，用户 `Authorization: Bearer <匿名 JWT>`），管理键只从 gitignored `.convex/local/default/config.json` 读取。

## 明确未完成

- 编译器完整校验（4+1 Role、Policy、Evidence Catalog、评分 rubric、Public Projection）＝TB2 范围。
- `cases.getPublic` / `cases.getSource` ＝TB2。
- Golden 系统案件种子（不走模型，直接由冻结 JSON 落库）＝TB2。
- 真实模型编译的默认套件不在 `bun test` 内（显式 `RUN_MODEL_INTEGRATION=1` 才运行，避免每次跑测试消耗模型调用）；tonight 已运行一次通过。

## 修改文件

- 新增：`server/source/normalize.ts`、`server/cases/{idempotency,quota,invites,hash}.ts`、`server/model/schemas/claim-extraction.ts`、`convex/{cases,publicErrors,admin}.ts`、`convex/auth.config.ts`、`tests/{tb1-source,tb1-creation,tb1-integration,tb1-compile-model}.test.ts`、`tests/helpers/convex-local.ts`。
- 变更：`convex/schema.ts`（业务表）、`tests/helpers/` 其余无。
- 本记录、`docs/handoffs/README.md`、`DEVELOPER_A_IMPLEMENTATION_PLAN.md`。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 第 5 节 TB1 → COMPLETE。
- 无契约/规格变更：实现完全依据 CONTRACTS 3、4.3–4.5、12、13.3 与 ENGINEERING_SPEC 5.1/8/9。

## 定向验证

- `bun test` — 61 pass / 0 fail / 1 skip（model 集成为显式 opt-in）：A1 纯函数矩阵、幂等哈希、额度矩阵、邀请码矩阵、以及本地后端集成 10 项（AUTH_REQUIRED/INVALID_ARGUMENT/SOURCE_INVALID×2/SOURCE_TOO_LONG/CASE_CREATION_NOT_ALLOWED/幂等重放/IDEMPOTENCY_CONFLICT/Owner 隔离/SERVICE_NOT_CONFIGURED 终态与失败重放/滚动额度/并发额度/全局日额度）。
- `RUN_MODEL_INTEGRATION=1 bun test tests/tb1-compile-model.test.ts` — **通过**（真实 DeepSeek 编译 64s：receipt → succeeded，图谱 ≥1 claims，每个 Span `validateSourceSpan` 可回溯，段落索引一致；结束后部署 AI_* 已移除）。
- `bun run typecheck` — 通过。
- 匿名身份链路：`auth:signIn` 签发的 JWT 经后端 JWKS 校验后 `getUserIdentity()` 可用（修复后首次真正验证，见下）。

## 已知风险、阻塞与下一步

- **PF1 验证修正**：PF1 当时的 smoke 只经 admin 路径验证了 token 签发，JWT 校验链路从未跑通。本次集成发现并修复两个缺口：① 缺 `convex/auth.config.ts`（后端 provider 发现）；② 缺 `JWKS` 环境变量且 `JWT_PRIVATE_KEY` 因 Windows `\r` 损坏（改用 `convex env set --from-file` + LF PEM 落库）。二者均只涉及本地部署配置与一个新文件，无代码回退。
- bun test（NODE_ENV=test）不自动加载 `.env.local`；需要 AI_* 的测试显式解析该文件（gitignored）。
- 多行环境变量经 Windows CLI argv 传递会被拆碎；一律用 `convex env set --from-file`。
- 下一步（按依赖前沿）：TB2 生产 Evidence Graph / Case Compiler——Golden 系统案件种子（冻结 JSON 直接落库，不走模型）、编译器完整校验（4+1/Policy/Catalog/rubric/Public Projection）、`cases.getPublic`/`cases.getSource`。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 3、4.3–4.5、12、13.3 节
3. `convex/cases.ts`、`server/source/normalize.ts`
4. `tests/tb1-integration.test.ts`
