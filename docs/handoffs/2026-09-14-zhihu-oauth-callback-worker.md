# AUTH1-CALLBACK：国内可访问的知乎 OAuth 回调（免费 Cloudflare Worker）

状态：`complete`（回调公网 HTTPS 已上线并探测通过；整站 Cloudflare 部署失败，未宣称完成）  
完成时间：`2026-09-14`  
负责人：`ZCode（用户会话）`

## 实际完成

- 生产 Convex `agile-turtle-860` 已部署 AUTH1 函数与表（`zhihu_oauth_states`、`zhihu_bindings`）。
- 部署独立 Cloudflare Worker `zhihu-oauth-callback`（免费 `*.workers.dev`，国内可打开）。
- 生产环境已设置 `ZHIHU_OAUTH_REDIRECT_URI=https://zhihu-oauth-callback.yaoniguan56.workers.dev/api/auth/zhihu/callback`。
- 回调 Worker 服务端转发到 `https://agile-turtle-860.convex.site/api/auth/zhihu/callback`；浏览器不必访问 Vercel 或 Convex site。
- 未购买域名。

## 明确未完成

- 赛事页仍须登记同一回调地址。
- App ID / App Key 已写入生产 Convex（2026-09-14 凭证环节）；无授权码访问回调仍显示就绪页，不打 Convex。
- 整站未迁到 Cloudflare：OpenNext + Convex `ws`/`node:https` 在 Workers 上 500；这不影响 OAuth 回调登记。
- 真机授权验收仍待 App ID / App Key。

## 修改文件

- `workers/zhihu-oauth-callback.js`、`workers/wrangler.callback.jsonc` — 独立回调 Worker。
- `app/api/auth/zhihu/callback/route.ts` — 服务端 fetch 上游，不再 302 到 Convex site。
- `package.json` — 增加 `wrangler` 以便维护该 Worker。
- 生产 Convex env `ZHIHU_OAUTH_REDIRECT_URI`（不入库）。

## 权威文档更新

- 本记录；`docs/handoffs/2026-09-14-zhihu-oauth-login.md` 回调地址改为 Cloudflare Worker。
- 无契约 / ADR / 计划顺序变更。

## 定向验证

- `GET https://zhihu-oauth-callback.yaoniguan56.workers.dev/` — 200，说明页含完整回调地址。
- `GET https://zhihu-oauth-callback.yaoniguan56.workers.dev/api/auth/zhihu/callback` — 200 HTML「知乎登录回调已就绪」。
- `GET https://agile-turtle-860.convex.site/api/auth/zhihu/callback` — 503 `service_not_configured`（AUTH1 已上线，缺 App ID/Key，符合契约）。

## 已知风险、阻塞与下一步

- 用户把该回调填进赛事页后，直接在线上大厅点「知乎登录」做真机验收（凭证已写入，见 [凭证 handoff](./2026-09-14-zhihu-oauth-credentials.md)）。
- 登录成功/失败后的 302 由回调 Worker 改写到游戏大厅 `https://zhihu-hackathon.yaoniguan56.workers.dev/`（2026-09-14 凭证环节）。赛事页登记地址仍必须是本 Worker 回调，不得改成游戏 origin。

## 最小接手阅读顺序

1. `docs/handoffs/2026-09-14-zhihu-oauth-login.md`
2. 本记录
3. `workers/zhihu-oauth-callback.js`
