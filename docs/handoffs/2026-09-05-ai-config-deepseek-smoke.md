# 2026-09-05-ai-config-deepseek-smoke：AI_* 显式配置落地与真实供应商 smoke

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **用户明确决定**：本机已有 DeepSeek 相关 API，指示查找并使用（当前用户决定为最高优先级）。生产代码行为不变：仍只读取八个 `AI_*` 变量名，`DEEPSEEK_API_KEY` 本身不被读取（对应测试保持有效）。
- **发现**：本机用户级环境变量已存在 `DEEPSEEK_API_KEY`（另有 `DASHSCOPE_API_KEY`）；项目根已有 gitignored `.env.local`（仅含本地 Convex URL）。该 key 经 `GET https://api.deepseek.com/models` 验证有效（HTTP 200），账号可用模型：`deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-v4-flash-vision-exp`。
- **八项 `AI_*` 显式配置**已写入 gitignored 的 `.env.local`（`.gitignore` 覆盖 `.env*`）：
  - `AI_PROVIDER_NAME=deepseek`、`AI_BASE_URL=https://api.deepseek.com/v1`
  - `AI_API_KEY` ← 本机 `DEEPSEEK_API_KEY` 的值（写入时从环境变量引用，未出现在任何文档、命令输出或 commit）
  - 模型映射（初版显式映射，可在 `.env.local` 调整）：claim/case/reveal = `deepseek-v4-pro`；role/validator = `deepseek-v4-flash`
- **新增 `scripts/model-smoke.ts`**：可重复执行的真实供应商 smoke 工具（读 env、经生产 `OpenAICompatibleModelGateway` 走一次 `generateObject` 并做 schema 复验；不含任何 secret，可提交）。

## 明确未完成

- 无（本环节范围）。GC0 草案确认与冻结仍待用户（见 [2026-09-05-gc0-annotation-draft](./2026-09-05-gc0-annotation-draft.md)）。

## 修改文件

- `.env.local` — 追加八项 `AI_*`（gitignored，不入库）。
- `scripts/model-smoke.ts` — 新增。
- `docs/handoffs/README.md` — 索引新增本记录。
- `docs/handoffs/2026-09-04-pf1-schema-auth-model-seam.md`、`docs/handoffs/2026-09-05-workspace-ascii-path.md`、`docs/handoffs/2026-09-05-gc0-annotation-draft.md` — 各补一条「AI_* 已配置」的事实修正。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 第 5 节 PF1 行补真实供应商 smoke 结果。

## 权威文档更新

无规范变更——配置与工具落地，未改契约、规格或实施顺序。

## 定向验证

- `curl https://api.deepseek.com/models`（Bearer 本机 key）— HTTP 200，返回 V4 系列模型列表。
- `bun scripts/model-smoke.ts` — 通过：返回 `{"verdict":"pass","note":"连通性验证成功"}`，耗时 3390ms，输出经 generateObject 解析 + gateway 二次 schema 复验。
- `bun run typecheck` 通过；`bun test` 26 pass / 0 fail（含「DEEPSEEK_API_KEY 不被读取」断言）。
- `git status` — `.env.local` 不在跟踪范围；仅新增 `scripts/`。

## 已知风险、阻塞与下一步

- **AI SDK 能力警告**：`The feature "responseFormat" is not supported. JSON response format schema is only supported with structuredOutputs`——`@ai-sdk/openai-compatible` 未声明 DeepSeek 的 JSON responseFormat 能力，SDK 对该 provider 使用 prompt 注入 JSON 的方式生成。输出仍经严格 schema 复验（失败即 `MODEL_PROTOCOL_INVALID`），契约不变量不受影响；若后续真实使用中出现格式失败率，再在 adapter 层显式启用结构化输出（代码变更，非运行时兜底）。
- `.env.local` 仅对 Bun/Next 进程自动加载；**TB1+ 在 Convex action 内调用模型时**，需用 `bunx convex env set` 把八项显式设置进本地部署（届时执行，值不进仓库与文档）。
- 下一步：用户按九项清单确认 GC0 标注 → 冻结 → TB1 开工（PF1 与 AI 配置均已就绪）。

## 最小接手阅读顺序

1. `server/model-gateway/config.ts`（八项显式配置语义）
2. 本记录
3. `docs/handoffs/2026-09-04-pf1-schema-auth-model-seam.md`
