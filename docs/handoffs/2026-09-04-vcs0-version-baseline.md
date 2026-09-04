# VCS0：版本基线

状态：`complete`  
完成时间：`2026-09-04`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 按根计划 VCS0 要求完成 Secret 与不应跟踪素材扫描，确认纳入范围后创建首个本地基线提交 `cea25d5`（branch `main`，67 个文件、6964 行）。
- 纳入范围：项目术语与 Agent 规则、v2.0 产品基线、3 项 ADR、契约与工程规格、根目录实施计划、handoff 记录、官方知乎黑客松 skill 与内置 `zhihu` skill（含 CLI 归档 ZIP）、刘看山公开素材（9 个媒体文件 + manifest）。
- 排除范围（`.gitignore`）：原始素材 ZIP、手动解压副本目录、`__MACOSX/` 元数据。
- 设置仓库级 Git 身份 `Yaoniguan-Money <277962205+Yaoniguan-Money@users.noreply.github.com>`（此前机器无任何 git 身份配置）；推送凭证使用已登录的 `gh` CLI credential helper。
- 按用户既有授权（“每完成一个环节推送一次远端”，记录于 2026-09-04-zhihu-access-secret-configured）在环节完成后推送 `main` 至 `origin`。

## 明确未完成

- PF0 及之后阶段未开始：无 Bun、无 Next.js/Convex 工程、无业务代码与业务测试。
- D0 仍 BLOCKED：待开发人员 B 评审签署；G0 仍 BLOCKED：待用户提供真实知乎 URL 与完整正文。

## 修改文件

- `docs/handoffs/README.md` — 索引新增本记录。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — VCS0 状态 READY → COMPLETE。
- 本记录。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 仅第 2 节 Gate 表与第 5 节阶段表中 VCS0 状态列改为 COMPLETE；无契约、接口或行为变更。

## 定向验证

- Secret 模式扫描（`git ls-files --others --exclude-standard` 全量，`sk-`/`AKID`/`ghp_`/`xox`/Bearer/PEM 及 `access_secret|api_key|client_secret|password|token` 赋值模式）— 0 命中。
- 高熵字面量扫描（≥43 位 base64 / ≥40 位 hex）— 仅命中已记录的公开安装包 SHA-256 校验值，无密钥。
- `.env`/凭证文件枚举 — 无 `.env`、`.pem`、`.key`；仅两份文档文件名含 "credential/secret" 且经抽查不含真实 Secret 值。
- 待跟踪文件类型核对 — 仅 markdown/json/js/ps1/sh、官方 ZIP（哈希已在 OFFICIAL_RESOURCES 固定）与清单内媒体。
- `git log --oneline` — 首个提交 `cea25d5` 存在，`main` 建立可回滚基线。

## 已知风险、阻塞与下一步

- Windows 下 `core.autocrlf` 使工作副本为 CRLF、仓库内为 LF；提交时出现换行警告属预期，不影响内容。
- 官方 skill 目录按“不得修改官方文件”约束原样纳入；其内嵌 hello-world 模板与 ZIP 不进入任何生产路径。
- G0、D0 阻塞不变；下一位 Agent 可执行起点为 PF0 工具链骨架（Bun 1.4、Next.js 16、React 19、TypeScript、Convex、测试与 typecheck 命令，不含 Public schema、页面、XState）。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `AGENTS.md`
3. `DEVELOPER_A_IMPLEMENTATION_PLAN.md`（第 2、4、5 节）
4. 本记录
