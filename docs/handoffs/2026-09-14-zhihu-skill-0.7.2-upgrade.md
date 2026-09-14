# ZHIHU-SKILL-0.7.2-UPGRADE：官方 zhihu Skill 升级至 0.7.2-beta

状态：`complete`  
完成时间：`2026-09-14`  
负责人：`opencode`

## 实际完成

- 官方 zhihu Skill 从 `0.5.3-beta.20260904115023` 升级到 `0.7.2-beta.20260911131715`，整目录替换 `.codex/skills/zhihu/`（新增 `references/creator.md`、`references/hackathon-user-profile-api.md`）。官方文件未改内容。
- 源包从官方 beta CDN 下载：`https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.7.2-beta.20260911131715/zhihu-cli-skill-0.7.2-beta.20260911131715.zip`；size `65535`，SHA-256 `7408ea4cb339c27294c3d664ac2f8c14b21b30c24b2bfb82dc0bd86d78443fb2`。
- `zhihu-hackathon` 内置快照 `assets/zhihu-cli-skill.zip` 同步替换为同一包，避免初始化脚本把新项目装回旧版。
- `install_official_skill.mjs`：`expectedSha256` 更新；Windows 改走系统 `tar` 列目录/解压（本机无 `unzip`，硬编码 `/usr/bin/unzip` 会 ENOENT），非 Windows 仍用 `/usr/bin/unzip`。
- 本机 CLI 已是 `0.6.0-beta.20260908125143`，满足新 Skill 最低要求，未重装二进制。

## 明确未完成

- 无。

## 修改文件

- `.codex/skills/zhihu/**` — 官方 0.7.2-beta 整包替换。
- `.codex/skills/zhihu-hackathon/assets/zhihu-cli-skill.zip` — 内置快照替换为 0.7.2-beta 包。
- `.codex/skills/zhihu-hackathon/scripts/install_official_skill.mjs` — 新哈希 + Windows tar。
- `.codex/skills/zhihu-hackathon/references/official-skill-snapshot.md` — 来源 URL、版本、sha256、历史线索。
- `docs/handoffs/README.md` — 索引新增本记录。

## 权威文档更新

无规范变更。`AGENTS.md` 引用的项目级 skill 路径 `.codex/skills/zhihu/SKILL.md` 不变，CLI 初始化流程以新版 SKILL.md 为准。

## 定向验证

- 下载 zip 路径安全 — 通过：20 个条目均为 `zhihu/` 下相对路径，无 `..`、无绝对路径；size `65535`。
- `powershell -ExecutionPolicy Bypass -File .codex/skills/zhihu/scripts/run.ps1 status` — 通过：`ok=true`、`next_action=ready`、`compatible=true`、skill 与 CLI 均 `update_available=false`；远端 manifest `status=verified`；skill `0.7.2-beta.20260911131715`，CLI `0.6.0-beta.20260908125143`。
- `node install_official_skill.mjs <临时项目>` — 通过：`ok=true`、`sha256=7408ea4c…`、`entries=20`、装出版本 `0.7.2-beta.20260911131715`。

## 已知风险、阻塞与下一步

- CLI/Skill 为 beta 通道；远端 manifest 在升级时 skill 最新即为 `0.7.2-beta.20260911131715`。
- 下一步：按新版 `.codex/skills/zhihu/SKILL.md` 调用 CLI；每个 Session 首次使用前跑一次 `run.ps1 status`。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `.codex/skills/zhihu/SKILL.md`
3. 本记录
