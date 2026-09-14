# AUTH1：生产凭证写入 + 回调回大厅

状态：`blocked`（生产凭证与回调已对齐赛事页主站根地址；待用户本人真机授权）  
完成时间：`2026-09-14`  
负责人：`ZCode（用户会话）`

## 实际完成

- 用户从赛事页提供 App ID（公开短数字 `596`）与 OAuth App Key（长度 32）。形态核对通过：App ID 未写入 `ZHIHU_OAUTH_APP_KEY`，App Key 未写入 `ZHIHU_ACCESS_SECRET`。
- 生产 Convex `agile-turtle-860` 已设置三项：
  - `ZHIHU_OAUTH_APP_ID` length=3
  - `ZHIHU_OAUTH_APP_KEY` length=32
  - `ZHIHU_OAUTH_REDIRECT_URI=https://zhihu-hackathon.yaoniguan56.workers.dev/`（赛事页实际登记值，含尾斜杠）
- App Key 经临时文件 `--from-file` 写入，未进仓库、未进回复。`.env.local` 只保留公开 App ID 与回调地址，App Key 留空（真实换 token 只走 Convex 生产环境）。
- 用户确认赛事页登记的是游戏主站根地址 `https://zhihu-hackathon.yaoniguan56.workers.dev/`，不是独立回调 Worker。已把生产 `ZHIHU_OAUTH_REDIRECT_URI` 改为该值。
- 新增 `proxy.ts`：根路径收到 `authorization_code`/`code` 时 rewrite 到 `/api/auth/zhihu/callback`，不改浏览器可见登记 URL。
- `/api/auth/zhihu/callback` 完成后 302 回主站 origin `/`，不再跳独立回调 Worker。
- 无授权码访问大厅仍 200；假授权码+假 state 走契约失败 `stage=state_invalid` 并 302 回大厅。

## 明确未完成

- 真机授权：用户本人在线上大厅点「知乎登录」，在知乎授权页亲自确认。Agent 不得代点。
- 本地/dev Convex 未写入 App Key，本地大厅不能完成真实登录（符合官方：localhost 不能当真回调）。
- B 对大厅徽章 UI 的评审仍待。

## 修改文件

- `proxy.ts`（新）— 根路径授权码 rewrite 到既有回调路由。
- `app/api/auth/zhihu/callback/route.ts` — 完成后 302 回主站 origin `/`。
- `.env.local`（gitignore）— 公开 App ID 与主站根回调；App Key 不落盘。
- 生产 Convex env（不入库）— 三项 `ZHIHU_OAUTH_*`，`REDIRECT_URI` 为主站根地址。
- `docs/auth1-design-draft.md`、`DEVELOPER_A_IMPLEMENTATION_PLAN.md`、`README.md`、既有 AUTH1 / 回调 Worker / REL2 handoff — 状态同步。

## 权威文档更新

- `docs/auth1-design-draft.md` — 外部前置：App ID/Key 已写入生产；回调改为赛事页登记的主站根地址。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — AUTH1 剩余为真机授权。
- 无契约 / ADR / 计划顺序变更。

## 定向验证

- `npx convex env list --env-file .convex/prod-deploy.env` — `ZHIHU_OAUTH_APP_ID` length=3、`APP_KEY` length=32、`REDIRECT_URI=https://zhihu-hackathon.yaoniguan56.workers.dev/`。
- `GET https://zhihu-hackathon.yaoniguan56.workers.dev/` — 200 大厅。
- `GET https://zhihu-hackathon.yaoniguan56.workers.dev/?authorization_code=dummy&state=dummy` — 302 `?zhihu_auth=failed&stage=state_invalid`。
- `GET /api/auth/zhihu/callback?authorization_code=dummy&state=dummy` — 同上。

## 已知风险、阻塞与下一步

- 赛事页登记值必须与生产 `ZHIHU_OAUTH_REDIRECT_URI` 逐字符一致；当前对齐主站根地址（含尾斜杠）。
- 登录成功绑定写在 Convex `zhihu_bindings`，大厅徽章从 `zhihuMe` 读取；用户必须在**同一浏览器会话**从线上大厅发起登录。
- 下一步：打开 https://zhihu-hackathon.yaoniguan56.workers.dev → 点「知乎登录」→ 用户本人点知乎授权确认。

## 最小接手阅读顺序

1. `docs/handoffs/2026-09-14-zhihu-oauth-login.md`
2. `docs/handoffs/2026-09-14-zhihu-oauth-callback-worker.md`
3. 本记录
4. 线上大厅点「知乎登录」做真机验收
