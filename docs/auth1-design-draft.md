# AUTH1 设计草案（IMPLEMENTED — 代码完成，上线配置待外部步骤）

状态：`implemented`（2026-09-14 代码与生产凭证已写入；仍待用户本人真机授权。见 [AUTH1 凭证 handoff](./handoffs/2026-09-14-zhihu-oauth-credentials.md)）
负责人：`开发人员 A / ZCode`
更新时间：`2026-09-14`（初稿 2026-09-05）

## 与初稿的实现偏差（2026-09-14）

1. **绑定存储**：初稿写「users 表追加 zhihu_binding」；实现为独立 `zhihu_bindings` 表（按 `identity_token` 唯一，与 `cases.owner_identity`、`creation_usage` 等既有 identity 数据模式一致）。`users` 表由 Convex Auth 组件管理，不直接 patch。
2. **回调链路**：初稿「Next Route → Convex internal action」；实现为 Next Route（登记回调地址）302 透传到 Convex public httpAction `/api/auth/zhihu/callback`。state（一次性、5 分钟 TTL、绑定发起身份）是该端点的唯一能力凭证，因此无需调用方 Cookie/Admin 凭证；**App Key 只配置在 Convex 部署环境，不进 Vercel**。
3. **用户资料**：按 2026-09 更新的官方文档 `hackathon-user-profile-api.md`，`GET https://openapi.zhihu.com/user` 仅需 `Authorization: Bearer <OAuth token>`，无需开放平台 Access Secret / `X-OAuth-Token`（旧组合仅用于 contents/followees 等用户数据接口，本阶段未调用）。
4. **稳定标识（初稿未决定项①）**：`hash_id` 优先；缺省时用 `uid` 的十进制字符串，且必须在原始响应文本上无损提取（uid 是 int64，示例值超出 `Number.MAX_SAFE_INTEGER`，先 `JSON.parse` 再转字符串必丢精度）。
5. **绑定与历史对局（初稿未决定项②）**：按初稿建议执行——绑定不迁移历史对局，匿名游玩数据与知乎绑定身份并存；解绑只删 `zhihu_bindings` 行。
6. **过期语义**：`expires_in` 缺失时 `expires_at` 为显式 `null`（不编造默认值）；UI 对已过期绑定显示「重新登录」，不静默降级。
7. **失败呈现**：回调失败 302 回大厅并携带闭环 `stage` 枚举（6 个：code_missing / state_missing / state_invalid / service_not_configured / token_exchange_failed / profile_invalid），不含供应商原文与任何凭证。

## 外部前置（2026-09-14 状态）

1. 黑客松项目已分配 **App ID / App Key**。✅ 两项均已写入生产 Convex `agile-turtle-860`（App ID 公开为 `596`；App Key 长度 32，不入仓库）。✅ 赛事页回调已确认为主站根地址。
2. Access Secret 已在 keychain ✅（2026-09-05 在线复验 valid）。本阶段登录链路未使用；调用 contents/followees 等用户数据接口时仍需。
3. 公网 HTTPS callback：`https://zhihu-hackathon.yaoniguan56.workers.dev/`（赛事页实际登记值；生产 `ZHIHU_OAUTH_REDIRECT_URI` 已改为该值，含尾斜杠）。根路径收到授权码后由 `proxy.ts` 改写到 `/api/auth/zhihu/callback`。
4. 官方协议已确认：`references/hackathon-oauth.md`（授权端点、`authorization_code` 回调参数、`access_token` 表单交换、`expires_in` 有效期）+ `references/hackathon-user-profile-api.md`（/user 端点、uid 无损、无标识不建会话）。

## 接口设计（已按 contracts/public 运行时 schema 落地）

### 1. `zhihuAuth.zhihuAuthorize`（mutation，Browser 可调）

- 输入：`{}`（身份必须已存在：匿名会话）。
- 行为：生成 `state`（随机 128-bit base64url，服务端存 `zhihu_oauth_states` 表，5 分钟 TTL，绑定当前 identity，同身份旧 state 置换），返回
  `{ authorize_url }` =
  `https://openapi.zhihu.com/authorize?redirect_uri=<encoded>&app_id=<APP_ID>&response_type=code&state=<state>`。
- App ID / App Key / 回调从部署环境 `ZHIHU_OAUTH_APP_ID` / `ZHIHU_OAUTH_APP_KEY` / `ZHIHU_OAUTH_REDIRECT_URI` 读取；缺失 → `SERVICE_NOT_CONFIGURED`。

### 2. `GET /api/auth/zhihu/callback`（Next Route 透传 → Convex httpAction）

- 读取 `authorization_code`（兼容 `code`）与 `state`；无授权码 → 停止（不换 token）。
- 校验 `state`：单次消费（取到即删）、未过期、绑定发起身份（CSRF）。
- 后端 `POST https://openapi.zhihu.com/access_token`，表单：`app_id / app_key / grant_type=authorization_code / redirect_uri / code`；成功判定以响应含 `access_token` 为准；记录 `expires_in`（缺失则 `expires_at=null`）。
- `GET https://openapi.zhihu.com/user`（`Authorization: Bearer <token>`）取昵称/头像/介绍；**必须拿到有效标识（hash_id 或无损 uid）才建立绑定**；uid 无损提取见偏差 4。
- 绑定写入 `zhihu_bindings`（identity_token 唯一；access_token 只存服务端，永不下发浏览器）。
- 完成后 302 回大厅（`?zhihu_auth=success`；失败 `?zhihu_auth=failed&stage=<枚举>`；不携带任何 token）。

### 3. 会话与失败语义（沿用全局规则）

- 所有失败均为 typed failure（`INVALID_ARGUMENT` / `AUTH_REQUIRED` / `SERVICE_NOT_CONFIGURED`）；不重试 token 交换（新授权 = 用户重新点击授权链接）。
- 授权过期：`zhihuMe` 投影 `expires_at`（可为 null）；UI 提示重新授权，不回退、不静默降级。
- 退出/解绑：`zhihuAuth.zhihuUnbind` 删除服务端绑定与 token。
- 已知协议缺口（官方文档实测记录）：回调可能不返回 `state`；无 PKCE、refresh token、撤销或解绑协议——按官方边界仅标记为黑客松联调能力。

## 安全边界（官方要求 + 项目规则）

- App Key / authorization_code / OAuth token 只在应用后端（Convex）处理；不进前端、URL、日志、截图、仓库、Vercel 环境。
- `state` 一次性；回调地址与登记值逐字符一致（含尾斜杠）。
- 不修改官方 Skill；OAuth 不阻塞 P0/P1（独立阶段）。
