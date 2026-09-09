# BYOK-2026-09-09：模型 API 配置下放给用户（用户必须配置）+ 契约文档治理

状态：`complete`
完成时间：`2026-09-09`
负责人：`ZCode（开发人员 A 侧执行，用户逐项拍板）`

## 实际完成

- **契约文档治理（用户明确决定）**：《证据链狼人杀_产品技术分工开发流程与数据接口_v2.0.md》与 `docs/developer-a/` 全部 5 个文件已复制到仓库外归档（`D:\Users\yaoni\Desktop\zhihu-hackathon-契约文档归档-2026-09-09\`，逐文件 `cmp` 校验一致）后从仓库删除；AGENTS.md、README.md、DEVELOPER_A_IMPLEMENTATION_PLAN.md 的悬挂引用全部改锚到 `contracts/` 运行时 schema + `docs/adr/`。
- **ADR 0005（accepted）**：模型配置唯一运行时来源 = 调用者本人的 `ai_user_provider_config` 行；无系统回退；保存前必须真实探针；Key 只存服务端只回掩码；每次模型调用实时解析。
- **服务端**：Convex 新表 `ai_user_provider_config`（`by_owner` 索引，已推送到本地后端并删除旧 `ai_provider_config` 索引）；`convex/userModelConfig.ts`（`myModelConfig` 掩码视图 / `saveUserModelConfig` 探针成功才落库 / `clearUserModelConfig` / `writeUserConfig` / `resolveUserRegistry`）；`server/model-gateway/config.ts` 新增 `userModelConfigInputSchema` + `buildUserRegistry`；`server/model-gateway/user-config.ts`（可判别结果的核心校验+探针流程，测试可注入 Scripted Adapter）；`server/model-gateway/user-config-probe.ts`（最小结构化探针）。
- **网关接线**：`convex/aiRuntime.ts` 的 `modelGatewayFor(ctx, ownerIdentity)` 只按 owner 实时解析，无配置抛 `MODEL_CONFIG_MISSING`（incident `cfg:user-not-configured`）→ 公开 `SERVICE_NOT_CONFIGURED`；四个模型调用点全部传入发起者身份并在调用时实时解析：`cases.ts` compileCaseWorker、`roleTurns.ts` roleTurnWorker（两处调度）、`game.ts` openingWorker、`reveal.ts` accuseCore。
- **管理台下线**：删除 `convex/aiConfig.ts`、`app/admin/providers/page.tsx`、`convex/admin.ts` 的 `debugModelProbe`；`contracts/private/index.ts` 移除 `ADMIN_NOT_CONFIGURED`/`ADMIN_SECRET_INVALID`。未新增任何公开错误码（`contracts/public/index.ts` 零改动）。
- **前端**：新组件 `components/settings/ModelSettingsDialog.tsx`（齿轮按钮 + 弹窗：状态区/表单/高级折叠/测试并保存/清除配置，portal + `role="dialog"`）；`Icons.tsx` 新增 `settings` 齿轮图标；挂载于大厅右面板标题行（`app/page.tsx`）与对局 header（`app/game/layout.tsx`）；`lib/convex-errors.ts` 的 `SERVICE_NOT_CONFIGURED`/`SERVICE_UNAVAILABLE` 文案改为引导用户去设置。
- **测试辅助**：`tests/helpers/convex-local.ts` 的 `clearAiProviderRegistry`（依赖已删的全局注册表）替换为 `clearUserModelConfig(token)`，六个集成测试同步更新。

## 明确未完成

- 真实供应商的**建案→回合→Reveal 全链路**人工冒烟未跑（需要用户在真实对局中验证；探针与保存链路已用真实 DeepSeek 供应商验证通过）。
- Convex Cloud 生产部署未执行（本次只推送了本地后端；上线需对生产 deployment 重新 `convex dev`/部署，并同步删除生产库的旧 `ai_provider_config` 数据语义依赖）。
- `.env.local` 中的 `AI_ADMIN_SECRET` 已无消费者，留待用户自行移除（未代改）。

## 修改文件

- `AGENTS.md` / `README.md` / `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 文档治理后引用改锚。
- `docs/adr/0005-user-supplied-model-config.md` — 新增（见下）。
- `contracts/private/index.ts` — 移除两个 ADMIN_* 私有失败码。
- `convex/schema.ts` — 删 `ai_provider_config`，增 `ai_user_provider_config`。
- `convex/userModelConfig.ts`（新）、`convex/aiRuntime.ts`（重写）、`convex/cases.ts`、`convex/roleTurns.ts`、`convex/game.ts`、`convex/reveal.ts` — BYOK 解析与身份传参。
- `convex/aiConfig.ts`、`app/admin/providers/page.tsx`（删除）；`convex/admin.ts`（移除 debugModelProbe）。
- `server/model-gateway/config.ts`、`server/model-gateway/user-config.ts`（新）、`server/model-gateway/user-config-probe.ts`（新）。
- `components/settings/ModelSettingsDialog.tsx`（新）、`components/ui/Icons.tsx`、`app/page.tsx`、`app/game/layout.tsx`、`lib/convex-errors.ts`。
- `tests/helpers/convex-local.ts` + 六个集成测试（tb1/tb4/tb7/tb10/p11-recording/p13b）— 前置清理改按用户清配置。
- `tests/model-gateway-user-config.test.ts`（新）— buildUserRegistry 与探针流程单测。

## 权威文档更新

- `docs/adr/0005-user-supplied-model-config.md`（accepted）— BYOK 全部决议；取代 ADR 0003 补充决议第 2、3 条的运行时部分（全局注册表覆盖层与 AI_ADMIN_SECRET 门控下线；八项 env 仅保留给 `scripts/model-smoke.ts` 开发者冒烟）。
- `AGENTS.md` — 必读顺序改为「CONTEXT.md → 用户明确决定 → ADR」；运行时 schema 为形状唯一事实来源；归档决定已注明。

## 定向验证

- `bun test tests/model-gateway-user-config.test.ts tests/model-gateway.test.ts tests/contracts.test.ts` — 18 pass（注册表合成、探针成功/非法输入/探针失败可判别结果、私有失败码枚举）。
- `bun run typecheck` — 0 error（含修复 Convex action 无 `ctx.db` 后经 internal mutation 落库、断开 api 类型循环推断）。
- `bun test`（全量）— 168 pass / 11 skip / 0 fail。
- 本地后端端到端（临时脚本，已删）：非法 URL → `INVALID_ARGUMENT`；假端点 → `SERVICE_UNAVAILABLE` 且不落库；真实 DeepSeek 供应商 → 探针成功落库、掩码回读 `sk-a****43e4`、留空 Key 沿用再保存成功、清除成功。
- 浏览器冒烟（dev server + Browser Use）：大厅齿轮按钮出现；弹窗打开显示「未配置」；填写真实配置 →「已通过连通性测试并保存」→ 状态区变「已配置」+ 掩码 Key + 时间戳；「清除配置」回到「未配置」；全程无 React 报错。
- grep 残留：`aiConfig|ADMIN_NOT_CONFIGURED|ADMIN_SECRET_INVALID|debugModelProbe|ai_provider_config|clearAiProviderRegistry` 代码零残留；入口文档零悬挂引用。

## 已知风险、阻塞与下一步

- **行为变化（用户已确认）**：未配置模型的用户无法建案、无法生成任何角色发言（含系统预置案件）；相关公开错误为 `SERVICE_NOT_CONFIGURED`，文案引导去设置。
- 配置按匿名身份（tokenIdentifier）隔离：清浏览器存储会换新身份，旧配置不跟随。
- 本地后端库中残留旧 `ai_provider_config` 表数据（schema 已删，无消费路径）；生产部署时注意同步推送本 schema。
- 下一位 Agent 起点：跑一次真实对局全链路（设置 → 建案 → 开场 → 审讯 → 指控/Reveal），确认 BYOK 在 Convex Cloud 生产 deployment 的推送；随后可移除 `.env.local` 的 `AI_ADMIN_SECRET`。

## 最小接手阅读顺序

1. `docs/adr/0005-user-supplied-model-config.md`（本次全部语义）
2. `convex/userModelConfig.ts` + `convex/aiRuntime.ts`（解析链与写入链）
3. `server/model-gateway/user-config.ts`（保存核心流程）
4. `components/settings/ModelSettingsDialog.tsx`（前端入口）
