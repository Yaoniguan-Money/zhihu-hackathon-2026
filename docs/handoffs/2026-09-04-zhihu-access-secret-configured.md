# 知乎 Access Secret 配置（含 CLI 重装）

状态：`complete`  
完成时间：`2026-09-04`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 发现 [OFFICIAL_RESOURCES.md](../developer-a/OFFICIAL_RESOURCES.md) 记录的 CLI 绝对路径在本机不存在（此前验证可能发生在其他环境）；经官方 `setup.ps1`（未修改）重装 `zhihu-cli 0.5.0` 至 `%LOCALAPPDATA%\ZhihuCLI\current\zhihu-cli.exe`，安装协议为官方 HTTPS manifest + 大小/SHA-256 校验，无管理员权限、未修改 PATH。
- 用户在对话中提供 Access Secret；通过 `auth set --secret-stdin` 以标准输入方式存入系统 keychain。原文未写入任何仓库文件、源码、文档、日志、fixture 或本记录。
- 记录用户三项决定：① Convex 部署时由用户交互登录一次；② Git 授权“每完成一个环节推送一次远端”（仍以环节完成、handoff 留痕为前提）；③ 本环节只做凭证存储，不开始业务代码修改。

## 明确未完成

- `auth status --verify` 与 `me contents --limit 1` 最小业务验收未执行（避免额外接口额度消耗；留待首次真实业务调用）。
- 未创建 Git 提交、未推送远端：VCS0 尚未开始，本环节的文档变更将并入首个基线提交后按用户授权推送。
- 未初始化工程（Bun/Next.js/Convex），未开始任何业务代码；G0、D0 仍 BLOCKED。

## 修改文件

- `docs/developer-a/OFFICIAL_RESOURCES.md` — 凭证状态、CLI 重装与 pwsh 缺失的现场事实。
- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。

## 权威文档更新

- `docs/developer-a/OFFICIAL_RESOURCES.md` — “当前 `auth.configured=false`” 更新为已配置（keychain、`verification=valid`）；补充本机未安装 `pwsh`、`setup.ps1` 可在 Windows PowerShell 5.1 运行的现场事实。无契约/规格/接口变化。

## 定向验证

- `powershell -ExecutionPolicy Bypass -File .codex/skills/zhihu/scripts/setup.ps1` — 输出 `installed=true`、`downloaded_cli_version=0.5.0`、`binary_path` 与清单一致。
- `sha256sum` 二进制哈希 — `5C69E99414758AF5012B864D90169FC9BA4928DE946730154604D94DA570AB9B`，与清单记录一致（注意：Git Bash 中 `sha256sum` 对含反斜杠的 Windows 路径会在行首加 `\` 转义标记，比对前需剔除）。
- `auth set --secret-stdin`（标准输入）— 返回 `{"ok":true,"status":"READY","verification":"valid"}`；在线验证由该命令完成一次，`last_verified_at=2026-09-04T14:02:17Z`。
- `auth status` — `source=keychain`、`environment_shadows_keychain=false`，仅显示脱敏值（前 4 后 4 字符）。

## 已知风险、阻塞与下一步

- 本机无 PowerShell 7：官方 `run.ps1` 状态检查不可用；如需运行它，须先安装 `pwsh`（单独决策）。CLI 自身的 `auth status`、`version` 等命令在 Git Bash 按绝对路径直接调用正常。
- `ENV_SHADOWS_KEYCHAIN=false`：当前无环境变量遮蔽 keychain；未来设置任何知乎相关环境变量前需复查该项。
- 全部语义 ticket 的外部阻塞不变：G0 待用户提供真实知乎 URL + 完整正文；D0 待 B 评审签署；模型 `AI_*` 八项配置待用户提供。
- 下一位 Agent 的可执行起点：根计划 VCS0（扫描 Secret 与素材纳入范围 → 首个本地基线提交；推送已获用户授权，按环节推送）→ PF0 工具链骨架。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `AGENTS.md`
3. `docs/developer-a/OFFICIAL_RESOURCES.md`
4. `DEVELOPER_A_IMPLEMENTATION_PLAN.md`
5. 本记录
