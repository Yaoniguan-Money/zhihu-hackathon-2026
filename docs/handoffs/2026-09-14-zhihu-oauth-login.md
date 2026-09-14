# AUTH1：知乎 OAuth 登录（代码完成，待上线配置）

状态：`blocked`（代码与定向验证完成；上线依赖外部配置步骤，见「明确未完成」）  
完成时间：`2026-09-14`  
负责人：`ZCode（用户会话）`，基于 `docs/auth1-design-draft.md` 初稿

## 实际完成

- 契约先行：`contracts/public/index.ts` 新增 `zhihuProfilePublicSchema`（含 `expires_at` 可 null）与 `zhihuAuthorizeReceiptSchema`；浏览器可见投影不含 access_token 等服务端字段。
- 纯函数协议层 `server/zhihu/oauth.ts`：授权 URL 构造（response_type=code、state）、`/access_token` 表单构造（grant_type 固定枚举、code 字段承载授权码）、token 响应解析（access_token 成功判定、兼容 data 信封、code:20000 不判失败、expires_in 缺失为 null）、`/user` 响应解析（hash_id 优先；uid int64 在原始文本上无损提取）、回跳 URL（成功 `?zhihu_auth=success`；失败带 6 值闭环 stage 枚举）、HTTPS-only 回调校验。
- Convex 编排 `convex/zhihuAuth.ts` + schema 两张新表（`zhihu_oauth_states`：一次性 state、5 分钟 TTL、绑定发起身份；`zhihu_bindings`：identity_token 唯一，access_token 仅服务端）：
  - `zhihuAuthorize`（public mutation）：要求身份；缺任一环境变量 → `SERVICE_NOT_CONFIGURED`；同身份旧 state 置换。
  - `zhihuMe`（public query）：未绑定返回 null；已绑定仅回 `ZhihuProfilePublic` 投影。
  - `zhihuUnbind`（public mutation）：删绑定行；匿名游玩数据不受影响（身份并存，不迁移历史对局）。
  - `zhihuCallback`（httpAction，注册于 `convex/http.ts` `/api/auth/zhihu/callback` GET）：state 单次消费（internal mutation 事务内取删）→ token 交换 → /user 资料 → 有有效标识才写绑定 → 302 回大厅；失败 302 + stage，不重试、不暴露供应商原文。
- Next 透传 `app/api/auth/zhihu/callback/route.ts`（登记回调地址）：仅 302 转发 query 到 `{CONVEX_SITE_URL}/api/auth/zhihu/callback`；**App Key 不进 Vercel 环境**。
- UI `components/lobby/ZhihuAuthBadge.tsx` + 大厅页「⑤ 知乎账号」区：未登录（登录按钮）/已登录（头像+昵称+退出）/过期（重新登录）；回跳结果行内展示一次并清理 URL 参数；错误经 `toPublicError` 显式呈现。未接入 XState toast（B 所有权），徽章自包含。
- 定向测试 `tests/auth1-zhihu-oauth.test.ts`：17 例覆盖上表全部协议要点，17/17 通过。
- 本机无 bun/Convex 登录，验证方式见「定向验证」。

## 明确未完成

- 赛事页面登记回调地址 `https://zhihu-hackathon-2026.vercel.app/api/auth/zhihu/callback`（**登记值必须与 `ZHIHU_OAUTH_REDIRECT_URI` 逐字符一致**，含尾斜杠）。若已登记为其他地址，改 Convex 环境变量即可（代码不写死）。
- Convex 部署环境设置（生产 `agile-turtle-860` 与 dev 各一套）：
  `npx convex env set ZHIHU_OAUTH_APP_ID <AppID>`（**App ID 用户尚未提供**）
  `npx convex env set ZHIHU_OAUTH_APP_KEY <AppKey>`（用户 2026-09-14 已提供，长度 32，勿写进仓库/日志/回复）
  `npx convex env set ZHIHU_OAUTH_REDIRECT_URI https://zhihu-hackathon-2026.vercel.app/api/auth/zhihu/callback`
- 部署：`npx convex deploy`（新函数/表/schema 生效）+ Vercel 常规发布（新增透传路由）。
- 真机验收：部署后在大厅点「知乎登录」→ 用户本人完成知乎授权页确认 → 回调回大厅显示昵称/头像；再验退出、5 分钟 state 过期（等 5 分钟后用旧链接回调应 stage=state_invalid）。
- B 对大厅徽章 UI 的评审（视觉与文案融合）。

## 修改文件

- `contracts/public/index.ts` — 新增 AUTH1 公开契约（ZhihuProfilePublic、授权回执）。
- `server/zhihu/oauth.ts`（新） — OAuth 协议纯函数层。
- `convex/schema.ts` — 新表 `zhihu_oauth_states` / `zhihu_bindings`。
- `convex/zhihuAuth.ts`（新） — authorize/me/unbind + 回调 httpAction + 两个 internal mutation。
- `convex/http.ts` — 注册 `/api/auth/zhihu/callback` GET。
- `app/api/auth/zhihu/callback/route.ts`（新） — 登记回调的 Next 透传。
- `components/lobby/ZhihuAuthBadge.tsx`（新）、`app/page.tsx` — 大厅登录徽章与「⑤ 知乎账号」区。
- `tests/auth1-zhihu-oauth.test.ts`（新） — 定向测试。
- `docs/auth1-design-draft.md`、`DEVELOPER_A_IMPLEMENTATION_PLAN.md`、`README.md` — 状态更新。

## 权威文档更新

- `docs/auth1-design-draft.md` — 状态 proposal → implemented；记录 7 项实现偏差（绑定表、回调链路、/user 无需 Access Secret、稳定标识 hash_id/无损 uid、expires_at 可 null、stage 枚举、身份并存）。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — AUTH1 两行 BLOCKED → COMPLETE（代码）→ BLOCKED（上线配置）。
- 契约变更（contracts/public 新 schema）待 B 评审签署；按 D0 规则，签署前徽章行为视为提案级——已实现但未阻塞任何既有路径。

## 定向验证

- `tests/auth1-zhihu-oauth.test.ts` — **17/17 通过**（本机无 bun：esbuild 打包 + bun:test 最小垫片 + Node 24 运行；团队环境请直接 `bun test tests/auth1-zhihu-oauth.test.ts` 复验）。
- `tsc --noEmit`（TypeScript 5.9.3，npm 全新安装）— 本环节文件 0 错误；**既有错误 1 个**：`server/model-gateway/openai-compatible-gateway.ts(141,26)` TS2769（`tool({schema})` 与 ai@7.0.92 类型不匹配）。该文件本环节未改动，两份 lockfile（bun.lock/package-lock.json）版本一致（ai 7.0.92 / @ai-sdk/provider-utils 5.0.36 / typescript 5.9.3），疑似团队本地 node_modules 与 lockfile 新旧不一致——需在 bun 环境复跑 `bun run typecheck` 确认，未在本环节修复。
- Convex 函数无法在本机登录部署验证（CLI 需登录）；`convex/_generated/*` 由失败 codegen 部分生成 + 手工补 `zhihuAuth` 模块与 server/dataModel 桩（该目录 gitignored，团队 `npx convex dev` 会重新生成完整版）。

## 已知风险、阻塞与下一步

- **凭证来源澄清（2026-09-14 补充）**：用户在 `zhihu.com/ring/moltbook` 申请的 32 位密钥是 **Agent/圈子 API 的 app_secret**（配套 `app_key` = 个人主页 token，如 `txasqe0m`，请求签名鉴权），**不是** OAuth 登录的 App Key，不得写入 `ZHIHU_OAUTH_APP_KEY`。登录凭证唯一来源：官方 skill 0.7.2 `hackathon-oauth.md`——「App ID 和 App Key 通过赛事页面获取」；活动页面 `https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2`（需登录），队长在「我的项目 → 队伍详情 → 创建项目」时填写**知乎登录回调地址**（即 `ZHIHU_OAUTH_REDIRECT_URI`），项目创建后页面分配 App ID/App Key。作品提交窗口 2026-09-13 10:00 至 09-15 10:00，创建项目入口已开放。
- 官方 0.7.2 文档确认：黑客松 OAuth 服务已支持 `state` 原样透传，并要求严格校验（缺失/不匹配/过期/已用拒绝、原子消费）——本实现的行为与该要求一致；早期「实测可能不返回 state」的记录不再适用，`state_missing` 拒绝路径保留为正确行为。
- 官方协议缺口（hackathon-oauth.md 0.7.2 已收敛）：无 PKCE / refresh token / 撤销协议；token 过期只能重新授权。
- `zhihuAuthorize` 里同身份旧 state 清理用全表 collect 后按 identity 过滤（state 表量级为活跃登录数，短期无压力；如需优化加 by_identity 索引即可）。
- 下一位 Agent 起点：等队长在赛事页面创建项目拿到 App ID/App Key 后，按「明确未完成」四步走；验收脚本直接按上文明细执行，无隐藏步骤。
