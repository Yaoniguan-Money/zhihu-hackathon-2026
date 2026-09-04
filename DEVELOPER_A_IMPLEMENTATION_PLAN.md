# 开发人员 A 根目录权威实施计划

状态：**IN PROGRESS** — 本计划与迁移文档已建立；A1–A9 的工程、测试和部署尚未开始。

## 1. 目的、范围与权威性

本文件是开发人员 A 唯一可编辑的**实施顺序**事实来源。它将原 [开发人员 A 纵向实施计划](./docs/developer-a/IMPLEMENTATION_PLAN.md) 迁移到根目录；旧路径只保留跳转说明，不能再承载独立的实施步骤。

本次文档迁移只记录审计结果和后续执行顺序。它**没有**初始化项目、安装依赖、创建业务代码、配置 Secret、调用知乎 API，或把 D0 的提案当作已经生效的公开契约。

实施、评审和文档修正使用下列优先级。发生冲突时停止实现，先修正较低优先级的事实来源；禁止在代码中发明“兼容”行为。

1. 当前用户的明确决定。
2. [docs/adr/](./docs/adr/) 中已接受的 ADR。
3. [《证据链狼人杀_产品技术分工开发流程与数据接口_v2.0》](./证据链狼人杀_产品技术分工开发流程与数据接口_v2.0.md) 产品基线。
4. [CONTRACTS.md](./docs/developer-a/CONTRACTS.md)：跨端数据形状、运行时校验、公开错误语义。
5. [ENGINEERING_SPEC.md](./docs/developer-a/ENGINEERING_SPEC.md)：A1–A9 行为与架构。
6. 本计划：在不改变以上事实的前提下安排实施顺序、Gate 和验收证据。

开始任何环节前，先读 [CONTEXT.md](./CONTEXT.md)、[AGENTS.md](./AGENTS.md)、产品基线、相关 ADR、契约、工程规格、本计划以及相关交接记录。涉及官方 Skill、CLI、知乎接口或刘看山素材时，额外读 [OFFICIAL_RESOURCES.md](./docs/developer-a/OFFICIAL_RESOURCES.md)；实际调用知乎能力前还必须读项目内 [zhihu Skill](./.codex/skills/zhihu/SKILL.md)。

## 2. 审计现场：当前事实与 Gate

截至本计划建立时，现场事实如下；这些事实不是实现完成声明。当前进展以各阶段状态行与对应 handoff 为准：VCS0、PF0、D0、G0 与 PF1 已完成（Bun 1.4.1、Next.js 16.3.4、React 19.2.8、Convex 1.45.0、TypeScript 5.9.3 骨架与首个基线提交已建立；PF1 于 2026-09-05 完成本地后端运行时复验），A1–A9 的业务代码与业务测试仍为 0%。

- A1–A9 的业务代码、业务测试均为 0%；PF0 仅建立工具链骨架，不含业务实现。
- 根目录已存在 <code>package.json</code>、<code>bun.lock</code>、Next.js/Convex 配置与工具链冒烟测试（PF0 产物）。
- 当前机器已安装 Bun 1.4.1。
- Git <code>main</code> 已有本地基线提交，并按用户既有环节授权推送远端。
- 已有成果为规格/契约/ADR/交接文档、官方 Skill 与 CLI、3 个 JPG、6 个 GIF，以及 PF0 工具链骨架；它们仍不是可运行游戏。
- G0 已解除：用户提供的真实知乎 URL 与完整正文已冻结于 `golden-case/case-demo-001/`；G1 第二案件仍缺用户输入。
- 没有开发人员 B 已签署 Public Contract、认证设计或 P0 Cut 的证据。

| Gate / 阶段 | 当前状态 | 真实含义与解除条件 |
|---|---:|---|
| R0 资源完成 | COMPLETE | 文档、官方 Skill/CLI 与素材已审计；不等于工程或 Git 基线完成。 |
| VCS0 版本基线 | COMPLETE | Secret 扫描通过、纳入范围确认，基线提交 `cea25d5` 已建立；推送按用户既有环节授权执行。见 [VCS0 handoff](./docs/handoffs/2026-09-04-vcs0-version-baseline.md)。 |
| PF0 工具链骨架 | COMPLETE | Bun 1.4.1、Next.js 16.3.4、React 19.2.8、Convex 1.45.0、TypeScript 5.9.3 已固定；typecheck/test/build 验证通过。未实现公开 schema、产品页面或 XState。见 [PF0 handoff](./docs/handoffs/2026-09-04-pf0-toolchain-skeleton.md)。 |
| D0 契约修复与 B 评审 | COMPLETE | A 侧修复包 + B 侧签署均已完成：用户于 2026-09-04 会话中明确决定「D0 同意签署意见」，Public 类型、错误、认证与 P0 Cut 视为通过评审。见 [D0 A 侧 handoff](./docs/handoffs/2026-09-04-d0-contract-repair-a-side.md) 与 [D0 签署记录](./docs/handoffs/2026-09-04-d0-signoff.md)。 |
| G0 Golden Case 输入 | COMPLETE | 用户已提供真实知乎 URL（红歌会网专栏文章），完整正文经渲染抓取获得并冻结于 `golden-case/case-demo-001/`（含哈希与来源元数据）。见 [G0 handoff](./docs/handoffs/2026-09-04-g0-golden-case-source.md)。 |
| GC0 Golden Case 标注 | IN PROGRESS | 标注草案已产出（23 claims / 22 relations / 4+1 policies / golden answer / 8 catalog / rubric 100 / 代表性 fixtures），全部经脚本程序化验证；待 A/B 与用户按确认清单逐项确认后冻结。见 [GC0 草案 handoff](./docs/handoffs/2026-09-05-gc0-annotation-draft.md)。 |
| G1 第二案件输入 | BLOCKED | 第一案件闭环后，由用户提供第二篇真实 URL 和完整正文。 |
| REL0 公网 P0 | BLOCKED | 依赖 TB10、P0 发布验收和已签署 Golden 系统案件。 |
| AUTH1 知乎 OAuth | BLOCKED | 是 P0 后的独立外部 Gate；不以 OAuth 阻塞游客 P0。 |

## 3. D0：契约修复包与共同评审 Gate

D0 是后续 Public schema 的前置条件，而不是可由实现者自行猜测的设计清单。A 先更新 [CONTRACTS.md](./docs/developer-a/CONTRACTS.md) 和 [ENGINEERING_SPEC.md](./docs/developer-a/ENGINEERING_SPEC.md)；若有意偏离产品 v2.0，再新增并接受 ADR。随后 B 对 Public 类型、错误、认证、状态和 P0 Cut 签署。**在签署前，下列内容均为提案，不能写进生产行为。**

### 3.1 案件目录、编译与访问模型

- 新增 <code>CaseCatalogItemPublic</code> 与 <code>cases.listPublic</code>，只列出已批准且 <code>ready</code> 的系统案件。用户创建的案件默认仅创建者可见，不能进入系统目录。
- 将 <code>cases.createFromSource</code> 改为 Durable Case Compilation：首先返回 <code>CaseCompileReceipt</code>，再以 <code>cases.observeCompilation</code> 观察 <code>accepted / working / succeeded / failed</code>。任何失败均不得留下可玩 Case。
- P0 采用 Convex Auth 的 Anonymous 身份。Case 与 Session 权限一律从服务端认证上下文获得，不在业务对象中携带访问令牌。系统案件可读；私人案件和 Session 仅 Owner 可读写；越权与不存在资源返回相同安全结果。
- Convex Auth 处于 beta 的兼容风险必须用固定版本和兼容 smoke 管控；不能通过时保持 BLOCKED，禁止自制鉴权兜底。参考：[Convex Auth](https://labs.convex.dev/auth)。

### 3.2 匿名建案反滥用与失败语义

- 匿名建案必须提供邀请码。邀请码只保存哈希，可设置过期、撤销和总使用次数；绝不把明文写入业务对象、日志、fixture、计划或 handoff。
- 配额按身份均衡执行：滚动 24 小时最多 3 次、同时最多 1 次、全站 UTC 日最多 50 次；Canonical Source 最多 30,000 UTF-16 code units。幂等命中发生在额度扣减之前；超长正文直接拒绝，绝不截断。游玩系统案件不消耗建案额度。
- 新增 <code>AUTH_REQUIRED</code>、<code>CASE_CREATION_NOT_ALLOWED</code>、<code>RATE_LIMITED</code>、<code>SOURCE_TOO_LONG</code> 等安全 Public Error，并建立“私有失败 × 操作上下文 → 公开错误”的完整映射矩阵。

### 3.3 Session、公开查询与开场编排

- <code>messages.listPublic</code> 的 v1 返回当前 Session 的全部公开消息，按 <code>created_at + message_id</code> 稳定排序；删除未定义的 <code>after</code>。增量恢复仅使用已有的 <code>events.listPublic(after_sequence)</code>。
- 阶段与玩家写操作固定为：<code>briefing</code> 只允许 <code>start</code>；<code>opening_statements</code>、<code>judging</code>、<code>revealed</code>、<code>failed</code> 不接受玩家写操作；<code>investigation</code> 按资源前置条件动态开放 <code>ask / update_board / accuse</code>。<code>save_recording / present_recording</code> 属于 P1 后再开放。
- <code>game.start</code> 按 <code>CasePublic.roles</code> 的固定顺序串行执行五条开场。一次只创建一个活动 Ticket；前一条成功后才创建下一条，禁止预建队列。五条全部批准后进入 <code>investigation</code>；任一失败进入 <code>failed</code>，已发布的消息和事件保留为真实历史。
- 删除未定义的 server-only <code>role_confrontation</code>。首版“角色互咬”归入 P1：仅由 <code>presentRecording</code> 触发，回应必须引用该 Recording 的来源 Message 或允许的 Claim。

### 3.4 Evidence、模型候选、Parser 与 Reveal

- 为 Case Private 增加私有 Evidence Catalog，保存静态证据的类型、标题、正文、公开 Claim 引用和冲突关系。Unlock Rule 只能引用 Catalog 已存在的条目。Recording Evidence 动态创建，公开 Claim 引用不得直接暴露 Message 私有 <code>support_claim_ids</code>。
- 版本化 Claim Extractor、Case Compiler、Validator、Reveal 的模型输入/输出 schema。模型只能产生临时候选键与内容；可信 ID、角色分配、Evidence 解锁、评分、重写次数和发布状态均由服务器决定。
- 段落定义为“由一个或多个空白行分隔的最大非空行块”。Quote 只在块中每个非空行去除水平空白后均以 <code>&gt;</code> 开头时识别。增加 <code>CanonicalParagraphPrivate</code>；Source Span 始终使用未改写正文上的 UTF-16 半开偏移。
- <code>evidence_score</code> 使用 Golden Case 的加权 Evidence criteria：权重均为整数、总和恰为 100；选中 Evidence 仅在类型允许、命中允许 Claim，且要求时来自指定 Role Quote 时获得该项权重。
- <code>questioning_score</code> 固定为：成功审讯覆盖每个不同 Role 8 分、最多 40；同一 Role 的首问后每次成功追问 10 分、最多 30；成功审讯产生新 Evidence 每次 10 分、最多 30。开场与录音投递不计入该分数。
- <code>player_correct</code>、分数、truth chain 和 altered links 均由服务器确定；Reveal 模型只产生带 Claim 引用的解释和 Reality Mapping 候选。候选验证失败时整个 Reveal 失败，不能公开部分结果。

### 3.5 D0 交付物

1. Interface → Ticket、phase → action、Private Failure → Public Error 三张完整矩阵。
2. Public/Private runtime schema 的变更说明和相应 fixture 更新计划。
3. B 的可追溯评审/签署证据。
4. [D0 handoff](./docs/handoffs/) 说明变更、验证、风险和下一步；不得含 Secret、私有候选、Fidelity、GM 真相或未解锁 Claim。

## 4. 执行依赖图

~~~text
R0（资源完成）→ VCS0 → PF0
D0 + PF0 → PF1
G0 + D0 → GC0
PF1 + GC0 → TB1 → TB2 → TB3 → TB4 → TB5 → TB6
                                            ↓
                     TB7 → TB8 → TB9 → TB10 → REL0
                                                 ├→ P1-1 Recording / 对质
                                                 ├→ P1-2 本地 Voice
                                      G1 ────────└→ P1-3 第二案件 → REL1

AUTH0 + REL0 → AUTH1 知乎 OAuth（独立后续阶段）
~~~

其中 AUTH0 是 PF1 建立并验证的 Anonymous 身份能力。图中的箭头表达最小依赖；任何阶段若触及未经 D0/B 审核的 Public Contract，仍须停止。

## 5. 阶段、产物与验收

| 阶段 | 状态 | 实施结果与关键验收 |
|---|---:|---|
| VCS0 版本基线 | COMPLETE | 已完成：Secret 扫描通过，基线提交 `cea25d5` 建立，并按用户环节授权推送。见 [VCS0 handoff](./docs/handoffs/2026-09-04-vcs0-version-baseline.md)。 |
| PF0 工具链骨架 | COMPLETE | 已完成：Bun 1.4.1 固定，Next.js 16 / React 19 / TypeScript / Convex 骨架与测试、typecheck、build 命令就绪；无公开 schema、页面或 XState。见 [PF0 handoff](./docs/handoffs/2026-09-04-pf0-toolchain-skeleton.md)。 |
| D0 契约修复与 B 评审 | COMPLETE | 已完成：契约/规格/ADR 0004、三张矩阵、fixture 计划均已落地，B 侧已签署（2026-09-04 用户明确决定）。见 [D0 签署记录](./docs/handoffs/2026-09-04-d0-signoff.md)。 |
| PF1 Schema、Auth 与模型 Seam | COMPLETE | contracts 三入口 + 严格 runtime schema、八项显式 <code>AI_*</code> 配置、生产 OpenAI-compatible Adapter 与测试 Scripted Adapter 已完成并测试通过；2026-09-05 在 ASCII 路径本地后端完成 schema push 与 <code>auth:signIn</code> 匿名会话复验，同日以 DeepSeek 完成真实供应商 smoke 后关闭。见 [PF1 handoff](./docs/handoffs/2026-09-04-pf1-schema-auth-model-seam.md) 与 [AI 配置 handoff](./docs/handoffs/2026-09-05-ai-config-deepseek-smoke.md)。 |
| GC0 Golden Case 标注 | IN PROGRESS | 标注草案已产出并全部程序化验证（23 claims / 22 relations / 4+1 policies / golden answer / 8 catalog / rubric 100 / 代表性 fixtures）。用户于 2026-09-05 夜间明确指示：手动验收环节一律跳过、留待批量验收——草案即日起作为 TB1+ 工作基线；九项清单最终确认与冻结签署延后批量验收，未完成前 GC0 不标记 COMPLETE。见 [GC0 草案 handoff](./docs/handoffs/2026-09-05-gc0-annotation-draft.md)。 |
| TB1 Source 与 Durable 建案 Walking Path | COMPLETE | 已完成：A1 纯函数、幂等/邀请码/三重额度、durable 编译 Ticket、原子持久化与 13.3 错误映射；本地后端集成测试 10 项 + 真实模型编译端到端（DeepSeek）通过。见 [TB1 handoff](./docs/handoffs/2026-09-05-tb1-source-durable-creation.md)。 |
| TB2 生产 Evidence Graph / Case Compiler | IN PROGRESS | Golden 系统案件种子（冻结 JSON 直接落库）、编译器完整校验（Span、Relation、4+1 Role、Policy、Evidence Catalog、评分 rubric、Public Projection）、<code>cases.getPublic</code>/<code>cases.getSource</code>。 |
| TB3 Session Authority 与公开查询 | BLOCKED | 实现 <code>sessions.create/getPublic</code>、<code>messages.listPublic</code>、<code>events.listPublic</code>；证明 Owner 隔离、初始 <code>briefing</code>、Board revision 0、连续公开事件及刷新恢复。 |
| TB4 Faithful 成功回合 | BLOCKED | <code>roleTurns.ask/observe</code> 经幂等、阶段、排他锁、可见 Claim、Generator、Validator 后，只发布完整 entailed Message。 |
| TB5 Faithful 重写与失败 | BLOCKED | 覆盖字面初次通过、第一次重写通过、第二次重写通过、三次均拒绝；协议/请求失败不得进入语义重写。 |
| TB6 Distorted 回合 | BLOCKED | 只使用可见来源材料和 Policy allowlist 中的 Distortion Type；新事实、未授权类型或验证失败立即终止，公开结果不泄露 Fidelity。 |
| TB7 Session Start 与五条开场 | BLOCKED | <code>game.start</code> 幂等，按固定 Role 顺序串行运行五个完整 Validator 回合；全部成功才进入调查，失败终止且不回滚已发布历史。 |
| TB8 Evidence 与 Board | BLOCKED | 实现 <code>evidence.getAll/updateBoard</code>、服务器解锁、Catalog 投影、全量 Board CAS；覆盖未解锁/跨 Session Evidence、重复 placement、自连、未放置 link 与 revision conflict。 |
| TB9 Final Accusation 与 Reveal | BLOCKED | 实现 <code>game.accuse/getReveal</code>、确定性正确性与两项分数、严格 Reveal 候选校验与原子发布；提前读取返回 <code>null</code>。 |
| TB10 P0 全链证明 | BLOCKED | 覆盖所有 P0 写接口的幂等、并发、lease、公开/私有泄漏扫描、恢复、审计事件和聚合指标；完成一次真实模型供应商 smoke。 |
| REL0 公网 P0 | BLOCKED | Web/API 默认部署 Vercel、权威数据部署 Convex Cloud；先部署兼容 schema/functions，再部署客户端；发布已签署 Golden 系统案件，验证匿名多用户隔离、邀请码额度、生产 build、日志、指标与回滚点。 |
| P1-1 Recording / 对质 | BLOCKED | 实现 <code>saveRecording/presentRecording</code>；只能保存 Approved Role Message，投递回应引用具体 Message/Claim，并与 <code>ask</code> 共用锁。 |
| P1-2 本地 Voice | BLOCKED | Windows/Python 3.11 CPU 基线，一个只绑定 <code>127.0.0.1</code> 的常驻 Python Worker 同时加载 SenseVoice/FSMN-VAD 与 Kokoro；Next 同源 Route 是 Browser 唯一入口。模型、voice pack 和 Python wheel 固定 revision/hash，五音色经 A/B 真人试听后锁定；ASR/TTS 幂等结果持久化，原始音频及时删除。当前 AMD 显卡不作为发布路径，不设 GPU 或浏览器朗读 fallback。 |
| P1-3 第二案件 | BLOCKED | 用第二篇真实 URL 与全文证明没有写死 Golden Claims、角色、答案、Policy 或 Evidence；不得以合成内容替代。 |
| REL1 P1 验收 | BLOCKED | Recording、对质、本地 Voice 和第二案件分别验收；P1 失败绝不回写为 P0 已完成。 |
| AUTH1 知乎登录 | BLOCKED | P0 先使用游客身份。只有取得 App ID/App Key/Access Secret、公网 HTTPS callback、稳定用户标识，并确认 state/CSRF、过期、撤销等官方协议后，才把匿名用户安全绑定为知乎账号。OAuth Token 仅存服务端，最终授权由用户本人完成。不得修改官方 Skill，也不得让 OAuth 阻塞 P0。 |

## 6. Public Interface → 阶段矩阵

所有参数、返回值、错误和投影都必须经过 runtime schema；下面的映射是首次完整实现与定向验收的唯一主阶段。

| 域 | Public Interface | 主阶段 | 关键边界 |
|---|---|---|---|
| 建案 | <code>cases.createFromSource</code> | TB1 | 异步 Durable receipt、身份/邀请码/额度、正文上限、幂等、原子失败。 |
| 建案 | <code>cases.observeCompilation</code> | TB1 | 仅公开 <code>accepted / working / succeeded / failed</code>，不可枚举私人案件。 |
| 案件 | <code>cases.listPublic</code> | TB1 | 只列 approved + ready 系统案件。 |
| 案件 | <code>cases.getPublic</code>、<code>cases.getSource</code> | TB2 | Owner/系统可见性、Public Projection 与 Source 投影隔离。 |
| Session | <code>sessions.create</code>、<code>sessions.getPublic</code> | TB3 | Owner 隔离、初始 briefing、Board revision 0。 |
| Session | <code>messages.listPublic</code>、<code>events.listPublic</code> | TB3 | 全量稳定消息排序、事件 sequence 恢复和无私有泄漏。 |
| 游戏 | <code>game.start</code> | TB7 | 一次一个开场 Ticket、固定 Role 顺序、历史保留、失败终止。 |
| Role | <code>roleTurns.ask</code>、<code>roleTurns.observe</code> | TB4–TB6 | Faithful、重写、Distorted、锁、lease、不可枚举 observe。 |
| Role | <code>roleTurns.presentRecording</code> | P1-1 | 只允许 P1 Recording 驱动的对质，复用 ask 锁。 |
| Evidence | <code>evidence.getAll</code>、<code>evidence.updateBoard</code> | TB8 | Catalog 投影、解锁限制、全量 CAS Board。 |
| Evidence | <code>evidence.saveRecording</code> | P1-1 | Approved Role Message 来源、动态 Recording Evidence。 |
| Reveal | <code>game.accuse</code>、<code>game.getReveal</code> | TB9 | 判定/评分在服务器，完整原子 Reveal 或显式失败。 |
| Voice | 同源 transcriptions / approved-speech HTTP routes | P1-2 | Browser 不能直连 Worker，也不能提供自由文本、voice 或 pace。 |

## 7. Public Error → 主阶段矩阵

D0 负责冻结所有映射；此表指定每种公开错误的首次实现与验证主阶段。跨阶段复用同一错误时必须调用该阶段已有的映射，不能自行改写其语义。

| Public Error | 主阶段 | 主要上下文 |
|---|---|---|
| <code>INVALID_ARGUMENT</code> | PF1 | 所有 runtime input schema 与 UUID/未知字段拒绝。 |
| <code>AUTH_REQUIRED</code> | PF1 | Anonymous Auth 上下文缺失或不可用。 |
| <code>CASE_CREATION_NOT_ALLOWED</code> | TB1 | 邀请码失效、撤销、用尽或身份不允许建案。 |
| <code>RATE_LIMITED</code> | TB1 | 身份并发/滚动额度或全站 UTC 日额度耗尽。 |
| <code>SOURCE_TOO_LONG</code> | TB1 | Canonical Source 超过 30,000 UTF-16 code units。 |
| <code>SOURCE_INVALID</code> | TB1 | URL/正文格式、正文为空、段落/Span 解析失败。 |
| <code>CASE_NOT_FOUND</code>、<code>CASE_NOT_READY</code>、<code>CASE_COMPILE_FAILED</code> | TB1 | 安全 Case 查询或 Durable 编译终止结果。 |
| <code>SESSION_NOT_FOUND</code> | TB3 | 安全 Session 查询与 Owner 隔离。 |
| <code>ROLE_NOT_FOUND</code>、<code>SESSION_PHASE_CONFLICT</code> | TB4 | Role 选择、动态 allowed action 与阶段控制。 |
| <code>IDEMPOTENCY_CONFLICT</code> | PF1 | 所有写接口的 canonical payload hash 规则。 |
| <code>ROLE_TURN_BUSY</code>、<code>ROLE_TURN_FAILED</code> | TB4 | Ticket 排他锁、lease 与 Faithful/Public 私有失败映射。 |
| <code>EVIDENCE_UNAVAILABLE</code>、<code>BOARD_REVISION_CONFLICT</code> | TB8 | 解锁、Session 归属、Board placement/link 与 CAS。 |
| <code>REVEAL_UNAVAILABLE</code>、<code>REVEAL_FAILED</code> | TB9 | 提前读取与完整 Reveal 原子失败。 |
| <code>VOICE_AUDIO_TOO_LONG</code>、<code>VOICE_NO_SPEECH</code>、<code>VOICE_ASR_FAILED</code>、<code>VOICE_TTS_FAILED</code> | P1-2 | 同源 Voice Route 与本地 Worker 失败，保留文字路径。 |
| <code>SERVICE_NOT_CONFIGURED</code>、<code>SERVICE_UNAVAILABLE</code>、<code>INTERNAL_INCIDENT</code> | PF1 | 显式配置、服务可用性、脱敏 incident 关联的跨域基础映射。 |

## 8. A1–A9 → 阶段矩阵

| 责任 | 主阶段 | 完成证据 |
|---|---|---|
| A1 Article Parser | TB1、TB2、P1-3 | Canonical Source、段落/Quote、UTF-16 Span 与两篇真实来源的字面验证。 |
| A2 Claim Extractor | TB1、TB2、P1-3 | 版本化候选 schema、服务器 ID 分配、Graph 不变量与 Golden 对照。 |
| A3 Case Compiler | TB1、TB2 | 5 Role/4+1、Policy、Evidence Catalog、评分 rubric 和 Public/Private 隔离。 |
| A4 Faithful Generator | TB4、TB5、TB7 | 成功候选、最多两次语义重写、开场同一 Validator 路径。 |
| A5 Distortion Engine | TB2、TB6、P1-1 | allowlist Distortion、无新事实、Recording 驱动对质。 |
| A6 Validator | TB4–TB7、TB9 | 语义边界、重写判定、开场与 Reveal 候选校验、隐私错误映射。 |
| A7 GM / Reveal | TB9、P1-3 | 确定性正确性/评分/真相链，完整 Reveal 或失败。 |
| A8 Convex 数据与 actions | VCS0、PF0、PF1、TB1–TB10、REL0 | Auth、schema、Durable work、幂等、锁、事件、部署与审计。 |
| A9 本地 Voice Adapter | P1-2、REL1 | CPU-only Worker、固定供应链、MIME/时长校验、ASR/TTS 与文字恢复。 |

## 9. 每个阶段的强制执行和交接定义

每个 VCS/PF/D0/GC/TB/REL/P1/AUTH 环节都依照以下顺序执行；少一项不得标记 COMPLETE。

1. 在该阶段最高层 Public Interface 写可观察的 Red 测试。
2. 只实现使该纵向行为 Green 的最小生产行为；不提前实现后续 ticket。
3. 同步更新 runtime schema、fixture 和受影响的权威文档。Public Contract 变化必须先经 B 评审。
4. 运行 targeted test 与 typecheck；发布 Gate 再运行相关完整套件和一次真实模型供应商 smoke。
5. 分别完成 Standards Review 和 Spec Review；前者检查仓库规则/代码异味，后者核对用户决定、ADR、v2.0、契约、规格与范围。
6. 向 B 交付接口、错误、fixture、可见状态和边界说明；没有 B 端变更也必须明确写“无 B 端契约变化”。
7. 创建或更新 [docs/handoffs/&lt;stage&gt;.md](./docs/handoffs/) 并更新索引。记录必须含阶段 ID、状态、完成时间、负责人、实际完成/未完成、修改文件、权威文档变更、验证、风险/阻塞、下一步和最小阅读顺序。

交接记录和计划不得记录 Secret、邀请码明文、OAuth Token、完整私有 Prompt、私有候选、Fidelity、GM 真相、未解锁 Claim 或模型原始输出。没有规范事实变化时 handoff 必须明确写“无规范变更”，不得复制规格内容充数。

## 10. P0、P1、发布与 OAuth 边界

### P0：可多人在线的文字核心

P0 包含已批准系统案件目录、邀请码保护的匿名建案、Session、五条开场、审讯、Evidence Board、Final Accusation、完整 Reveal、匿名多用户隔离和公网部署。用户案件默认私有；进入系统目录只能由内部操作并经过 A/B Golden 审批。

REL0 默认使用 Vercel 部署 Web/API、Convex Cloud 作为权威数据。部署顺序是兼容 schema/functions 在前、客户端在后；发布后验证生产 build、匿名用户隔离、邀请码额度、日志、指标、回滚点和已签署 Golden 系统案件。A 负责 Convex、模型、后端安全与运行证据；B 负责页面、认证交互和客户端错误呈现。

### P1：不阻塞 P0 的扩展

- P1-1：Recording Evidence 与角色对质。
- P1-2：仅本机 CPU 演示的本地 Voice。候选基线是 SenseVoiceSmall/FSMN-VAD、Kokoro 0.9.4 与 Misaki 中文 0.9.4；实际锁定前必须完成本机 smoke、权重哈希和 A/B 中文音色试听。参考：[SenseVoice](https://github.com/QwenAudio/SenseVoice)、[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)。
- P1-3：第二篇真实案件，证明没有硬编码第一案件。

P1 项目失败或阻塞时，只能保持 P1 BLOCKED/FAILED，不能改写为 P0 已完成。

### AUTH1：知乎 OAuth

P0 使用 Anonymous 身份。AUTH1 只有在 App ID、App Key、Access Secret、公网 HTTPS callback、稳定用户标识，以及 <code>state</code>/CSRF、过期、撤销等官方协议均已确认后才能开始。Token 只在服务端保存，用户亲自完成最终授权。不得修改官方 Skill，不能使用 OAuth 作为 P0 的阻塞理由，也不能在无确认协议时编写自定义降级认证。

## 11. 本文件的交付验证

本次和之后的计划维护均须满足：

- 所有 Markdown 本地链接可解析；旧计划文件只保留迁移链接。
- [AGENTS.md](./AGENTS.md)、[开发人员 A README](./docs/developer-a/README.md)、[handoff 索引](./docs/handoffs/README.md)和历史记录均指向本根计划，不存在第二份实施顺序。
- A1–A9、每个 Public Interface、每个 Gate 和每个 Public Error 都能在本计划映射到唯一主阶段。
- 当前状态与现场一致，不宣称已有源码、测试、提交、Golden Case、B 评审或部署。
- Secret、邀请码明文、OAuth Token、Prompt、私有候选、Fidelity、GM 真相和未解锁 Claim 不进入本计划或 handoff。
- 不运行会重写文件的 formatter；变更后人工审阅完整 diff，并记录文档检查命令与结果。

不编造日期或工期。阶段状态仅使用 **READY / BLOCKED / IN PROGRESS / COMPLETE / FAILED**，并只能由可验证结果和相应 handoff 更新。
