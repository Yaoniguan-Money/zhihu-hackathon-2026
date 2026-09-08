# 2026-09-08 开庭体验诊断：首句极慢/逐字缓慢/长时间无法交互/动画卡死/语音完全不朗读

状态：`complete`（诊断完成；按用户要求**不做任何修复**，全部修复动作见「明确未完成」）  
完成时间：2026-09-08  
负责人：AI 代理（诊断轮，只读排查 + 记录）

## 实际完成

1. 静态代码走查覆盖整条链路：`context/gameMachine.ts` → `convex/game.ts`（开场 Ticket 链）→ `server/turn-engine/run-turn.ts`（生成+校验循环）→ `app/game/interrogation/page.tsx`（开场剧场/输入门控）→ `components/ui/Typewriter.tsx` → 语音链（`VoicePlayer` → 同源 Route → `convex/voice.ts` → `voice-worker/worker.py`）。
2. 只读运行时取证（不改任何状态）：voice-worker health、worker `/tts` 直连合成、speech Route 无鉴权重放、`voice-worker/models/` 资产盘点。
3. 四类症状的根因全部定位到文件与行号；错误信息原文与时间证据已收集（见下）。

## 症状 → 根因映射

### 症状 1：开庭后"动画加载卡死"

- **根因 1.1（感知卡死，主导）**：开庭后首条开场陈述需约 30~120s 才由服务端发布（见症状 2 的时间构成）。期间界面只有 `animate-pulse` 占位"第一位角色正在起身…"（`app/game/interrogation/page.tsx` L471）和 3D 待机动画，没有任何进度反馈（无"第 N/5 条生成中"提示，`thinking` 气泡也仅短暂出现在 3D 场景）。用户感知即"卡死"。
- **根因 1.2（渲染压力，假说，待运行时 Performance trace 验证）**：`Typewriter` 每 46ms setState 一次 → `InterrogationPage` 整树重渲染。`InterrogationStage` 未做 `React.memo`，且每次渲染 `roles.map(...)` 生成新数组/新闭包（`app/game/interrogation/page.tsx` L147-159），5 个 `GlbCharacter` 与 drei `Html` SpeechBubble（`components/three/SpeechBubble.tsx`，DOM portal）随之重渲染；再叠加 `sessionPoller` 2.5s / `eventsWatcher` 1.8s 双轮询刷新 context（`context/gameMachine.ts` L253、L282）。WebGL 侧常驻负载：shadows + antialias + `dpr=[1,1.75]` + 5 个 GLB 骨骼/形变逐帧驱动 + `ContactShadows` + `Environment`（`components/three/InterrogationStage.tsx` L74-137）；首次进入还包含 dynamic import、5 个 GLB 加载与 `Preload all`。
- 已排除：GLB 资产缺失（`public/models/` 六个 GLB 均在，非 404 问题）。

### 症状 2：首句开场陈述"出来特别久"

- **根因 2.1（服务端串行链式生成，主导）**：五条开场严格串行——`convex/game.ts` `start` mutation 只创建第一条 ticket（L129-155）；`openingWorker` 每条成功后才经 `openingTicketFor` 创建下一条（L384-393）；五条全部成功才 `enterInvestigation`（L447-460）。任一条失败则整局 `failed`。
- **根因 2.2（单条耗时高）**：每条开场 = 1 次角色生成模型调用 + 1 次 Validator 模型调用（`server/turn-engine/run-turn.ts` L109-311，`maxAttempts` 循环，校验失败还会语义重写）。已有实测证据：
  - Round 0（`docs/handoffs/2026-09-08-round0-accuse-and-tour-fixes.md`）：Validator 延迟 19~111s 波动；
  - Round 9（`docs/handoffs/2026-09-08-round9-subtlety-prompt.md`）：自编译案件 5 条开场**约 6 分钟**；
  - Round 10（`docs/handoffs/2026-09-08-round10-regression-and-wrapup.md`）：角色生成 12~48s/条；自编译案件 Validator 大请求被供应商间歇拒绝（`VALIDATOR_REQUEST_FAILED`，5~31s 快速失败）会触发重写、进一步拉长。
- **根因 2.3（感知延迟，次要）**：客户端靠轮询感知新消息（`eventsWatcher` 1.8s，`gameMachine.ts` L282）与阶段（`sessionPoller` 2.5s，L253），首条消息最多晚 ~1.8s 呈现。

**阻塞时长构成（开庭 → 可自由交互）**：`5 × (角色生成 12~48s + Validator 19~111s)` ≈ 2.5~10 分钟（Round 9 实测 ≈ 6 分钟）+ 轮询感知 ≤2.5s。这同时解释症状 1（长时间无反馈）与症状 3（长时间无法交互）。

### 症状 2b：文本逐字"出来得特别慢"

- **根因**：`components/ui/Typewriter.tsx` L6-10 `PACE_MS = { slow: 95, normal: 46, fast: 24 }` ms/字。开场陈述全文逐字播放（`app/game/interrogation/page.tsx` L464-469）。按 300~600 字/条计，单条逐字需 14~57s（slow pace 更久）；五条累计可达 1~5 分钟。审讯阶段的角色回应同样走该组件（`components/DialogueList.tsx` L101-107）。

### 症状 3："出来之后很久还没有办法移动"

- **根因 3.1**：开场剧场 overlay 为 `absolute inset-0 z-30` 全屏覆盖（`app/game/interrogation/page.tsx` L321-336），拦截对 3D 舞台（选人）与右侧审讯记录面板的一切点击。
- **根因 3.2**：底部输入区仅在 `phase === "investigation"` 时渲染（同文件 L249）；而 phase 要等服务端五条开场全部完成后才翻转（`convex/game.ts` L447-460）。即用户被阻塞的时长 ≈ 症状 2 的总时长（2.5~10 分钟）。
- **根因 3.3（次要）**：首次进入 investigation 自动弹出 `GameTour` 聚光灯浮层（`app/game/interrogation/page.tsx` L143；`components/onboarding/GameTour.tsx`），需手动逐步点完才恢复自由操作。
- 附注：开庭期间 `DialogueList` 被强制 `speakingMessageId=null`（L242）且整个面板位于 overlay 之下——期间既不能点语音播放按钮，也不能存录音证据。
- 附注：第 5 条开场的打字机动画会被阶段翻转直接截断（overlay 随 `inOpening` 卸载），与"话没看完就进入审讯"的观感一致。

### 症状 4：语音模型完全没有发挥作用（不朗读开庭陈述、不朗读 NPC 发言）

四个独立原因叠加；**运行时取证已证明用户的语音模型与 worker 本身完全健康**，问题全部在浏览器侧调用链与产品实现：

- **根因 4.1（浏览器侧必现 401，最直接错误，已运行时实证）**：TTS 同源 Route 第一行就是 `requireBearer(request)`（`app/api/voice/messages/[message_id]/speech/route.ts` L29），要求 `Authorization: Bearer <token>`；但 `components/ui/VoicePlayer.tsx` L29-33 的 fetch **不携带 Authorization 头**。重放实证（2026-09-08，本地 dev :3000）：

  ```text
  POST /api/voice/messages/msg-diag-probe/speech   （无 Authorization 头）
  → HTTP 401  {"code":"AUTH_REQUIRED","message":"需要先建立会话身份"}
  ```

  即：**玩家点播放按钮，每次都收到这个 401**。更糟的是 `components/DialogueList.tsx` L87 渲染 `VoicePlayer` 时未传 `onError` → 错误被静默吞掉（`onError?.()` 为 no-op），按钮转一下圈就回到原样，无任何错误提示。ASR 同病：`components/ui/RecordButton.tsx` L43 提交 `/api/voice/transcriptions` 同样不带 Authorization（`app/api/voice/transcriptions/route.ts` L51 一样 `requireBearer`）——语音提问链路同样必 401。
- **根因 4.2（"自动朗读"从未实现）**：全代码库唯一 TTS 触发点是 `DialogueList` 里每条角色消息旁的手动播放按钮；`OpeningTheater` 完全没有渲染 `VoicePlayer`；不存在任何自动触发 speech 的代码路径（grep 证据：`new Audio` 仅出现在 `VoicePlayer.tsx`）。"开庭后自动朗读陈述 / NPC 发言自动朗读"不在当前实现中。`app/game/interrogation/page.tsx` L95-104 的 `speakingMessageId` 只是 **3D 口型动画的时长估算**（`len*140ms`、上限 20s），与真实语音无关——容易被误认为朗读功能。
- **根因 4.3（服务端阶段门禁，设计如此）**：`convex/voice.ts` `approvedEnvelope` L57-59 要求 `session.phase === "investigation"`，否则抛 `409 SESSION_PHASE_CONFLICT "当前阶段不能合成语音"`。即使补上鉴权，开庭阶段（opening_statements）也无法合成开场陈述语音。
- **根因 4.4（已排除）**：本地 voice-worker 与模型资产**健康**，不是本次问题来源（取证见下节）。

## 运行时取证结果（2026-09-08，只读命令）

| 项 | 命令/位置 | 结果 |
|---|---|---|
| worker 健康 | `GET http://127.0.0.1:8717/health` | `200 {"ok":true,"asr":true,"tts":true,"voice_pack_locked":true}` |
| 模型资产 | `voice-worker/models/` | `fsmn-vad`、`hf-cache`、`kokoro-82m`、`sensevoice-small` 齐备 |
| worker TTS 直连 | `POST /tts`（`{"text":"你好","voice":"voice-zh-01","speed":"normal"}`） | `200`，WAV 84044 字节，`X-Duration-Ms: 1750`，`X-Content-Sha256: sha256:af5ce9…3a23` |
| dev server | `GET http://localhost:3000` | `200`（在运行） |
| speech Route 无鉴权重放 | `POST /api/voice/messages/{id}/speech`（无 Authorization 头，模拟 VoicePlayer 行为） | `401 {"code":"AUTH_REQUIRED","message":"需要先建立会话身份"}` |
| 环境配置 | `.env.local` 键名盘点 | `VOICE_WORKER_URL`、`CONVEX_SITE_URL`、`NEXT_PUBLIC_CONVEX_URL`、`NEXT_PUBLIC_CONVEX_SITE_URL` 键均已配置 |

结论：**语音链路断点唯一且明确——浏览器组件从未成功把请求送达 worker**（401 卡在 Route 入口）；且产品根本没有"自动朗读"的实现。

## 错误信息清单（原文）

1. `401 AUTH_REQUIRED "需要先建立会话身份"` — speech/transcriptions Route 对无鉴权浏览器请求的必现响应（VoicePlayer/RecordButton 每次触发都会收到；因 DialogueList 未传 `onError`，玩家侧无感）。
2. `409 SESSION_PHASE_CONFLICT "当前阶段不能合成语音"` — `convex/voice.ts` `approvedEnvelope` 阶段门禁（若鉴权修复后，开庭阶段合成开场陈述语音仍会被拒）。
3. `VALIDATOR_REQUEST_FAILED`（Round 10 记录）— 自编译案件 Validator 大请求被供应商间歇拒绝，触发语义重写、延长开场。
4. 时间证据：角色生成 12~48s/条；Validator 19~111s；五条开场合计 ≈ 6 分钟（Round 9 实测）。
5. （已排除项）worker 启动失败类错误（如 "Kokoro 模型目录缺失"）未发生——worker 当前健康。

## 明确未完成

- 全部修复动作（用户本轮明确要求只诊断、只记录）：包括但不限于 VoicePlayer/RecordButton 附带鉴权、自动朗读能力、开场并行化/进度反馈、打字机节奏调整、渲染性能优化。均**未实施**。

## 修改文件

- `docs/handoffs/2026-09-08-opening-freeze-and-voice-silent-diagnosis.md` — 本诊断记录（新增）。
- `docs/handoffs/README.md` — 记录索引追加一行。

## 权威文档更新

无规范变更（纯诊断，未触碰 contracts、公开投影、服务端契约与任何生产代码）。

## 定向验证

- 只读运行时取证 5 项（见上表）— 全部按预期取证成功。
- `git status` — 确认除本记录与 README 索引外无任何代码/配置变更。
- 未运行测试套件与 typecheck（无代码变更，不适用）。

## 已知风险、阻塞与下一步（仅记录，不实施）

1. **语音 401（P0 级体验缺陷）**：`VoicePlayer`/`RecordButton` 需在请求中附带 Convex access token（如经 `convex/react` 的 `fetchAuth`/session token 机制）；同时 `DialogueList` 应透传 `onError`，否则错误永远静默。涉及浏览器↔Route 接口行为，属公开行为变化，需 B 评审。
2. **自动朗读属产品能力决策**：当前契约（CONTRACTS 14）只定义了手动播放；"开庭陈述/NPC 发言自动朗读"需要先在产品基线/契约层决策（且 `approvedEnvelope` 的 investigation-only 门禁需要一并评估），再谈实现。
3. **开场总时长**：串行五条 + 重模型/校验是根因；任何并行化或流式呈现都涉及 ENGINEERING_SPEC 5.2（"流式不属于产品能力"）与 CONTRACTS 11 的既定约束，需先动权威文档再动代码。
4. **打字机节奏**（46/95 ms/字）与开场 overlay 全屏阻塞属 B 侧交互取舍，调整前需 B 评审。
5. **渲染卡顿假说**（根因 1.2）待验证：DevTools Performance（Performance 面板，10s 采样）在开庭逐字阶段录制 Main thread 火焰图，确认是否 R3F/DOM 重渲染主导；若主线程空闲而画面掉帧，则转向 GPU 侧（shadows/dpr）排查。
6. Round 10 已记录的 Validator 大请求供应商拒绝问题是开场时长的外部放大器，其合规修法（Validator 提示词瘦身/路由）已有记录，与本诊断独立。

## 最小接手阅读顺序

1. `docs/handoffs/2026-09-08-round10-regression-and-wrapup.md`（Validator 供应商问题与十轮总评）
2. 本记录「症状 → 根因映射」与「运行时取证结果」两节
3. `app/api/voice/messages/[message_id]/speech/route.ts` + `components/ui/VoicePlayer.tsx`（401 断点）
4. `convex/game.ts` 开场 Ticket 链 + `server/turn-engine/run-turn.ts`（时长构成）
5. `docs/developer-a/CONTRACTS.md` 第 14 节（Voice 契约，评估自动朗读前的必读）
