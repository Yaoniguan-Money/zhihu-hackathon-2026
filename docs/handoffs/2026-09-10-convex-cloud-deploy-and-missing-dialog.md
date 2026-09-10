# 2026-09-10：Convex Cloud prod 部署 + 补交 ModelSettingsDialog

状态：`complete`  
完成时间：`2026-09-10`  
负责人：`Developer A (agent)`

## 实际完成

- 将 BYOK 代码（`convex/userModelConfig.ts`、删除 `convex/aiConfig.ts` 后的最新 schema 与 functions）部署到 Convex Cloud prod 部署 `agile-turtle-860`（https://agile-turtle-860.convex.cloud）。推送完成，schema validation 通过，新增索引 `ai_user_provider_config.by_owner (owner_identity, _creationTime)`。
- 线上 `function-spec` 确认 `cases.js:listMine`、`userModelConfig.js:myModelConfig / saveUserModelConfig / clearUserModelConfig / writeUserConfig / resolveUserRegistry` 均已存在。
- 补交并推送 `components/settings/ModelSettingsDialog.tsx`（commit `3379b99`）。此前 `e14c1e0` 只提交了 `app/page.tsx` 与 `app/game/layout.tsx` 的 import，组件文件本身漏 add，导致克隆仓库后构建失败。

## 明确未完成

- `cases.listMine` 线上 Server Error 的端到端复验：部署后 schema 与代码应当一致（本地 dev 一直正常），但需要 B 侧用登录态在浏览器里实际刷新验证。若仍报错，需查 Convex dashboard 的 function logs 而不是继续猜测。

## 修改文件

- `components/settings/ModelSettingsDialog.tsx` — 补交漏 add 的组件原版（具名导出 `ModelSettingsButton`，默认导出 `ModelSettingsDialog`），与 `app/page.tsx`、`app/game/layout.tsx` 的 import 匹配。

## 权威文档更新

无规范变更（纯部署运维 + 补交已实现的文件，契约、行为、术语均未变）。

## 定向验证

- `npm run typecheck` — 通过（无错误）。
- `CONVEX_DEPLOYMENT=prod:agile-turtle-860 npx convex deploy` — 部署成功，"Deployed Convex functions to https://agile-turtle-860.convex.cloud"，新增 `ai_user_provider_config.by_owner` 索引。
- `CONVEX_DEPLOYMENT=prod:agile-turtle-860 npx convex function-spec` — 线上函数列表含 `cases.js:listMine` 与全部 `userModelConfig.js:*`。
- `git push origin main` — `3379b99` 已推送。

## 已知风险、阻塞与下一步

- B 侧本地自建的临时 ModelSettingsDialog 在 pull `3379b99` 时会与本文件冲突：请先删除临时版本再 pull，以仓库原版为准。
- 部署命令备注：CLI 1.45.0 的 `convex deploy` 不接受 `--prod`，需用 `CONVEX_DEPLOYMENT=prod:agile-turtle-860` 环境变量指定目标。
- 本仓库 `.env.local` 含本地联调密钥（DeepSeek key、AI_ADMIN_SECRET），仅限本地，不得提交或写入任何记录。
- 下一步：B 侧 pull 后刷新页面验证 `myModelConfig` 弹窗与 `cases.listMine`；若 `listMine` 仍失败，在 Convex dashboard (t/8-88/zhihu-hackathon-2026/agile-turtle-860) 查 function logs 定位。
