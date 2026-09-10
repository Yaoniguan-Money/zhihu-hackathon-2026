# P1-2b 流式语音管线：Streaming ASR → Turn Detection → 流式 TTS

状态：`complete`  
完成时间：`2026-09-09`  
负责人：`Agent（开发人员 A 侧）`

## 实际完成

- 语音交互层重构为 Pipecat 式流式管线（用户 2026-09-09 明确决定），游戏业务链路（`roleTurns.ask` durable ticket、turn engine、Validator、Approved Speech Envelope、RAG）零改动：
  - **Streaming ASR**：浏览器 AudioWorklet 持续采集 16k PCM16LE（内置线性重采样），约 375ms 一帧带 seq 上行；FSMN-VAD 把语音切句段，句段闭合即对该段做 SenseVoice 转写，产出前缀单调追加的 `asr_partial` 实时上屏（输入框上方「聆听中」气泡）。
  - **Turn detection**：累计语音 ≥500ms 且尾静音 ≥1100ms → 端点命中；3×260ms 恢复窗口内继续说话则 `turn_resumed` 回滚；最终确认 `asr_final` = 已闭合句段缓存拼接（与批式 ASR 内部 VAD 分段等价，无需重跑整段），说完到 final 接近零延迟。30 秒上限与批式一致（显式 `VOICE_AUDIO_TOO_LONG` + `degraded=true`）。
  - **自动提交**：`asr_final.degraded=false` 且 phase 允许 ask 且无在途回合时自动 `roleTurns.ask(source="asr")`；降质/不可提问/回合在途时文本留输入框走键盘路径。
  - **预分析**：`stream_ready`/`session_preflight` 事件携带会话 phase、`ask_allowed`、worker 三模型就绪位（`/health` 含新 `vad` 位）。
  - **流式 TTS**：回合发布后 `speak` 控制只带 message_id；服务端读 Envelope → `segmentApprovedText` 确定性切分 → 逐段合成逐段 `tts_audio`（base64 WAV）下发，首声 = 第一句合成时间；客户端顺序播放并接振幅口型。
  - **Barge-in**：播报期间管线持续 VAD，≥320ms 用户语音 → `interruption` + `tts_aborted`，丢弃回声污染缓冲回到聆听。
  - **失败隔离（用户决定：不要一条失败就全失败）**：单句段 ASR 失败、单段 TTS 失败（跳过该段继续）、单次 VAD 失败、上行帧丢失均以显式事件上报后继续，流不终止、键盘路径不受影响；上行/事件流持续失败才显式关闭语音模式。
- 契约先行：`contracts/public` 新增 14.5 节 `voiceStreamStageSchema`、`voicePreflightSchema`、`voiceStreamEventSchema`、`voiceStreamFrameSchema`、`voiceStreamControlSchema`；管线发送前逐事件 schema 校验。
- Worker（`voice-worker/worker.py`）新增内部端点 `POST /vad`（独立 FSMN-VAD 实例 + `_vad_lock`，可与 ASR/TTS 并行）与 `POST /asr/pcm`（PCM 直入）；不新增模型文件（143 文件清单不变）。**本地 worker 已用新代码重启并验证**（`/health` 返回 `vad: true`）。
- Node 编排器 `server/voice-stream/`：`pipeline.ts`（可注入 `VoiceModelClient`/`EnvelopeLoader`/`SessionViewLoader`，Scripted 客户端可测）、`worker-client.ts`（HTTP 生产实现）、`registry.ts`（进程内注册表：并发 4、TTL 120s、globalThis 防 HMR）。
- 同源 Route：`app/api/voice/stream/{audio,events,control}/route.ts`（Bearer 鉴权、schema 校验、流-session 绑定与不匹配拒绝、404 语义）。
- 浏览器客户端 `lib/voice-stream-client.ts`：`VoiceStreamClient`（采集、上行重试上限、事件流重连上限、TTS 播放队列、按 message_id 解析 waiter）+ `useVoiceStream` hook（`isActive()` 同步读底层连接态）。
- 审讯页集成：`VoiceStreamButton` 语音对话模式开关（off/starting/listening/speaking）+ partial 气泡；自动朗读入口优先流式 transport，管线未连接或请求失败时退回既有 CONTRACTS 14 分段 transport（同一 Envelope 的完整路径）；`跳过朗读` 同时停流式播报。`RecordButton` 组件移除（git 可溯），批式 transcriptions/speech Route 原样保留。

## 明确未完成

- 真人端到端语音对话手感（端点阈值 1100ms、barge-in 320ms 的实际体验调参）未经真人验证；数值是分析取向的初值，调参不需要改契约。
- 外放漏音导致的误打断风险未做专门抑制（依赖浏览器 AEC）。
- 生产（Vercel/Convex Cloud）不部署语音管线：与 P1-2a 一致，仅本地演示语义；`VOICE_WORKER_URL` 缺失时 Route 显式 `SERVICE_NOT_CONFIGURED`。
- REL1 批量验收仍未执行（与本环节同前的既有阻塞无关）。

## 修改文件

- `contracts/public/index.ts` — 新增 14.5 Voice Stream 事件/帧/控制 schema（含 `asr_final.degraded`）。
- `voice-worker/worker.py` — 新增 `init_vad`、`run_vad`、`run_asr_pcm`、`_handle_pcm`、`/vad` `/asr/pcm` 路由、`/health` 的 `vad` 位。
- `server/voice-stream/pipeline.ts` — 新增：流式管线状态机（句段转写队列、端点+恢复窗口、barge-in、流式 TTS 循环、事件总线）。
- `server/voice-stream/worker-client.ts` — 新增：`VoiceModelClient` 接口 + HTTP 生产实现 + `VoiceWorkerError`/公开错误映射复用。
- `server/voice-stream/registry.ts` — 新增：流注册表（创建/绑定/GC/容量）。
- `app/api/voice/stream/audio/route.ts`、`events/route.ts`、`control/route.ts` — 新增同源流式端点。
- `lib/voice-stream-client.ts` — 新增浏览器客户端与 `useVoiceStream` hook。
- `components/ui/VoiceStreamButton.tsx` — 新增语音对话模式开关组件。
- `app/game/interrogation/page.tsx` — 语音模式状态与 hook、partial 气泡、`speakMessage` 双 transport 包装、`stopVoice` 覆盖流式路径、自动提交回调；移除 `RecordButton` 引用。
- `components/ui/RecordButton.tsx` — 删除（流式模式取代手动整段录音交互；批式 Route 保留）。
- `tests/p12b-voice-stream.test.ts`、`tests/p12b-voice-worker-stream.test.ts` — 新增定向测试。

## 权威文档更新

- `docs/adr/0006-streaming-voice-pipeline.md` — 新增并接受：流式管线十条决议（拓扑、句段级 streaming、启发式 turn detection、预分析边界、自动提交、流式 TTS 来源、失败隔离、barge-in、transport 冗余、隐私边界）。
- `contracts/public/index.ts` — 见上；语音流事件为 Browser 可见跨端形状，唯一事实来源。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — 第 5 节新增 P1-2b 行（COMPLETE）。

## 定向验证

- `bun test tests/p12b-voice-stream.test.ts` — 11 pass / 0 fail：句段 partial→端点→final 拼接、单句段 ASR 失败隔离（degraded）、恢复窗口 turn_resumed、30s TOO_LONG 就地收束、纯静音静默回收、逐段 tts_audio+单段失败跳过、barge-in interruption/aborted、envelope 缺失 typed failure、audio/events/control Route 鉴权与绑定。
- `RUN_VOICE_WORKER=1 bun test tests/p12b-voice-worker-stream.test.ts` — 4 pass / 0 fail（真实模型）：`/health` vad 位、`/vad` 真实音频分段与 BAD_REQUEST、`/asr/pcm` TTS→剥头→PCM 识别往返、NO_SPEECH/TOO_LONG。另以独立探针脚本验证 FunASR 独立 VAD 输出形状（`value=[[start_ms,end_ms],...]`）与实现一致。
- `RUN_VOICE_WORKER=1 bun test tests/p12-voice-worker.test.ts` — 4 pass / 0 fail：worker.py 改动后批式接口零回归。
- `bun test`（全套件，本地后端在运行）— 179 pass / 0 fail / 15 skip（全部为显式 opt-in），零回归。
- `bun run typecheck` — 通过。
- `bun run lint` — 与 HEAD 比对：失败集为既有问题（stash 后 HEAD 同样 exit 1）；本次新增代码未引入新错误（已修复两处 refs-during-render）。
- `bun run build` — 通过；`/api/voice/stream/{audio,events,control}` 注册为动态路由（ƒ）。
- 本地 worker 已重启至新代码（`cd voice-worker && .venv/Scripts/python.exe worker.py`，模型加载约 30–50s），`GET /health` 返回 `{"asr":true,"tts":true,"vad":true}`。

## 已知风险、阻塞与下一步

- worker 必须运行新代码，否则语音模式在首个回合后持续 `voice_stream_error(stage=vad)`/`SERVICE_NOT_CONFIGURED`（批式接口不受影响）。旧进程不自动升级。
- 端点/打断阈值为初值（1100ms/320ms/500ms），真人体验后可在 `server/voice-stream/pipeline.ts` 的 `TUNING` 内调整。
- 流为进程内存：`next dev` 重启或 worker 重启会丢弃活跃流与 partial；客户端按 404/重连上限显式关闭语音模式，玩家可重新开启。
- 事件流以本地回环为前提（明文 JSON lines + base64 音频）；生产不部署（同 P1-2a 边界）。
- 下一步：① 真人全链试听与阈值调参；② REL1 批量验收（含本环节）；③ 如需带宽优化可把 `tts_audio` 改二进制帧（契约加 variant）。

## 最小接手阅读顺序

1. 本记录
2. `docs/adr/0006-streaming-voice-pipeline.md`
3. `contracts/public/index.ts` 14.5 节（Voice Stream schema）
4. `server/voice-stream/pipeline.ts`（`TUNING` 常量与状态机）
5. `lib/voice-stream-client.ts` 与 `app/game/interrogation/page.tsx` 的「P1-2b 语音对话模式」块
6. `tests/p12b-voice-stream.test.ts`（行为清单即验收口径）
