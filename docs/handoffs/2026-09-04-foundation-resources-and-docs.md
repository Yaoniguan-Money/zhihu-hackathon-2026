# 基础资源与工程文档

状态：`complete`  
完成时间：`2026-09-04`  
负责人：`开发人员 A / Codex`

## 实际完成

- 创建并连接私有 GitHub 仓库 `Yaoniguan-Money/zhihu-hackathon-2026`；本地分支为 `main`，没有提交或推送。
- 安全下载、固定哈希校验并原样安装官方知乎黑客松 skill 与其内置 `zhihu` skill；安装官方 CLI，未配置 Access Secret、OAuth 或任何用户凭证。
- 从用户提供的两个官方素材 ZIP 提取 3 张 JPG 与 6 个 GIF 到公开资源目录；原始 ZIP、手动解压副本和 macOS 元数据被保留但排除 Git。
- 固化项目级 Agent 指令、领域术语、三项 ADR、A1–A9 工程规格、Public / Private 契约、纵向实施计划和官方资源清单。

## 明确未完成

- 未初始化 Bun / Next.js / Convex 工程，未安装业务依赖，未创建 A1–A9 业务实现，未运行类型检查或业务测试。
- `CONTRACTS.md` 仍待开发人员 B 对公开 Interface 完成共同评审。
- Golden Case 尚未开始：缺少用户提供的真实知乎 URL 与完整正文。
- 未配置知乎 Access Secret，未调用知乎 API；未接入 OAuth。
- 未提交或推送本轮文件。

## 修改文件

- [AGENTS.md](../../AGENTS.md) — 项目规则、A/B 所有权、失败策略，以及阶段记录与交接门槛。
- [CONTEXT.md](../../CONTEXT.md) — 项目统一领域语言。
- [developer-a](../developer-a/README.md) — A1–A9 规格、契约、实施计划与官方资源入口。
- [ADR 目录](../adr/) — v2.0 基线、完整正文输入、显式模型网关的已接受决策。
- [素材清单](../../public/assets/zhihu/liukanshan/manifest.json) — 正式素材的来源、目标路径、哈希和媒体参数。
- [.gitignore](../../.gitignore) — 排除原始素材 ZIP、用户解压副本和 macOS 元数据。
- [.codex/skills/zhihu-hackathon/SKILL.md](../../.codex/skills/zhihu-hackathon/SKILL.md) — 已安装的官方黑客松 skill。
- [.codex/skills/zhihu/SKILL.md](../../.codex/skills/zhihu/SKILL.md) — 已安装的官方知乎 CLI skill。

## 权威文档更新

- [工程规格](../developer-a/ENGINEERING_SPEC.md) — 定义 A1–A9、Module、数据流、失败策略、隐私、可观测性和 Golden Case 阻塞。
- [契约](../developer-a/CONTRACTS.md) — 冻结 Public / Private 分区、Durable Role Ticket、幂等、Board 版本、错误和语音 Interface。
- [根目录权威实施计划](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md) — 当时的初版依赖、完成标准和交接点已迁移并扩展为唯一实施顺序来源。
- [官方资源](../developer-a/OFFICIAL_RESOURCES.md) — 记录官方包、CLI、素材、哈希、版本漂移和人工凭证步骤。
- [本记录规则](../../AGENTS.md) — 本环节新增；它不改变游戏契约或产品行为。

## 定向验证

- GitHub 远端检查 — 目标仓库为 private；本地 `main` 已绑定 HTTPS `origin`；本地和远端均没有提交。
- 官方 skill ZIP — 外层与内层固定 SHA-256 均匹配；安装目录与归档逐文件一致。
- `pwsh -ExecutionPolicy Bypass -File .codex/skills/zhihu/scripts/run.ps1 status` — CLI v0.5.0 兼容；Access Secret 未配置；内置 skill v0.2.1 检测到可选 v0.5.0 更新，未自动升级。
- 素材清单 JSON — 可解析；两个原始 ZIP 与九个安装媒体的大小和 SHA-256 全部匹配。
- 媒体解码 — 3 个 JPG 与 6 个 GIF 均通过完整 FFmpeg 解码检查。
- 文档链接 — 10 份项目 Markdown 的本地链接检查通过。

## 已知风险、阻塞与下一步

- 官方内置 `run.ps1` 在 Windows PowerShell 5.1 存在解析错误；状态检查必须使用 PowerShell 7 的 `pwsh`。不得修补官方文件。
- 黑客松包固定的 `zhihu` skill 是 v0.2.1，在线 stable 为 v0.5.0；升级是单独决策，不能静默进行。
- G0：等待用户提交 Golden Case 的知乎 URL 与完整正文；在此之前不得用搜索摘要、合成文章或 Hello World 数据替代。
- D0：B 必须共同评审 [CONTRACTS.md](../developer-a/CONTRACTS.md) 的公开 Interface。
- 下一位 Agent 在收到 G0 输入并完成 D0 评审后，从 [根目录权威实施计划](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md) 的依赖前沿开始；进入知乎 API 调用前先读已安装 `zhihu` skill 并由用户手动提供 Access Secret。

## 最小接手阅读顺序

1. [项目术语](../../CONTEXT.md)
2. [项目 Agent 规则](../../AGENTS.md)
3. [开发人员 A 文档入口](../developer-a/README.md)
4. [工程规格](../developer-a/ENGINEERING_SPEC.md) 与 [契约](../developer-a/CONTRACTS.md)
5. [根目录权威实施计划](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md)
6. 本记录
