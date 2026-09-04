# 2026-09-05-zhihu-skill-upgrade：官方 zhihu Skill 升级至 0.5.3-beta

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 用户明确决定采用官方更新版 skill（此前 OFFICIAL_RESOURCES 记录的"升级须单独决策"由本决定解除）。
- 源包：官方 beta 渠道下载的 `zhihu-cli-skill-0.5.3-beta.20260904115023/`（用户下载；保留于工作区根目录并加入 `.gitignore`，沿用"源包保留不跟踪"惯例）。
- 装前校验：路径安全（无隐藏文件、无 `..` 条目、无可执行二进制）；manifest 为官方格式，`min CLI 0.5.0-beta.20260826061344`，当前 CLI `0.5.0` stable 按 semver 满足；全树 manifest SHA-256 `c41e2d9f1b09bfbfe0b7c34dc8fc31bbfde0a3a7b641e31b935877dc8ea76c03`。
- 换装：原位替换 `.codex/skills/zhihu/`（删除旧 v0.2.1 → 原样复制新包）；未修改任何官方文件。安装后 `diff -r` 逐字节一致，15 个文件（新增 `references/hackathon.md`、`hackathon-content-api.md`、`hackathon-oauth.md` 三份黑客松专项参考）。
- 旧版 v0.2.1 去向：git 历史 + 赛事包内嵌归档 `zhihu-hackathon/assets/zhihu-cli-skill.zip`（原样保留，不修改）。
- 复验：manifest 可解析、版本号正确；CLI 冒烟 `auth status` → `ok=true`、keychain 可用、Access Secret 保持配置（未调用任何消耗额度的接口）。
- 本操作在新工作区 `D:\Users\yaoni\Desktop\zhihu-hackathon` 执行；旧目录不改动、待用户切换后删除。

## 明确未完成

- 0.5.3-beta 的 `run.ps1` 在 Windows PowerShell 5.1 的兼容性未验证（本机仍无 `pwsh`）；状态检查仍以 CLI 直连为准。
- `auth status --verify` 与最小业务验收仍按既有决定留待首次真实业务调用。
- 若官方后续发布 stable/更新 beta，升级须再次作为单独决策并重新校验哈希。

## 修改文件

- `.codex/skills/zhihu/` — v0.2.1（12 文件）→ 0.5.3-beta（15 文件），原样安装。
- `.gitignore` — 排除源包目录 `zhihu-cli-skill-0.5.3-beta.20260904115023/`。
- `docs/developer-a/OFFICIAL_RESOURCES.md` — 当前安装事实、关键哈希、版本漂移历史更新。
- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。

## 权威文档更新

- `docs/developer-a/OFFICIAL_RESOURCES.md` — 第 2 节重构为"初始安装（历史）+ 当前安装（0.5.3-beta）"，漂移小节记录用户决定与后续约束；无接口/契约变化。

## 定向验证

- `diff -r` 源包与安装目录 — 一致；`find | wc -l` — 15。
- `python -c json.load(manifest)` — `0.5.3-beta.20260904115023`。
- `sha256sum` 全树/关键文件 — 已记录（见 OFFICIAL_RESOURCES）。
- `%LOCALAPPDATA%\ZhihuCLI\current\zhihu-cli.exe auth status` — `ok=true`，`masked` 值与既有记录一致，无额度消耗。

## 已知风险、阻塞与下一步

- 新增的黑客松参考文档（`hackathon*.md`）尚未逐篇研读；涉及黑客松故事/知识内容 API 或 OAuth 接入时按新 SKILL.md 指引先读对应文档。
- CLI 0.5.0 与 0.5.3-beta skill 的完整兼容性以官方 `run.ps1 status` 的 `compatible` 字段为准，当前用 semver 判定满足；装 `pwsh` 后可复验（单独决策）。
- 下一步：新工作区会话按 [workspace-ascii-path handoff](./2026-09-05-workspace-ascii-path.md) 重启本地后端；PF1 owner 复验后标 COMPLETE；GC0 标注草案与 `AI_*` 配置。

## 最小接手阅读顺序

1. `docs/developer-a/OFFICIAL_RESOURCES.md` 第 2 节
2. `.codex/skills/zhihu/SKILL.md`（新版，注意其中的状态检查与初始化流程）
3. `docs/handoffs/2026-09-05-workspace-ascii-path.md`
4. 本记录
