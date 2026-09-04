# 官方 Skill、CLI 与素材清单

状态：已安装并完成完整性检查。本文只记录可验证事实；不扩张压缩包未声明的许可范围。

知乎开放平台官方入口：<https://developer.zhihu.com/>。接口细节以已安装 `.codex/skills/zhihu/` 中随赛事包提供的官方参考文档和实际 CLI `capabilities` / `--help` 为运行时事实源。

## 1. 知乎黑客松 Skill

| 项目 | 结果 |
|---|---|
| 下载地址 | <https://zhstatic.zhihu.com/skill/zhihu-hackathon-skill_s2_v260815.zip> |
| 下载大小 | 83,802 bytes |
| SHA-256 | `8D5DCA21E1E5B360126D0BC35C636B0C207C654A5919640A88504E560090D92C` |
| ZIP 根目录 | `zhihu-hackathon/` |
| 安装目录 | `.codex/skills/zhihu-hackathon/` |
| 普通文件数 | 28 |
| 完整性 | 安装目录相对归档 missing 0、mismatch 0、extra 0 |

归档经过路径检查：没有绝对路径、盘符路径或 `..` 穿越条目。安装时没有运行 Hello World 生成器、没有生成 OAuth 页面，也没有修改官方文件。

外层官方安装器将 `/usr/bin/unzip` 写死，并会强制删除已有目标；它不适用于本项目的 Windows / fail-closed 约束。因此安装采用宿主 ZIP API：先校验固定哈希与安全路径，目标存在则中止，再原样提取。

## 2. 内置 `zhihu` Skill 与 CLI

黑客松包中的 `assets/zhihu-cli-skill.zip` 已独立校验并安装：

| 项目 | 结果 |
|---|---|
| 内层 ZIP 大小 | 42,489 bytes |
| 内层 ZIP SHA-256 | `BE08E10BBD8F7C554456599E1BDF9E4A4F9216A7624D0B29218E9E4DC1C2F9F3` |
| Skill 版本 | `0.2.1` |
| 安装目录 | `.codex/skills/zhihu/` |
| 普通文件数 | 12 |
| 完整性 | 安装目录相对归档 missing 0、mismatch 0、extra 0 |
| CLI 版本 | `0.5.0 windows-amd64` |
| CLI 路径 | `%LOCALAPPDATA%\ZhihuCLI\current\zhihu-cli.exe` |
| CLI 大小 | 6,891,008 bytes |
| CLI SHA-256 | `5C69E99414758AF5012B864D90169FC9BA4928DE946730154604D94DA570AB9B` |
| CLI 兼容性 | compatible = true |
| 系统改动 | 无管理员权限、未修改 PATH |

状态检查必须在 PowerShell 7 中运行：

```powershell
pwsh -ExecutionPolicy Bypass -File .codex/skills/zhihu/scripts/run.ps1 status
```

内置 v0.2.1 的 `run.ps1` 在 Windows PowerShell 5.1 会于第 66 行触发 `ParserError`，而同一未修改脚本在 `pwsh` 下正常工作。本项目不修补官方文件。

2026-09-04 现场补充：本机当前未安装 `pwsh`，`run.ps1` 状态检查暂不可用（是否安装 PowerShell 7 是单独决策）；`setup.ps1` 已在 Windows PowerShell 5.1 下成功完成一次全新安装。

### 已知版本漂移

状态检查显示，黑客松包固定的 Skill 是 v0.2.1，而当前线上 stable 是 v0.5.0（46,921 bytes，SHA-256 `5C5A7DAE36CABE4E92362E035ECBFFCA1E1B14C6479C28372A8E4A2E1CF99B82`）。当前 CLI 已是 v0.5.0 且与内置 Skill 兼容，但不能把内置 Skill 描述为最新版，也不能静默替换赛事包快照；升级必须作为单独决策进行并重新验证。

### Access Secret 人工步骤

2026-09-04 状态：用户已生成并提供 Access Secret；本机 CLI 二进制曾缺失，经官方 `setup.ps1` 重装 v0.5.0（SHA-256 与上表一致），Secret 已通过 `auth set --secret-stdin` 存入系统 keychain，`auth set` 返回 `status=READY`、`verification=valid`。Secret 原文不出现在任何仓库文件、文档、日志或交接记录中。`auth status --verify` 复验与 `me contents --limit 1` 最小业务验收尚未执行，留待首次真实业务调用时进行。

如需轮换或重新配置，步骤为：

1. 用户亲自打开 <https://developer.zhihu.com/profile>，登录并生成 Access Secret。
2. Agent 读取 `.codex/skills/zhihu/SKILL.md`，使用已验证的 CLI 绝对路径启动 `auth set --secret-stdin`。
3. Secret 只通过进程标准输入传入；不得出现在命令参数、源码、日志、fixture 或回复中。
4. 只有用户授权在线验证后才运行验证与最小业务请求。

OAuth 不属于当前核心产品输入路径，未初始化、未配置，也不会被当作 Access Secret 的替代品。

## 3. 刘看山素材包

| 原始压缩包 | 大小 | SHA-256 | 有效媒体 |
|---|---:|---|---:|
| `看山三视图.zip` | 76,105 bytes | `77B379D758C996E37A7571050C2687D52AA72AAED3034C7F348F84C7F66B3B06` | 3 JPG |
| `刘看山动态.zip` | 5,634,357 bytes | `F568FA507B0D0D7F7B54E1B4437B10145A4B0AFEE182789708218FF1296E1EF6` | 6 GIF |

两份 ZIP 均通过路径安全检查。正式安装只提取有效媒体；`__MACOSX`、`._*` 与 `.DS_Store` 未进入公开资源目录。原始 ZIP 与用户手动解压副本保留在工作区，通过根目录 `.gitignore` 排除，不进行删除。

正式资源位于 `public/assets/zhihu/liukanshan/`，逐文件来源名、目标名、大小、媒体参数和 SHA-256 记录在同目录 [manifest.json](../../public/assets/zhihu/liukanshan/manifest.json)。六个 GIF 均为 320×320、20 fps，且逐帧存在有效透明度信息；三张 JPG 和六个 GIF 均已通过解码检查。

许可说明：来源由用户提供为“官方黑客松素材包”；压缩包本身未包含 LICENSE、README 或具体授权范围，不据此推断赛事范围之外的授权。

## 4. 使用约束

- 知乎搜索结果中的 `ContentText` / `Summary` 只是摘要，不是完整正文，不能作为 `cases.createFromSource` 的 `source_text`。
- 所有知乎能力调用必须遵循项目级 `zhihu` Skill，并使用状态检查返回的 CLI 绝对路径；不得调用 PATH 中来源不明的同名命令。
- 官方素材只从清单中的项目路径使用，不从被忽略的原始解压目录建立运行时引用。
- 哈希、版本或目标目录出现偏差时直接停止，不能以“接近版本”或同名资源继续。
