# 2026-09-05-workspace-ascii-path：工作区迁移至 ASCII 路径并验证 Convex 本地后端

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **根因定位**：`npx convex dev` 的 `TypeError: Cannot convert argument to a ByteString ... value of 30693` 中，30693 是汉字“知”（U+77E5）。旧项目目录名 `知乎黑客松` 进入本地部署标识：残留 `.convex/local/default/config.json` 中 `deploymentName: "anonymous-知乎黑客松"`、`adminKey: "anonymous-知乎黑客松|…"`。adminKey 会作为 HTTP `Authorization` 头发送给本地后端，而 HTTP header 只允许 ≤255 的字节值，中文直接导致 CLI 崩溃。这是 Convex CLI 在非 ASCII 项目路径下的已知失败模式，与“是否登录账号”无关。
- **旧状态清理**：删除崩溃运行遗留的项目级 `.convex/`（gitignored、可再生）；家目录 `~/.convex/anonymous-convex-backend-state` 无中文引用，保留。
- **工作区迁移**：根目录 `D:\Users\yaoni\Desktop\知乎黑客松` 被本应用的工作区文件监视器占用（子目录可改名、根目录不可），无法原地重命名。改用 robocopy 复制（排除 `node_modules`、`.next`）到 **`D:\Users\yaoni\Desktop\zhihu-hackathon`**；383 个文件、28.96MB，git 状态与源一致（`main` 跟踪 `origin/main`，仅未跟踪的 `zhihu-cli-skill-0.5.3-beta.20260904115023/` 目录随之复制，未处理、未纳入版本控制）。
- **新路径全量复验**：`bun install`（64 packages）→ `bun run typecheck` 通过 → `bun test` 26 pass / 0 fail → `bun run build` 成功。
- **Convex 本地后端验证（ASCII 实例名 `anonymous-zhihu-hackathon`）**：
  - 用已缓存的 `convex-local-backend.exe`（`%LOCALAPPDATA%\convex\binaries\precompiled-2026-08-25-7cce8fb`，与 CLI 1.45.0 配套）+ `keygen admin-key` 生成密钥，手工写 `.convex/local/default/config.json`（镜像 CLI 自身格式，gitignored）。
  - 后端监听 `127.0.0.1:3210`（函数）/`3211`（site proxy）后，`CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 CONVEX_SELF_HOSTED_ADMIN_KEY=<key> bunx convex dev --once` **成功推送 schema**：authTables（authAccounts/authSessions/authRefreshTokens/authVerificationCodes/authVerifiers/authRateLimits/users）及其索引全部建立，无兼容错误——**PF1 handoff 中的阻塞点 1 解除**。
  - 在部署上设置 `JWT_ISSUER`、`JWT_PRIVATE_KEY`（本地生成 RSA 2048；只存本地部署环境，不进仓库、不进文档）；`CONVEX_SITE_URL` 为内建变量不可覆盖，由后端自动管理。
  - `bunx convex run auth:signIn '{"provider":"anonymous"}'` **成功返回 tokens**（RS256 JWT + refresh token）——**PF1 handoff 中的阻塞点 2（Anonymous 会话签发）解除**。
  - 补充事实：`/api/auth/signin/*` HTTP 路由仅在配置 OAuth 时注册（见 `@convex-dev/auth` 的 `addHttpRoutes` 文档注释）；Anonymous 登录走 `signIn` mutation，不走 REST 路由。
- 验证后已停止本次用于验证的后台后端进程；重启命令见下。

## 明确未完成

- 旧目录 `D:\Users\yaoni\Desktop\知乎黑客松` 仍存在（被应用句柄锁定无法删除）：**确认所有 Agent 会话与编辑器都切换到新路径后**，由用户手动删除，避免双工作区分叉。
- PF1 的 handoff 状态仍由其 owner 维护；本环节只解除其阻塞并留下证据，未改其状态。
- 未提供真实供应商 `AI_*` 配置值（PF1 后续真实 smoke 与 TB2+ 需要）。

## 修改文件

- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。
- （工作区位置变更本身不修改任何跟踪文件；`.convex/` 为 gitignored 本地状态。）

## 权威文档更新

无规范变更——契约、规格、计划均未改动；本环节是环境修复。

## 定向验证

- `curl http://127.0.0.1:3210/version` — 后端响应。
- `bunx convex dev --once`（self-hosted env）— schema 推送成功，authTables 索引全部 `[+]`。
- `curl http://127.0.0.1:3211/.well-known/openid-configuration` — 返回 issuer/jwks JSON，httpRouter 生效。
- `bunx convex run auth:signIn '{"provider":"anonymous"}'` — 返回 `{tokens:{token,refreshToken}}`。
- `bun run typecheck` 通过；`bun test` 26 pass / 0 fail；`bun run build` 成功。
- `git status` — 新路径除既有的未跟踪 skill 目录外干净。

## 已知风险、阻塞与下一步

- **重启本地后端**（每次开发前执行，或在项目根运行）：
  `cd D:\Users\yaoni\Desktop\zhihu-hackathon\.convex\local\default && %LOCALAPPDATA%\convex\binaries\precompiled-2026-08-25-7cce8fb\convex-local-backend.exe --instance-name anonymous-zhihu-hackathon --instance-secret <config.json 内 instanceSecret> -p 3210 --site-proxy-port 3211 --disable-beacon`
  之后 CLI 一律用 `bunx convex`（锁定 1.45.0），并用 `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 CONVEX_SELF_HOSTED_ADMIN_KEY=<config.json 内 adminKey>` 直连；也可先尝试普通 `bunx convex dev`（已有 config.json，向导可能直接识别）。
- 本地部署的 `JWT_PRIVATE_KEY` 为开发用可再生密钥；如需重置，删除 `.convex/local/` 后重复本记录的初始化步骤即可。
- 下一步（依 PF1 handoff）：PF1 owner 复验后将其状态改为 COMPLETE；随后 GC0 标注草案与 `AI_*` 八项配置。

## 最小接手阅读顺序

1. 本记录
2. `docs/handoffs/2026-09-04-pf1-schema-auth-model-seam.md`
3. `docs/adr/0004-case-catalog-durable-compilation-and-anonymous-access.md`
4. `DEVELOPER_A_IMPLEMENTATION_PLAN.md`
