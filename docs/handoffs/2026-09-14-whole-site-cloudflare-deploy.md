# REL2：整站部署到 Cloudflare Workers（国内可访问的游戏入口）

状态：`complete`（整站公网可玩已验证；语音与知乎 OAuth 登录为预期内不可用，见"明确未完成"）  
完成时间：`2026-09-14`  
负责人：`ZCode（用户会话）`

## 实际完成

- 主站以 OpenNext（`@opennextjs/cloudflare@1.20.6`）部署到 Cloudflare Workers：
  **https://zhihu-hackathon.yaoniguan56.workers.dev**（免费 `*.workers.dev`，国内可打开）。
- 部署前把最新 Convex 函数推到生产 `agile-turtle-860`（`npx convex deploy --env-file .convex/prod-deploy.env`，
  deploy key 来自 `.convex/deploy-key.env`；`.env.local` 的 `CONVEX_DEPLOYMENT=anonymous:...` 需要
  env-file 覆盖才能指向生产）。
- 客户端构建以生产地址内联：`NEXT_PUBLIC_CONVEX_URL=https://agile-turtle-860.convex.cloud`、
  `NEXT_PUBLIC_CONVEX_SITE_URL=https://agile-turtle-860.convex.site`（构建命令行变量覆盖 `.env.local` 的本地地址）。
- Worker 运行时变量：`CONVEX_SITE_URL` 与两个 `NEXT_PUBLIC_*` 写入 `wrangler.jsonc` 的 `vars`；
  机密 `ZHIHU_ACCESS_SECRET` 用 `wrangler secret put` 设置。`VOICE_WORKER_URL` 刻意不设
  （语音 Worker 只绑 127.0.0.1，线上走契约允许的文字路径）。
- 修复三处阻塞构建/运行的问题（见"修改文件"）：
  1. `app/api/zhihu/import/route.ts` 的 `@server/source/zhihu-import.js`（带 `.js` 后缀的别名请求
     Turbopack 构建解析不了，改为与其他路由一致的无后缀形式）；
  2. `server/model-gateway/openai-compatible-gateway.ts` 的 `tool({ schema })` → `tool({ inputSchema })`
     （2026-09-11 MODEL-JSON-ENFORCEMENT 提交时字段名写错，typecheck 一直红；`schema` 会被 SDK
     忽略，等于 tool-calling 强制 JSON 实际没生效，本次修正后真正按设计传递完整 schema）；
  3. `next.config.ts` 增加 `turbopack.resolveAlias` 把 `convex/browser` 固定解析到
     `./node_modules/convex/dist/esm/browser/index.js`。根因：`@convex-dev/auth/react` 以
     `import { ConvexHttpClient } from "convex/browser"` 引入，服务端（node 条件）解析到
     convex 内联了 `ws` 的 `index-node.js`，在 Workers 模块求值即崩
     （`Class extends value [object Module]`）——这正是 2026-09-14 回调 Worker 交接里
     "整站 OpenNext + Convex ws/node:https 500" 的根因。browser 版入口用全局 WebSocket，
     Node 24 与 Workers 均可用；浏览器侧解析结果本就是同一文件，行为不变。
- 真机验收（ZCode 内置浏览器打开线上地址）：
  - 大厅正常渲染，案件卡片来自生产 Convex（「AI 与就业」「养老金改革迷局」）；
  - 案情简报 → 开庭 → 进入审讯室，五条开场陈述经真实模型（DeepSeek，走 BYOK 设置）
    并行生成并呈堂（Opening 1/5 呈堂、已解锁证据 4、审讯记录 1 条）。
- Worker 体积 9.6MB 原始 / 1.94MB gzip，免费额度内；Startup Time 28ms。

## 明确未完成

- **BYOK 是产品契约（ADR 0005）**：`convex/aiRuntime.ts` 只从调用者本人的
  `ai_user_provider_config` 解析模型配置，无环境变量/全局回退。因此**每个访客第一次玩之前
  必须点右上角齿轮填写自己的模型 API（Base URL / API Key / 模型名）**，测试通过即保存生效。
  若要"访客零配置直接玩"，需要用户决定推翻/修订 ADR 0005（例如由房主提供共享配置），属产品决策，未擅自实施。
- **语音不可用（预期内）**：voice-worker 仅本机 127.0.0.1，线上按契约展示错误并保留文字路径。
- **知乎 OAuth 登录待真机授权**：生产凭证已写入，回调已对齐赛事页主站根地址
  `https://zhihu-hackathon.yaoniguan56.workers.dev/`（见 [凭证 handoff](./2026-09-14-zhihu-oauth-credentials.md)）。
- 旧 Vercel 入口 `https://zhihu-hackathon-2026.vercel.app` 仍在（内容落后于当前代码，未再部署）。

## 修改文件

- `open-next.config.ts`（新增）、`wrangler.jsonc`（新增）— 整站 Worker 构建与部署配置；
  根目录执行 wrangler 命令即作用于主站，`workers/wrangler.callback.jsonc`（OAuth 回调 Worker）不受影响。
- `package.json` — devDependencies 增加 `@opennextjs/cloudflare@^1.20.6`（`wrangler` 上一环节已加）。
- `next.config.ts` — 增加 `turbopack.resolveAlias["convex/browser"]`（详见上）。
- `app/api/zhihu/import/route.ts` — 别名导入去 `.js` 后缀（行为无变化）。
- `server/model-gateway/openai-compatible-gateway.ts` — `tool()` 字段名 `schema` → `inputSchema`（修正设计意图的运行时行为）。
- `.convex/prod-deploy.env`（新增，未入库不入 git 均可）— `CONVEX_DEPLOYMENT=prod:agile-turtle-860`，
  供 `npx convex deploy --env-file` 覆盖 `.env.local` 的本地部署指向。

## 权威文档更新

- `README.md` — 「线上入口」改为本 Workers 地址，状态区增加 REL2 记录。
- 本记录；无契约 / ADR / 计划顺序变更。

## 定向验证

- `npx convex deploy --env-file .convex/prod-deploy.env` — ✔ 部署到 `https://agile-turtle-860.convex.cloud`。
- `npx convex env list`（生产）— 8 项 `AI_*`、`JWKS/JWT_*`、`ZHIHU_OAUTH_REDIRECT_URI` 在位；
  `ZHIHU_OAUTH_APP_ID/APP_KEY` 缺（符合 AUTH1 交接预期）。
- `bun run typecheck` — 修复后 0 错误。
- `curl https://zhihu-hackathon.yaoniguan56.workers.dev/` — 200，标题「证据链狼人杀 - Evidence Chain」。
- `GET /api/auth/zhihu/callback` — 503 `{"zhihu_auth":"failed","stage":"service_not_configured"}`（缺 App ID/Key 的契约失败，链路通）。
- `POST /api/zhihu/import`（非法体）— 400 `INVALID_ARGUMENT`（nodejs 运行时路由正常）。
- 浏览器真机：大厅加载生产案件 → 简报 → 开庭 → 审讯室真实模型开场陈述（见上）。
- 注意：Workers 边缘会把部署早期的 500 缓存数分钟；验证新版本时带随机 query 参数或等缓存过期。

## 已知风险、阻塞与下一步

- 免费额度：Workers 免费档 10 万请求/天、100 CPU ms/次（当前 Startup 28ms，页面为静态资产 + 少量 SSR，够用但黑客松流量高峰未测）。
- 模型稳定性受供应商免费档影响（README REL1 已知），与部署无关。
- 下一步（外部）：赛事页登记回调 → 真机验收知乎登录（凭证已写入，见 [凭证 handoff](./2026-09-14-zhihu-oauth-credentials.md)）；如需访客零配置游玩，先做 ADR 0005 修订决策。
- 重新部署流程：`NEXT_PUBLIC_CONVEX_URL=https://agile-turtle-860.convex.cloud NEXT_PUBLIC_CONVEX_SITE_URL=https://agile-turtle-860.convex.site bun x opennextjs-cloudflare build && bun x opennextjs-cloudflare deploy`。

## 最小接手阅读顺序

1. `docs/handoffs/2026-09-14-zhihu-oauth-callback-worker.md`
2. `convex/aiRuntime.ts`（BYOK 契约）与 `docs/adr/0005`（用户模型配置）
3. `wrangler.jsonc` / `open-next.config.ts` / 本记录
