# 证据链狼人杀（Evidence Chain Werewolf）

输入一篇真实知乎文章，AI 抽取带精确原文回溯的证据图谱，并编排五个角色：**四个忠实角色**只发布被可见事实支持、不改变原意的陈述；**一个篡改角色**只能使用原文材料、却按获准方式（扩大范围、删除条件、因果偷换等 10 类）悄悄改变事实关系。玩家审讯角色、把已批准发言保存为录音证据投递对质、在证据板上拼出真相，最终提交「角色 + 篡改方式 + 证据」的最终指控，获得展示「来源事实 → 角色转述 → 被改变关系」的完整揭晓与双维评分。

- **线上入口**：https://zhihu-hackathon-2026.vercel.app （产品界面由页面侧接入；后端数据面已可完整游玩）
- **权威数据**：https://agile-turtle-860.convex.cloud

## 架构一览

```text
Source Snapshot（URL + 完整正文）
  → Canonical Source（逐字规范化，UTF-16 Span 精确回溯）
  → Claims + Relations（证据图谱，版本化模型候选 schema）
  → Case Public / Private（五角色 4+1、可见集、证据目录、评分 rubric）
  → Role Turn（生成 → Validator → 按角色忠实性的唯一重写规则 → 原子发布）
  → Evidence / Recording / Board（服务器权威解锁、录音对质、CAS 证据板）
  → Final Accusation + Reveal（服务器判定与评分，完整原子揭晓）
  → 本地语音（SenseVoice ASR + Kokoro TTS，仅 127.0.0.1）
```

核心设计约束（详见 [`AGENTS.md`](./AGENTS.md)、[`docs/developer-a/CONTRACTS.md`](./docs/developer-a/CONTRACTS.md)）：

- 完整正文是建案必需输入；URL 只记录来源，运行时不抓取正文。
- 模型输出只是候选：schema、引用、权限、投影校验全部在服务端；原始 token 永不出后端。
- 失败是显式结果：typed failure、无默认值、无隐藏重试、无部分成功。
- 幂等（client_action_id）、排他锁 + lease、Owner 隔离、公开/私有事件双序列。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `convex/` | Convex 权威数据与 actions（案件、对局、回合、证据、语音） |
| `server/` | 纯函数域层：来源规范化、编译器、回合引擎、模型网关 |
| `contracts/` | shared / public / private 三入口运行时 schema（跨端唯一事实来源） |
| `app/`、`lib/` | Next.js 骨架页与同源 Voice Route |
| `voice-worker/` | 本地语音 Worker（Python 3.11，仅绑 127.0.0.1） |
| `golden-case/` | 冻结的真实来源案件（001 手工标注；002 真实管线编译） |
| `tests/` | 本地后端集成测试 + Scripted 引擎测试 + opt-in 真实模型/worker 冒烟 |
| `docs/` | 契约、工程规格、ADR、交接记录（`docs/handoffs/`） |

## 本地开发

```bash
bun install
bun run typecheck && bun test        # 全套件（模型/worker 测试显式 opt-in）
bun run dev                          # Next.js（后端数据面见 docs/handoffs）
```

真实模型冒烟（需 `.env.local` 中八项 `AI_*` 显式配置）：

```bash
RUN_MODEL_INTEGRATION=1 bun test tests/p13-second-case.test.ts
```

本地语音（模型已按 `voice-worker/models-manifest.json` 哈希固定）：

```bash
cd voice-worker
.venv/Scripts/python.exe download_models.py --verify
.venv/Scripts/python.exe worker.py   # 监听 127.0.0.1:8717
```

## 状态

- **P0 公网闭环**：COMPLETE（建案/对局/审讯/证据板/指控/揭晓 + 匿名隔离 + 公网部署）。
- **P1**：录音对质 ✅；本地语音 ✅（五音色已锁定）；第二案件真实编译 ✅（全链闭环 smoke 待供应商额度恢复后补跑）。
- 待办：知乎 OAuth 登录（等赛事项目分配 App ID/App Key）、REL1 批量验收。
