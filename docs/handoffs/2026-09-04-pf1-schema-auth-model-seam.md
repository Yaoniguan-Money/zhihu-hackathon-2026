# PF1（第一批）：契约入口与模型 Seam

状态：`complete`（2026-09-04 完成实现；2026-09-05 完成运行时复验后关闭）  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **`shared/public/private` 物理入口与严格 runtime schema**：
  - `contracts/shared/index.ts` — 不透明 ID、UUID `client_action_id`、RFC 3339 `IsoDateTime`、`Sha256Digest`（`sha256:` + 小写 hex）、10 个 Distortion Type、8 个 Relation Type、`SourceSpan`（半开区间 refine）与 `validateSourceSpan`（`text === slice` 精确校验，不做模糊重定位）。
  - `contracts/public/index.ts` — PublicError（26 码）、CasePublic（roles 恰 5）、CaseCatalogItemPublic、CaseCompileReceipt / CaseCompilationStatusPublic（error 与 failed 绑定 refine）、SourceDocumentPublic、三类 Message 判别联合、EvidenceFragmentPublic、Board（placement 0..1、link 禁自连）、SessionView（reveal_available/terminal_error 与 phase 绑定 refine）、14 类 GameEventPayload 判别联合、FinalAccusation（非空且不重复 refine）、AskRoleArgs / PresentRecordingArgs / PublicRoleTurn、RevealResult（truth_chain 从 1 连续 refine）、TranscriptResultPublic。
  - `contracts/private/index.ts` — Claim/Relation/Graph、RolePrivatePolicy、GoldenAnswer、Unlock Rule、Evidence Catalog、CasePrivate（4+1 不变量 `assertPlayableCaseInvariants`）、CanonicalParagraphPrivate、候选/ValidationResult/Attempt/批准信封、TurnIntent（已无 `role_confrontation`）、EvidenceUnlockDecision、23 个私有失败码 + `PrivateFailure`、Voice 私有 IO。
  - 全部对象为 `strictObject`（未知字段拒绝）、枚举封闭、数值带边界；public 禁止字段（fidelity、visible/support claim、policy、validator 结果）均未出现。
- **八项显式 `AI_*` 配置**：`server/model-gateway/config.ts` 只读取 `AI_PROVIDER_NAME / AI_BASE_URL / AI_API_KEY / AI_CLAIM_MODEL / AI_CASE_MODEL / AI_ROLE_MODEL / AI_VALIDATOR_MODEL / AI_REVEAL_MODEL`；缺项/空白/非 HTTPS base URL → 私有失败 `MODEL_CONFIG_MISSING`（typed error，映射 `SERVICE_NOT_CONFIGURED`）；测试证明 `DEEPSEEK_API_KEY` 等其他环境变量不被读取、不构成配置。
- **生产 Model Gateway**：`server/model-gateway/openai-compatible-gateway.ts` — AI SDK `createOpenAICompatible` + `generateObject`，`maxRetries: 0`（无 SDK 自动重试），请求失败 → `MODEL_REQUEST_FAILED`，输出经调用方 schema 复验失败 → `MODEL_PROTOCOL_INVALID`；无 JSON 修复、无供应商切换。
- **Scripted Adapter（仅测试）**：`tests/helpers/scripted-model-gateway.ts` 位于 tests/ 构建路径之外，队列耗尽/任务不匹配/schema 不匹配均显式失败；由测试显式注入。
- **Convex Anonymous Auth（代码就绪）**：`convex/schema.ts` 挂载 `authTables`；`convex/auth.ts` `convexAuth({ providers: [Anonymous] })`（ADR 0004）；`convex/http.ts` `auth.addHttpRoutes(http)`。typecheck 通过。
- **依赖固定**：`zod@4.5.4`、`ai@7.0.92`、`@ai-sdk/openai-compatible@3.0.43`、`@convex-dev/auth@0.0.95`、`@auth/core@0.41.1`（peer 兼容已核对）。
- **验证**：`bun run typecheck` 通过；`bun test` 26 pass / 0 fail（契约不变量、配置矩阵、gateway 行为）。

## 明确未完成（阻塞点）

~~Convex Auth 的 push 与运行时 smoke~~ **已于 2026-09-05 解除**：见下方「2026-09-05 复验记录」。当时评估的 `convex dev` 交互登录方案最终未使用——真正的根因是非 ASCII 项目路径导致 adminKey 含汉字、CLI 崩溃；迁移 ASCII 路径后以自托管直连方式完成验证（根因与启动命令见 [2026-09-05-workspace-ascii-path](./2026-09-05-workspace-ascii-path.md)）。

- **八项 `AI_*` 的真实值**：待用户提供后才能做真实供应商 smoke（TB2/发布 Gate 要求）。此项为外部输入，不影响 PF1 关闭。
- 未创建任何业务表、业务 action、页面或 XState（TB1+ 范围）。

## 2026-09-05 复验记录（解除阻塞、标记 COMPLETE）

在迁移后的 ASCII 工作区 `D:\Users\yaoni\Desktop\zhihu-hackathon` 重启本地后端并复验：

- `convex-local-backend.exe`（precompiled-2026-08-25-7cce8fb）以 `--instance-name anonymous-zhihu-hackathon` 启动，监听 3210/3211；`curl /version` 与 `/.well-known/openid-configuration` 均响应。
- `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 CONVEX_SELF_HOSTED_ADMIN_KEY=<本地 adminKey> bunx convex dev --once` — 推送成功，输出 `Convex functions ready!`，authTables 无兼容错误。
- `bunx convex run auth:signIn '{"provider":"anonymous"}'` — 成功返回 `{tokens:{token,refreshToken}}`（RS256 JWT，issuer `http://127.0.0.1:3211`）。
- `bun run typecheck` 通过；`bun test` 26 pass / 0 fail。
- 本地部署的 adminKey/instanceSecret/JWT_PRIVATE_KEY 仅存于 gitignored 的 `.convex/` 与本地部署环境，未进入任何文档或仓库文件。

## 修改文件

- `contracts/shared/index.ts`、`contracts/public/index.ts`、`contracts/private/index.ts` — 新建三个契约物理入口。
- `server/model-gateway/config.ts`、`server/model-gateway/openai-compatible-gateway.ts` — 新建模型 Seam。
- `tests/helpers/scripted-model-gateway.ts`、`tests/contracts.test.ts`、`tests/model-gateway.test.ts` — 测试组合根。
- `convex/schema.ts`（挂载 authTables）、`convex/auth.ts`、`convex/http.ts` — Convex Auth 代码。
- `package.json`、`bun.lock` — 新增固定依赖。
- `tsconfig.json` — `@contracts/*`、`@server/*` 路径别名。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — PF1 READY → IN PROGRESS（第 2、5 节）。
- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。

## 权威文档更新

无规范变更——实现完全依据已冻结的 `docs/developer-a/CONTRACTS.md` 与 `ENGINEERING_SPEC.md`；契约文本零改动。

## 定向验证

- `bun run typecheck`（`tsc --noEmit`，含 contracts/server/convex/auth/tests 全部源）— 通过。
- `bun test` — 26 pass / 0 fail：Span 不变量、CasePublic 五角色、SessionView phase 绑定、FinalAccusation/RevealResult refine、可玩案件 4+1 不变量矩阵、八项配置缺失矩阵、外来环境变量不读取、Scripted 队列语义。
- `convex env list` — 确认未配置 deployment（Auth push 阻塞事实依据）。

## 已知风险、阻塞与下一步

- ai SDK 为 v7（`generateObject` 仍在导出且带 schema 校验）；若未来升级引入 API 变化，以本批测试为回归线。
- Convex Auth 0.0.95 处于 beta：固定版本 + push smoke 已通过（见上方复验记录）；后续升级仍须重跑该 smoke。
- 下一位 Agent 起点（按依赖前沿，PF1 已关闭）：
  1. GC0 标注草案（claims/relations/roles/policies/Evidence Catalog/truth/rubric/fixture，依据 `golden-case/case-demo-001/source.md`，经用户确认后冻结）；
  2. 用户提供八项 `AI_*` 配置值（进入 TB1/TB2 真实模型验证前必须）。

## 最小接手阅读顺序

1. `docs/developer-a/CONTRACTS.md`
2. `contracts/`（三个入口与其注释中的 CONTRACTS 节号）
3. `server/model-gateway/`、`tests/`
4. `docs/handoffs/2026-09-04-pf0-toolchain-skeleton.md`
5. 本记录
