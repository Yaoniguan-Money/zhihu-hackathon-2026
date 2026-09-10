---
status: accepted
---

# 流式语音管线（P1-2b）：Pipecat 式 Streaming ASR → Turn Detection → 流式 TTS

语音交互从「录音结束 → 整段 ASR → 玩家确认 → ask → 回合发布 → 分段取音频」的串行链路，重构为实时流式管线：用户讲话过程中持续做句段级 ASR 并把部分转写实时送回浏览器与后端做预分析；端点检测（turn detection）判定本轮讲话结束后立即完成最终确认并自动提交既有 `roleTurns.ask`；回合发布后直接进入流式 TTS，并支持播报中的用户打断（barge-in）。游戏业务（角色、文章、Evidence Graph、turn engine、Validator、RAG 语义）完全不变，只重构语音交互层。动机是把「说完之后」的等待（整段上传 + 解码 + 整段识别 + 手动确认点击）压缩到接近零，并把「回合发布之后」的首声延迟降到第一句合成时间。

## 决议（2026-09-09，用户明确决定重构语音层为流式管线）

1. **拓扑不变，传输升级**。Browser 仍不直连本地 Worker；Next 同源 Route 是唯一入口。新增三个同源端点（非公开 HTTP 契约形状之外的公开事件 schema 见 `contracts/public` 14.5）：
   - `POST /api/voice/stream/audio`：浏览器 AudioWorklet 采集的 16k PCM16LE 单声道小帧（约 375ms 一帧，头 `X-Stream-Id`/`X-Session-Id`/`X-Seq`），首帧创建流并绑定 session；
   - `GET /api/voice/stream/events`：JSON lines 下行事件流（`voiceStreamFrameSchema` 校验，`after_seq` 断线续传）；
   - `POST /api/voice/stream/control`：`speak`（只接受 message_id）/ `stop_speak` / `abort`。
   Node 侧编排器在 `server/voice-stream/`（进程内存注册表：并发上限 4、空闲 TTL 120s、挂 globalThis 防 HMR 丢失）。Worker 新增内部端点 `POST /vad`（独立 FSMN-VAD 实例 + 独立锁，可与 ASR/TTS 并行）与 `POST /asr/pcm`（PCM 直入跳过容器解码）；不新增模型文件，供应链哈希清单不变。**必须重启本地 worker 进程才生效**。

2. **句段级 cascading streaming，非 token 级**。SenseVoice 是非流式模型，不引入新流式 ASR 模型。管线用 FSMN-VAD 把用户语音切成句段：句段闭合（末端离缓冲尾 ≥220ms）即对该句段做完整 ASR，产出前缀单调追加的 `asr_partial`（不回改、不重复，适合打字机上屏与预分析）。最终确认（`asr_final`）= 已闭合句段缓存文本按序拼接——与批式路径质量等价，因为批式 `/asr` 内部同样先 VAD 分段再逐段识别；端点命中时不需要重跑整段 ASR，说完到 final 接近零延迟。

3. **Turn detection 用启发式端点 + 恢复窗口，不引入 Smart-Turn 模型**。判定条件：累计语音 ≥500ms 且尾静音 ≥1100ms。命中后进入提交态，给 3×260ms 恢复窗口：窗口内检测到 ≥150ms 新语音则 `turn_resumed` 回滚继续同一回合；否则发布 `asr_final`。30 秒上限与批式一致：到达即 `VOICE_AUDIO_TOO_LONG` 显式上报并就地收束（`asr_final.degraded=true`，客户端不得自动提交）。4 秒纯静音缓冲静默回收（无事件）。

4. **「边说边分析」的诚实边界**。服务端预分析 = 预检（`stream_ready`/`session_preflight` 事件：会话 phase、`ask_allowed`、worker 三模型就绪位），用于提前暴露不可提问状态与提前失败；回合提交仍由客户端在 `asr_final` 后立即调用既有 `roleTurns.ask`（`source="asr"`），Convex 权威门控不变。**不做部分文本的 LLM 预生成/预回答**：模型输出只是候选，发布前必须服务端校验，角色回合的语义理解在 turn engine 内部完成，部分文本预生成只会烧钱且不可发布。

5. **自动提交取代手动确认**（取代 P1-2a 的「识别文本只回填输入框，玩家确认后发送」默认行为）。turn detection 命中且 `asr_final.degraded=false`、当前 phase 允许 ask、无在途回合时，客户端自动以最终文本提交 `roleTurns.ask`；降质转写、不可提问或回合在途（避免 `ROLE_TURN_BUSY`）时，文本回填输入框由玩家键盘路径确认发送。

6. **流式 TTS 只从 Approved Speech Envelope 出发**。`speak` 控制只接受 message_id；服务端读取 Convex Envelope（服务器唯一合法来源）、复用 `segmentApprovedText` 确定性切分，逐段调 worker `/tts`，每段完成立即以 `tts_audio`（base64 WAV）下发，客户端顺序播放并接既有振幅探测（口型）。live 播报路径不做幂等持久化（内存流，播完即弃）；手动重播仍走既有幂等 `/api/voice/messages/{id}/speech` Route，两条路径共存。

7. **失败隔离（用户决定：不要一条失败就全失败）**。每阶段失败显式呈现且不终止流、不牵连其他阶段、不碰键盘路径：
   - 单句段 ASR 失败 → `voice_stream_error(stage=asr)` + 该句标记缺失 + 继续后续句段 + 本轮 `degraded=true`；
   - 单段 TTS 失败 → `tts_segment_failed` + 跳过该段继续后续段（文字照常完整展示）；
   - 单次 VAD 失败 → `voice_stream_error(stage=vad)` + 等下一分析窗口；
   - 上行帧持续丢失 → `voice_stream_error(stage=pipeline)` + 跳到最新帧 + `degraded=true`；
   - 上行/事件流持续失败（连续重试上限）→ 客户端显式关闭语音模式并提示改用键盘。
   以上均为显式 typed failure 上报，无静默重试、无伪造成功。

8. **Interruption（barge-in）**。播报期间麦克风持续采集，管线继续做 VAD：检测到 ≥320ms 语音即发 `interruption`、终止合成与本地播放、丢弃回声污染的音频缓冲后回到聆听态。麦克风回声消除（AEC）为主要防误触发手段；外放漏音导致的误打断是已知残余风险（本地演示可接受）。

9. **transport 冗余不是降级合成**。语音管线未连接（未开启语音模式、或流刚断开）时，自动朗读退回既有 CONTRACTS 14 分段 transport——两条路径都从同一服务端 Envelope 出发且都完整可播，只是传输不同；各自的失败仍按各自语义显式呈现。批式 `/api/voice/transcriptions` 与 speech Route 原样保留（P1-2a 验收语义不变）；`RecordButton` 组件随「手动录一段」交互被语音对话模式取代而移除（git 历史可溯）。

10. **隐私与不变量**。partial 转写只存在于流式进程内存与浏览器输入框，不入库、不进 Convex；只有 `asr_final` 文本经 `roleTurns.ask` 进入权威数据。原始 PCM 帧仅在管线内存存在，流结束即弃。事件形状以 `contracts/public` 的 `voiceStreamEventSchema`/`voiceStreamFrameSchema`/`voiceStreamControlSchema` 为唯一事实来源；不新增公开错误码（复用 VOICE_* / SERVICE_* 既有映射）。

## 与既有约束的关系

- 「模型输出只是候选、服务端校验后才发布」不变：流式化只发生在语音层，回合发布仍是完整校验后的原子事件；TTS 永远从 Approved Speech Envelope 出发。
- 「只有两种已批准恢复」的边界：本管线的失败隔离是**同一动作内的分段显式失败呈现**（哪段失败、跳过哪段都有事件可查），不是跨动作的静默重试或兜底成功；语义重写与人工文字路径两条既有恢复保持不变。
- ADR 0005（BYOK）不受影响：本管线不调用模型网关；worker 就绪位只反映本地模型加载状态。
- 浏览器兼容性：AudioWorklet 需要现代浏览器（Chrome/Edge/Firefox/Safari 均支持）；不支持时语音模式显式失败并保留键盘路径。
