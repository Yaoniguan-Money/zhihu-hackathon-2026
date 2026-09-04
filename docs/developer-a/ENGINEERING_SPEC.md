# 开发人员 A：Evidence / AI Engine 工程规格

状态：**规范性，业务实现尚未开始**。

本文规定 A1–A9 必须实现的行为。产品含义以根目录 v2.0 基线与已接受 ADR 为准；具体数据形状、运行时校验和错误码以 [CONTRACTS.md](./CONTRACTS.md) 为准。文中的“必须 / 不得”是发布要求，不是建议。

## 1. 问题与目标

“证据链狼人杀”要判断的不是一句话是否包含虚构词语，而是角色有没有用真实材料改变原意。系统必须把完整正文转化为可追溯的 Evidence Graph，再让角色在严格的可见 Claim 范围内生成陈述：Faithful Role 只能表达来源支持的含义，Distorted Role 只能使用来源材料实施获准的 Distortion Type。所有候选必须经过独立 Validator，只有 Approved Role Message 可以公开。

A 的目标是交付一条可验证闭环：

```text
Source Snapshot
  → Canonical Source
  → Claims + Claim Relations
  → Case Public / Private
  → Role Turn + Validator
  → Evidence / Recording / Board
  → Final Accusation + Reveal
  → local ASR / TTS
```

成功必须同时满足：来源可回溯、私有真相不泄漏、失败可观察、刷新可恢复、没有未声明降级。

## 2. 用户故事与范围

### 2.1 必须支持

1. 用户同时提交知乎来源 URL 与完整正文，创建一个五角色案件。
2. 玩家开始 Session 后获得五条经过批准的开场陈述。
3. 玩家以温和、直接或施压方式，用键盘或确认后的 ASR 文本审讯指定角色，并观察 Durable Role Ticket 直至成功或明确失败。
4. 玩家把 Approved Role Message 保存为 Recording Evidence，投递给另一角色进行具体对质。
5. 玩家查看已解锁 Evidence Fragment、保存 Evidence Board，并提交“角色 + Distortion Type + Evidence”的 Final Accusation。
6. GM 只在合法阶段读取私有真相，生成能够展示“来源事实 → 角色转述 → 被改变关系”的 Reveal。
7. 本地环境可以将一段中文语音转为待确认文本，并为 Approved Role Message 合成对应角色语音。
8. 刷新后，B 能从 Convex 的公开快照、事件序列和 Durable Ticket 恢复当前 Session。

### 2.2 所有权

| 编号 | A 的 Module / 责任 | 交付结果 |
|---|---|---|
| A1 | Source Ingestion | 正文规范化、段落/引用识别、精确 Source Span |
| A2 | Evidence Graph | Claims、Claim Relations、图谱不变量 |
| A3 | Case Compilation | 五个 Role、Case Public / Private、可见信息分配 |
| A4 | Faithful Generation | 仅基于可见 Claim 的忠实候选 |
| A5 | Distortion Engine | Distortion Type、单一篡改角色、获准操纵策略 |
| A6 | Validator | entailed / distorted / invalid 判定、忠实候选最多两次重写 |
| A7 | Reveal Engine | Final Accusation 判定、truth chain、altered links、Reality Mapping |
| A8 | Convex Authority | schema、actions、queries、事件、幂等、并发锁、匿名身份、邀请码与建案额度、恢复快照 |
| A9 | Local Voice | SenseVoice/FunASR ASR 与 Kokoro 中文 TTS Adapter |

B 拥有页面、XState、输入控件、打字机、播放器、Evidence Board 交互和动效。A 可以建立共享最小工程骨架与同源语音 Route Handler，但不得实现 B 的页面或状态机。Public contracts、Golden Case、Distortion Type 和发布验收必须由 A/B 共同评审。

### 2.3 明确不在范围

- URL-only 抓取、页面爬虫、用知乎搜索摘要自动建案。
- 生产环境中的样例案件回退、Scripted Model、Mock Role 或伪造 Reveal。
- B 的页面、XState、录音 UI、播放器和视觉动效。
- 公网语音部署、GPU 服务编排、GPT-SoVITS、音色克隆。
- 自动选择模型、供应商切换、浏览器 TTS、JSON 修复或隐藏重试。
- 未经确认的排行榜、多人房间、第三案件及 P2 表现功能。

## 3. 产品不变量

### 3.1 来源和图谱

- `source_url` 只作为来源记录；实际语义输入必须来自同次提交的完整 `source_text`。
- Canonical Source 不得从摘要、缓存、示例或模型补全产生。
- 每个 Claim 必须具有能精确切回 Canonical Source 的 Source Span。
- 每条 Claim Relation 的两端必须存在于当前 Evidence Graph。
- 新实体、数字、时间、事件或来源不能仅因模型输出而进入图谱或角色消息。
- 当前版本不验证 URL 页面与手动正文逐字一致，因此不得声称完成来源一致性认证。

### 3.2 案件和角色

- 一个可玩案件必须恰有五个唯一 Role：四个 Faithful Role、一个 Distorted Role。
- Persona 与 Fidelity 相互独立；公开 Persona 不得暗示 Fidelity。
- Faithful Role 的获准 Distortion Type 集合必须为空。
- Distorted Role 的获准集合必须非空，标准答案必须是该集合的非空子集。
- Role Agent 只能收到当前 Role Policy 允许的可见 Claim。
- 案件任一引用或不变量失败时，整个编译失败；不得发布部分 Case Public。

### 3.3 发布和裁决

- 模型只能生成候选 payload，不能生成可信服务端 ID、决定 Evidence 解锁或决定是否重试。
- 原始模型 token、候选、Validator 结果和私有错误不能发送给浏览器。
- 一条候选只有通过角色政策、事实、引用、schema 与 Public Projection 检查后才能成为 Approved Role Message。
- Evidence 解锁由服务器规则计算；客户端或模型提供的解锁列表不具有权限。
- GM 只能在提交合法 Final Accusation 后公开 Reveal；提前读取必须得到安全的 unavailable 结果。

## 4. 架构与深 Module

| Module | 小型 Interface | Implementation 隐藏的复杂性 | 依赖类别 / Seam |
|---|---|---|---|
| Source Ingestion（A1） | `ingest(SourceSnapshot) → CanonicalArticle` | BOM/换行规范化、段落与引用、Source Span | 进程内纯转换；不制造抓取 Adapter |
| Evidence Graph（A2） | `extract(CanonicalArticle) → EvidenceGraph` | 结构化生成、Claim 去重、Span 与关系端点校验 | Model Gateway：真实外部 Seam |
| Case Compilation（A3/A5） | `compile(EvidenceGraph) → CompiledCase` | 五角色、4+1 Fidelity、可见 Claim、篡改政策、Public Projection | 进程内规则 + Model Gateway |
| Role Turn Engine（A4/A5/A6/A8） | `ask`、`presentRecording`、`observe` | Turn Intent、上下文、生成、Validator、重写、批准、原子持久化、证据解锁、公开错误 | 最深 Module；Convex + Model Gateway |
| Reveal Engine（A7） | `evaluate(Session, FinalAccusation) → RevealResult` | 阶段门控、私有答案、评分、truth chain、altered links | Convex 私有数据 + Model Gateway |
| Convex Authority（A8） | 规范 action/query 与 realtime projection | schema、事务、幂等记录、Ticket lease、公开/私有事件 | 远端但自有 Seam；直接使用 Convex validators |
| Local Voice（A9） | `transcribe`、`synthesizeApproved` | 媒体校验、ASR/TTS 调用、文本完整性、显式错误 | 本地可替换 Seam；SenseVoice 与 Kokoro Adapter |

Role Turn Engine 的 Depth 来自把可见范围、生成、验证、重写、发布、事件和 Evidence 权限集中在三个公开入口后面。删除它会让这些规则扩散到多个 action 和调用方，因此它不是透传层。

只为真实变化建立 Seam：

- Model Gateway 有生产 OpenAI-compatible Adapter 与测试 Scripted Adapter。
- Voice 有真实本地 Provider 与可控测试 Adapter。
- Convex 使用官方运行时与本地测试环境，不额外包一层单实现 Repository。
- Source 规范化、案件规则等纯逻辑不为假想替换引入 Adapter。

## 5. 规范数据流

### 5.1 建案

```text
cases.createFromSource
  → 输入 schema 与幂等检查（幂等命中先于额度扣减）
  → 匿名身份、邀请码与额度检查
    （滚动 24h ≤3、并发 ≤1、全站 UTC 日 ≤50、正文 ≤30,000 UTF-16 code units）
  → 持久化编译 Ticket，立即返回 CaseCompileReceipt
  → worker：Source Ingestion
  → Evidence Graph structured generation
  → 图谱不变量检查
  → Case Compilation
  → Public / Private 物理分离检查
  → 原子保存 ready 案件，Ticket 记为 succeeded
```

`cases.observeCompilation` 只公开 `accepted / working / succeeded / failed` 与安全 Public Error；对不存在或不可访问的 Case 返回 `null`。编译任何步骤失败都返回 typed failure，不产生可玩的 Case Public。幂等重放返回首次保存的同一结果，不重复调用模型、不重复扣减额度。超长正文直接拒绝，绝不截断。用户案件默认仅创建者可见；进入系统目录只能由内部操作完成并经 A/B Golden 审批。

### 5.2 开场与审讯

1. `game.start` 原子改变 Session 阶段并按 `CasePublic.roles` 固定顺序串行调度五条 `opening_statement`：一次只存在一个活动 Ticket，前一条成功后才创建下一条，禁止预建队列。
2. 每条开场陈述经过与普通角色回合相同的生成、Validator 和批准流程。
3. 五条全部批准后 Session 才进入调查阶段；任一失败则 Session 进入显式 `failed`。
4. `roleTurns.ask` 先执行幂等、阶段、Role、`mode`、`source` 和并发检查，再原子保存玩家消息、`accepted` Ticket、公开事件与 Session 排他锁。
5. worker 将 Ticket 改为 `working`，读取对应 Role Policy 和可见 Claim，生成候选并调用 Validator。
6. 只有 Approved Role Message、私有 Validation Audit、公开事件和由服务器计算的 Evidence 解锁可以一起提交；之后 Ticket 才成为 `succeeded`。
7. 任一终止错误把 Ticket 改为 `failed` 并释放锁，不产生角色消息、Evidence 或 TTS 请求。

浏览器得到的是完整的 Approved Role Message。若要表现“流式”，B 只能在本地对批准文本做打字机动画；“未经批准的服务端 token 流”不属于产品能力。

### 5.3 Recording Evidence 与对质

- `evidence.saveRecording` 只能引用当前 Session 中已发布的 Approved Role Message；内容和 Claim 关联从服务器记录复制，客户端不能提交自由文本。
- `roleTurns.presentRecording` 只能引用当前 Session 已解锁的 Recording Evidence，并同样使用 Session 排他锁。
- 对质候选必须引用具体 Evidence、Message 或可见 Claim；泛化的新事实、跨 Session ID 和未解锁引用均失败。

### 5.4 Evidence Board

- Board 只容纳当前 Session 已解锁 Evidence Fragment。
- 客户端提交完整 Board 与 `expected_revision`；版本不一致显式失败，不自动合并或覆盖。
- Board 是玩家分析成果，不是 Evidence Graph 或 GM 真相的副本。

### 5.5 指控与 Reveal

1. `game.accuse` 先命中幂等记录，再验证阶段、Role、Distortion Type、Evidence 所属和解锁状态。
2. Session 进入 `judging` 后拒绝新的角色回合和指控修改。
3. Reveal Engine 读取 Case Private 与玩家 Evidence，保存 Final Accusation、评分和 RevealResult。
4. 只有完整结果成功持久化后 Session 才进入 `revealed`；失败进入显式 `failed`，不得展示部分答案。

`player_correct` 的判定固定为：嫌疑 Role 相同，且提交的 Distortion Type 集合与标准答案集合完全相同。Evidence 与提问质量单独计分，不使用未记录的隐藏阈值改变正确性。Evidence 权重 criteria 与 Questioning 计分公式以 [CONTRACTS.md](./CONTRACTS.md) 10.1 为唯一事实来源；Reveal 模型只产生解释与 Reality Mapping 候选，判定与评分全部由服务器完成。

### 5.6 本地语音

- ASR 是批量输入转换：同源 Route Handler 接收支持的音频，调用本地 SenseVoice/FunASR，返回最终中文 Transcript。
- 超过 30 秒的输入直接返回 `VOICE_AUDIO_TOO_LONG`，不得静默截断。
- ASR 成功只回填输入框；玩家确认后仍走 `roleTurns.ask`，并显式传 `source: "asr"`。
- TTS 请求只能引用 Approved Role Message；服务器读取 exact text、Role voice 与允许的 pace，再调用 Kokoro Adapter。
- TTS 输入文字必须逐字等于 Approved Role Message。`intensity` 只作为 UI / Rive 表演元数据，不承诺 Kokoro 声学强度控制。
- A9 当前只承诺本地运行。公网部署拓扑、容量和认证尚未决定，不能标记为已完成。

## 6. Model Gateway

生产 Adapter 使用 AI SDK 的 OpenAI-compatible provider 与结构化输出能力。配置项全部必填：

```text
AI_PROVIDER_NAME
AI_BASE_URL
AI_API_KEY
AI_CLAIM_MODEL
AI_CASE_MODEL
AI_ROLE_MODEL
AI_VALIDATOR_MODEL
AI_REVEAL_MODEL
```

不同任务可以显式填相同模型 ID，但不得通过代码默认继承。不得自动读取 `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY` 或其他工具的环境变量。配置缺失返回 `SERVICE_NOT_CONFIGURED`；SDK/provider 自动重试固定为 0。

结构化输出先经过严格运行时 schema：未知字段、未知枚举、越界数字、缺失引用均失败。模型协议错误不是语义重写机会；不得抽取自然语言代码块、补括号、修 JSON 或请求另一个模型。参考：[AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)、[AI SDK structured Output](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)。

Scripted Adapter 只存在于测试组合根，由测试显式注入；生产配置和构建路径不得引用它。

## 7. Validator 与唯一重写策略

### 7.1 Faithful Role

- 候选的全部支持 Claim 必须存在且属于该 Role 的可见集合。
- Validator 结果必须为 `entailed`，且候选不得引入无来源的新实体、数字、时间、事件或关系。
- 初始候选未通过语义验证时，可利用私有验证反馈重写；最多两次，总候选数最多三个。
- 第二次重写仍未通过时记录私有 `VALIDATION_EXHAUSTED`，公开仅返回 `ROLE_TURN_FAILED`。

### 7.2 Distorted Role

- 所有组成材料仍必须来自可见 Claim。
- Validator 结果必须为 `distorted`，检测类型非空且全部属于 Role Policy 的允许集合。
- 不得添加原文不存在的事实，也不得使用未授权 Distortion Type。
- 用户只批准 Faithful Role 的语义重写；Distorted Role 验证失败直接终止，不套用重写兜底。

### 7.3 不属于重写的错误

模型请求失败、超时、schema 错误、Validator 请求失败、Validator 协议错误、私有投影检查失败均立即终止。它们不能通过 JSON 修复、重复请求或供应商切换转化为成功。

## 8. 状态、幂等与并发

- Convex 是 Session 权威状态，XState 只能镜像 `SessionView` 与公开事件。
- 所有领域写操作必须携带调用方生成的 UUID `client_action_id`；服务器不得自动生成缺失值。
- 同一幂等键和同一规范化载荷返回第一次保存的同一 receipt / request / result，不重复调用模型或写事件。
- 同一幂等键但载荷不同返回 `IDEMPOTENCY_CONFLICT`。
- 幂等命中先于当前阶段的再次判断，使网络重放可以获得原结果。
- 建案额度扣减发生在幂等命中之后；同键同哈希重放不重复扣减额度，也不重复建案。
- 终止失败用同一 action ID 重放时仍返回原失败；用户主动重试必须创建新 action ID。
- 一个 Session 的开场、问答、录音投递和角色互咬共用一个角色回合排他锁。存在 `accepted` 或 `working` Ticket 时立即返回 `ROLE_TURN_BUSY`，不排队。
- Worker / lease 异常必须将 Ticket 明确标为失败并释放锁，不能自动再次调用模型。
- Convex 参数与返回值均使用运行时 validator；参考 [Convex validators](https://docs.convex.dev/api/modules/values)。外部模型调用放在 action，权威状态更改通过 internal mutation 完成；参考 [Convex actions](https://docs.convex.dev/functions/actions)。

## 9. 失败是结果，不是替代路径

允许的恢复只有两类：

1. Faithful Role 的初始候选加最多两次语义重写。
2. v2.0 明示的语音失败后文字路径：ASR 失败时展示错误并保留键盘输入，不得产生空 Transcript 或自动提交；TTS 失败时展示错误并保留已经批准的文字，不得改用备用音色、浏览器朗读或其他模型。

这两类恢复都必须可观察，不能把失败呈现为成功。

禁止：默认参数、默认模型、自动供应商切换、隐藏重试、生产 mock、样例案件替换、JSON repair、静默截断、部分 Case、部分 Reveal、旧值覆盖新 Board、catch-and-default、把失败状态渲染成空成功。

## 10. 安全与隐私

- Source Snapshot 是不可信数据，可能包含 prompt injection。任何正文中的命令、角色要求或格式指令都只被当作内容，不改变系统行为。
- 任何模型输出都是不可信候选；服务端重新验证 ID、Span、Role、Claim、Distortion Type、Evidence 权限与阶段。
- Public 与 Private contracts、validators、query/export 必须物理分离；不能先返回私有对象再依靠前端 `omit`。
- Role Agent 只能看到自身可见 Claim；Validator 与 GM 的特权上下文不得写入公开 Message、Event 或错误。
- API Key、Access Secret、Prompt、完整私有候选和私有 Validation Audit 不进入浏览器、常规日志、fixture 或错误响应。
- 日志默认记录 ID、hash、状态、耗时和 error code，不记录完整正文或密钥。
- `roleTurns.observe` 对不存在与无访问权的 Ticket 都返回同一结果，避免资源枚举侧信道。

## 11. 可观测性

每条建案和角色回合必须携带可关联字段：`case_id`、`session_id`、`request_id`、`client_action_id`、任务名和 attempt index。公开事件与私有审计使用独立连续序列，不能通过公开序号缺口泄露私有步骤。

私有审计记录：

- 明确配置的 provider label 与 model ID、调用耗时、可获得时的 token usage。
- schema failure、Validator status、unsupported spans、检测到的 Distortion Type、重写次数。
- Public Projection 检查、Evidence 解锁判定、幂等命中/冲突、Ticket lease 结果。
- Reveal 判定与 ASR/TTS provider 错误。

公开端只获得安全状态、Public Error 和可展示数据。至少聚合以下计数：案件编译/不变量失败、角色回合成功/失败/busy、幂等冲突、Validator 拒绝/耗尽、Reveal gate 拒绝、ASR/TTS 失败。不得提供会触发自动行为的 `retryable` 标志。

## 12. Golden Case 与验收

`case-demo-001` 必须由用户提供的真实知乎 URL 与完整正文构建，并由 A/B 共同确认 source、claims、relations、role policies、truth、distortion、代表性 faithful/distorted response、validation 和 reveal。

当前状态：**BLOCKED — awaiting user source URL and complete article text**。

收到输入前可以完成资源、文档和不依赖语义真值的共享骨架，但 A1–A7 的语义闭环不得宣称完成，也不得以合成文章、搜索摘要或 Hello World fixture 替代 Golden Case。

发布验收要求：

- A1–A9 各自存在可运行、可观察的完成证据。
- 四个 Faithful Role 经连续追问仍不越过来源；Distorted Role 的操纵可归类且不新增事实。
- 至少一次对质引用具体 Recording Evidence、Message 与 Claim。
- Evidence Board 的已解锁证据可以提交为 Final Accusation，Reveal 清楚展示被改变的关系。
- 刷新能从 SessionView、BoardState 与公开事件恢复。
- 本地 ASR/TTS 完成正常路径和两条可见失败路径；没有宣称公网语音能力。
- 相关测试通过，并分别完成 Standards Review 与 Spec Review。
