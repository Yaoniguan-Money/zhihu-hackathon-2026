# REL0：P0 公网部署——Convex Cloud 完成，Vercel 待登录

状态：`in_progress`（权威数据侧完成并验证；Web/API 侧等 `vercel login` 后执行）
完成时间：`2026-09-05`
负责人：`开发人员 A / ZCode`

## 实际完成

- **GC0 冻结前置完成**（commit `e446f5d`）：用户于 2026-09-05 签署确认九项清单；标注文件按冻结流程移至 `golden-case/case-demo-001/`，`build-and-verify.ts` 复验全绿且 JSON 零漂移；`tests/helpers/golden-seed.ts` 路径同步；本地测试（tb2-golden/tb8/tb9-accuse 13 pass）通过。
- **Convex Cloud 项目与 prod 部署**：用户完成 `convex login`；创建项目 `8-88:zhihu-hackathon-2026`，prod 部署 **`agile-turtle-860`**（`https://agile-turtle-860.convex.cloud`，site `https://agile-turtle-860.convex.site`）。项目创建时自动配的默认 prod 即 agile-turtle-860；另手动建的 `woozy-alpaca-64` 为多余部署（空、无数据），可在 dashboard 删除。
- **Deploy key**：`rel0-deploy-key`（scope=prod agile-turtle-860）只存 gitignored `.convex/deploy-key.env`，用于非交互部署/运维（`CONVEX_DEPLOY_KEY=<key> bunx convex deploy|env|run|logs`）。
- **Functions/schema 推送**：`CONVEX_DEPLOY_KEY=... bunx convex deploy` 成功，全部表与索引建立。
- **生产环境变量**（只存部署环境，不入仓库/文档）：八项 `AI_*`（DeepSeek）、`JWT_ISSUER=https://agile-turtle-860.convex.site`、生产专用 `JWT_PRIVATE_KEY`（RSA 2048，PKCS8/LF，存 `.convex/jwt-private.pem`）与 **`JWKS`**（由公钥派生 `{keys:[jwk]}`，二者必须成对——`@convex-dev/auth` 的 `/.well-known/jwks.json` 只读 `JWKS`，缺失即 500，TB1 本地踩过同一坑）。
- **Golden 系统案件种子落 prod**：新增 `scripts/seed-golden.ts`（HTTP API + deploy key 认证，绕开 Windows argv 长度上限；数据与本地种子同源同校验），`case-demo-001` created。
- **生产验证**（新增 `scripts/verify-rel0.ts`，8 项全 PASS）：系统案件目录、五角色 Public 投影、匿名 `auth:signIn`、无效邀请码 → `CASE_CREATION_NOT_ALLOWED`（typed failure 不耗模型）、Session briefing/board revision 0、身份 B getPublic→null 与 evidence:getAll→[]（Owner 隔离）、初始事件 sequence=1。
- **生产 build 验证**：`NEXT_PUBLIC_CONVEX_URL=https://agile-turtle-860.convex.cloud bun run build` 通过。

## 明确未完成

- **Vercel Web/API 部署**：CLI 已安装但未登录（`vercel whoami` 提示需 `vercel login`，浏览器授权只能由用户完成）。剩余步骤（登录后我执行）：
  1. `vercel link`（关联 Git 仓库或新建项目）
  2. `vercel env add NEXT_PUBLIC_CONVEX_URL production` → `https://agile-turtle-860.convex.cloud`（Next.js 构建期内联，必须先于首次 build 设置）
  3. `vercel deploy --prod` + 线上冒烟（页面可访问、匿名建局、公开接口）
- 产品页面仍为 PF0 骨架页（产品 UI 属开发人员 B 范围）；REL0 验收中的「已签署 Golden 系统案件」与数据侧条件已就绪。

## 修改文件

- `golden-case/case-demo-001/` — 冻结（移出 gc0-draft；README 状态 FROZEN；脚本路径修正）。
- `tests/helpers/golden-seed.ts` — 种子路径指向冻结目录。
- `scripts/seed-golden.ts`、`scripts/verify-rel0.ts` — 新增运维/验证脚本。
- `docs/handoffs/2026-09-05-gc0-annotation-draft.md` — `blocked` → `complete`。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — GC0 → COMPLETE；REL0 → IN PROGRESS（本记录链接）。
- `docs/handoffs/README.md` — 索引更新。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — GC0 行、REL0 行。无契约变更。

## 定向验证

- `bun golden-case/case-demo-001/build-and-verify.ts` — 全绿；冻结文件 git diff 零内容漂移。
- `bun test tests/tb2-golden.test.ts tests/tb8-evidence.test.ts tests/tb9-accuse.test.ts` — 13 pass / 0 fail。
- `bun scripts/seed-golden.ts https://agile-turtle-860.convex.cloud` — created。
- `bun scripts/verify-rel0.ts https://agile-turtle-860.convex.cloud` — 8 PASS。
- `NEXT_PUBLIC_CONVEX_URL=https://agile-turtle-860.convex.cloud bun run build` — 通过；`bun run typecheck` 通过。

## 已知风险、阻塞与下一步

- 阻塞：`vercel login`（用户浏览器授权）。完成后按上文 3 步执行 Web 部署与线上冒烟。
- `woozy-alpaca-64` 多余部署建议用户在 dashboard 删除。
- 生产 JWT 密钥为本次新生成；如需轮换，同时更新 `JWT_PRIVATE_KEY` 与 `JWKS`（必须来自同一密钥对）。
- 下一步：① 用户 `vercel login` → 完成 Web 部署 + 线上冒烟 → REL0 COMPLETE；② P1-1 录音对质可开工（不依赖部署）。

## 最小接手阅读顺序

1. 本记录
2. `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 第 10 节（REL0 边界）
3. `scripts/verify-rel0.ts`（验证清单即验收清单）
4. `docs/handoffs/2026-09-05-tb10-full-chain.md`
