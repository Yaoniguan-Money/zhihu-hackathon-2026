# 2026-09-09 资产与体验 50 轮升级：基线走查 + 环境修复

状态：`complete`（基线环节；后续 50 轮迭代各自有提交与桌面记录）

完成时间：2026-09-09 02:40
负责人：ZCode（自治迭代任务，用户授权连夜执行）

## 实际完成

- 安装 `majidmanzarpour/threejs-game-skills`（9 个子 skill）至 `~/.agents/skills/`，作为本轮升级方法论（视觉评分卡、debug/QA 流程）。
- 环境修复：本地 Convex 后端必须以 `.convex/local/default` 为工作目录启动（sqlite + 文件存储都在那里）。此前从仓库根手动启动会在根目录新建空库，导致 `auth:signIn` 报 `invalid RSA PrivateKeyInfo`（JWT 签名密钥不在空库中）。已用正确工作目录重启并验证匿名登录签发。
- `.env.local` 注释 `CONVEX_DEPLOYMENT`（无代码引用；其存在会使 `CONVEX_SELF_HOSTED_URL/ADMIN_KEY` 直连报错）。
- 基线走查（大厅/简报/审讯/证据板）完成，问题清单 15+ 项，记录于桌面 `zhihu-game-iterations/rounds/00-baseline.md`。主要：审讯室镜头构图差（角色背身遮挡、无说话者聚焦）、顶部气泡裁切、全站无音效/BGM、场景密度低、简报页立绘漂浮。

## 明确未完成

- 50 轮迭代正文（后续每轮一个提交，桌面 `zhihu-game-iterations/` 有逐轮文档与截图）。

## 修改文件

- `.env.local`（本地，不进 git）：注释 CONVEX_DEPLOYMENT。
- `docs/handoffs/2026-09-09-asset-50-rounds.md`：本记录。
- 桌面 `C:\Users\yaoni\Desktop\zhihu-game-iterations\`：迭代作战室（README 总账 + rounds/ + shots/），不进仓库。

## 权威文档更新

无规范变更——契约、规格、计划均未改动；本环节是环境修复与走查。

## 定向验证

- `curl 127.0.0.1:3210/version` 响应正常；`bunx convex dev --once` → `Convex functions ready!`。
- `bunx convex run auth:signIn '{"provider":"anonymous"}'` → 正常签发 token。
- 浏览器实测：大厅/简报/审讯（开场陈述 5 条并行生成成功）/证据板均可用，Next dev Issues 角标消失。

## 已知风险与下一步

- deepseek-v4-flash 开场生成单条 40-90s，等待体验需前端持续优化（已有并行+跳过）。
- 后端重启命令必须带 `.convex/local/default` 工作目录（见上），建议后续把它写进 scripts。
- 下一步：第 1 轮从审讯室镜头构图与说话者聚焦开始。

## 最小阅读顺序

1. 本记录
2. 桌面 `zhihu-game-iterations/rounds/00-baseline.md`
