# PF0：工具链骨架

状态：`complete`  
完成时间：`2026-09-04`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 安装并固定 Bun `1.4.1`（npm 全局精确版本安装；`bun --version` 验证）。TypeScript 7.0.2 为新原生编译器，本阶段保守选用 `typescript@5.9.3`，升级 TS 7 属单独决策。
- 初始化最小工程骨架（手写文件 + `bun install`，未使用 create-next-app 模板，避免顺带生成产品页面）：
  - `package.json`：精确固定 `next@16.3.4`、`react@19.2.8`、`react-dom@19.2.8`、`convex@1.45.0`、`typescript@5.9.3`、`@types/node@24.13.3`（匹配本机 Node 24）、`@types/react@19.2.18`、`@types/react-dom@19.2.7`、`@types/bun@1.4.0`；`packageManager` 与 `engines` 声明 Bun `1.4.x` 约束。
  - scripts：`dev` / `build` / `start` / `typecheck`（`tsc --noEmit`）/ `test`（`bun test`）。
  - `tsconfig.json`：strict + bundler resolution + `@/*` paths；Next.js 16 首次构建按其强制规则将 `jsx` 改为 `react-jsx` 并在 include 增加 `.next/dev/types/**/*.ts`，已人工审阅后接受。
  - `next.config.ts`：空 NextConfig。
  - `app/layout.tsx` + `app/page.tsx`：仅使 `next build` 可运行的工具链占位页，明确标注产品页面归开发人员 B；不含任何产品信息架构、样式或交互。
  - `convex/schema.ts`：`defineSchema({})` 空 schema——零表、零公开契约；表结构在 PF1 依契约实现。`bunx convex --version` 验证 CLI 1.45.0 可用。
  - `tests/toolchain.test.ts`：4 个锁定测试，钉住 Bun 1.4.x、Next 16.x、React 19.x、TS 5.9.x 与 test/typecheck 命令注册，防止依赖升级无声偏离计划。
  - `bun.lock` 已纳入版本控制，保证可复现安装。
- `.gitignore` 追加：`node_modules/`、`.next/`、`out/`、`next-env.d.ts`、`*.tsbuildinfo`、`.convex/`、`convex/_generated/`、`.env*`（保留 `!.env.example`）。

## 明确未完成

- 未运行 `convex dev` / 未创建 Convex 部署：需要用户交互登录一次（用户既有决定），且 PF0 不要求部署。
- 未实现任何 Public/Private schema、contracts 入口（`shared/public/private` 属 PF1）、业务代码、业务测试、产品页面或 XState。
- 未安装 Tailwind / shadcn / AI SDK / XState 等 UI 与模型依赖；它们分别属于 B 端与 PF1 范围。

## 修改文件

- `package.json`、`tsconfig.json`、`next.config.ts`、`bun.lock` — 新建工程骨架与固定版本。
- `app/layout.tsx`、`app/page.tsx` — 构建必需的最小占位（工具链，非产品页面）。
- `convex/schema.ts` — 空 schema 占位。
- `tests/toolchain.test.ts` — 工具链版本锁定测试。
- `.gitignore` — 工具链忽略项。
- `docs/handoffs/README.md` — 索引新增本记录。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — PF0 状态 READY → COMPLETE，同步现场事实段。
- 本记录。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 第 2 节现场事实与 Gate 表、第 5 节阶段表中 PF0 状态更新为 COMPLETE；无契约、接口或产品行为变更。

## 定向验证

- `bun --version` — `1.4.1`。
- `bun install` — 34 packages 安装成功。
- `bun run typecheck`（`tsc --noEmit`）— 通过，exit 0。
- `bun test` — 4 pass / 0 fail。
- `bun run build` — Next.js 16.3.4 生产构建成功，路由 `/` 与 `/_not-found` 静态生成。
- `bunx convex --version` — `1.45.0`。

## 已知风险、阻塞与下一步

- TypeScript 7.0.2（原生编译器）已发布但未采用；保持 5.9.3 直至单独决策升级。
- `next build` 会强制改写 `tsconfig.json` 的个别字段（本次 `jsx`、`include`）；属 Next 工具链行为，人工审阅后保留。
- Convex 部署登录、`AI_*` 八项模型配置待用户后续提供；D0（B 评审）与 G0（真实 URL + 完整正文）阻塞不变。
- 下一位 Agent 可执行起点：PF1（依赖 D0 + PF0）——`shared/public/private` 契约入口、严格 runtime schema、Convex Anonymous Auth、显式 `AI_*` 配置与 OpenAI-compatible Adapter；在 D0 解除前不得把第 3 节提案写进生产行为。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `AGENTS.md`
3. `DEVELOPER_A_IMPLEMENTATION_PLAN.md`（第 2、3、5 节）
4. `docs/developer-a/CONTRACTS.md`
5. 本记录
