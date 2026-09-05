# AUTH1 设计草案（PROPOSAL — 未实现，等外部凭证）

状态：`proposal`（仅设计，不含实现；实现开工条件见根计划 AUTH1 行）
负责人：`开发人员 A / ZCode`
更新时间：`2026-09-05`

## 外部前置（全部就绪才开工）

1. 黑客松项目已创建并分配 **App ID / App Key**（赛事页面；回调地址登记为下述 `redirect_uri`）。
2. Access Secret 已在 keychain ✅（2026-09-05 在线复验 valid）。
3. 公网 HTTPS callback：`https://zhihu-hackathon-2026.vercel.app/api/auth/zhihu/callback`（待登记）。
4. 官方协议已确认：`references/hackathon-oauth.md`（授权端点、`authorization_code` 回调参数、`access_token` 表单交换、`expires_in` 有效期、`X-OAuth-Token` 鉴权组合）。

## 接口设计（实现前须经 A/B 评审写入 CONTRACTS.md）

### 1. `auth.zhihuAuthorize`（mutation，Browser 可调）

- 输入：`{}`（身份必须已存在：匿名会话或后续任意阶段）。
- 行为：生成 `state`（随机 128-bit，服务端存 `oauth_states` 表，5 分钟 TTL，绑定当前 identity），返回
  `{ authorize_url }` =
  `https://openapi.zhihu.com/authorize?redirect_uri=<encoded>&app_id=<APP_ID>&response_type=code&state=<state>`。
- App ID 从部署环境 `ZHIHU_OAUTH_APP_ID` 读取（非秘密，但仍不进代码）；缺失 → `SERVICE_NOT_CONFIGURED`。

### 2. `GET /api/auth/zhihu/callback`（Next Route → Convex internal action）

- 读取 `authorization_code`（兼容 `code`）与 `state`；无授权码 → 停止（不换 token）。
- 校验 `state` 匹配当前会话记录且未过期（CSRF）。
- 后端 `POST https://openapi.zhihu.com/access_token`，表单：`app_id / app_key / grant_type=authorization_code / redirect_uri / code`；`app_key` 只从部署环境 `ZHIHU_OAUTH_APP_KEY` 读取。
- 成功判定以响应含 `access_token` 为准；记录 `expires_in`。
- 绑定：`users` 表（Convex Auth）当前身份追加 `zhihu_binding`（openid/unionid 类稳定标识 + token 摘要 + 过期时间）；**OAuth access_token 只存服务端**，永不下发浏览器。
- 完成后 302 回产品页（带一次性成功标识；不携带任何 token）。

### 3. 会话与失败语义（沿用全局规则）

- 所有失败均为 typed failure（`INVALID_ARGUMENT` / `STATE_MISMATCH→INVALID_ARGUMENT` / `SERVICE_UNAVAILABLE`），不区分供应商细节；不重试 token 交换（新授权 = 用户重新点击授权链接）。
- 授权过期：调用用户数据 API 收到鉴权失败即停止读取，不回退 Access Secret 所属账号；UI 提示重新授权。
- 退出/解绑：删除服务端绑定与 token；提供 `auth.zhihuUnbind`。
- 未决定项（实现前需用户/B 确认）：① 稳定用户标识选用知乎返回的哪个字段（以官方 user-api 文档为准）；② 授权用户与既有匿名游玩数据的合并策略（建议：绑定不迁移历史对局，仅身份并存）。

## 安全边界（官方要求 + 项目规则）

- App Key / authorization_code / OAuth token 只在应用后端处理；不进前端、URL、日志、截图、仓库。
- `state` 一次性；回调地址与登记值逐字符一致（含尾斜杠）。
- 不修改官方 Skill；OAuth 不阻塞 P0/P1（独立阶段）。
