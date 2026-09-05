# P1-2a：本地 Voice 基建（Worker + 同源 Route + 幂等持久化）

状态：`complete`（环节范围 = A9 基建与本地验证；音色 A/B 锁定与 REL1 验收明确未完成，见下）  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **本地 Worker（`voice-worker/worker.py`，Python 3.11.9 venv）**：只绑定 `127.0.0.1:8717`（Browser 不直连）；同进程加载 SenseVoiceSmall + FSMN-VAD（FunASR，本地固定目录、CPU）与 Kokoro-82M（Misaki 中文 G2P，HF 离线缓存）；PyAV 解码四种受支持 MIME（含 webm/ogg/mp3，重采样 16k 单声道）；模型调用串行锁。内部接口：`GET /health`、`POST /asr`（>30s → `TOO_LONG`，静音 → `NO_SPEECH`）、`POST /tts`（返回 WAV + `X-Content-Sha256`（`sha256:` 前缀格式）+ `X-Duration-Ms`）。
- **供应链固定**：`download_models.py` 下载 SenseVoiceSmall（ModelScope）、FSMN-VAD（`...-pytorch` 修订）、Kokoro-82M（HF，v1.0 模型 + 全部中文音色），生成 `models-manifest.json`（143 个文件逐文件 sha256，入库；权重目录 gitignore）；并把模型/音色预置进 HF hub 缓存，Worker 以 `HF_HUB_OFFLINE=1` 运行（运行期禁止联网）。`--verify` 模式逐文件复验（当前 143/143 通过）。
- **Approved Speech Envelope 落库**（CONTRACTS 9/14）：`role_turn_tickets.envelope_json` 在 `finalizeTurnSuccess` 持久化（`approvedSpeechEnvelopePrivateSchema` 严格校验；`voice_id` 取自案件公开 Role；`exact_text_sha256` 为服务器计算）。TTS Route 只接受信封来源，发布前验证文本哈希。
- **同源 Route（Next，唯一 Browser 入口）**：
  - `POST /api/voice/transcriptions`：multipart（audio + client_action_id）；MIME 归一化（x-wav 等别名）；幂等命中先于模型调用（`voice.transcriptions`，载荷哈希=音频 sha256）；成功返回 `TranscriptResultPublic`；原始音频仅在请求内存存在，不入库不落盘。
  - `POST /api/voice/messages/{message_id}/speech`：只接受 Message ID（不接受 text/voice/prosody）；读取 Envelope → 哈希验证 → `voice-pack.json` 映射 voice/pace（无代码级默认音色）→ Worker 合成 → Convex storage 持久化 WAV（`voice.speech` 幂等）→ 重放返回首次合成的同一文件。
  - 错误映射（CONTRACTS 13.3 Voice 列）：`TOO_LONG→VOICE_AUDIO_TOO_LONG`、`NO_SPEECH→VOICE_NO_SPEECH`、解码/识别失败→`VOICE_ASR_FAILED`、合成失败→`VOICE_TTS_FAILED`、配置缺失→`SERVICE_NOT_CONFIGURED`、Worker 不可达→对应 provider 失败。身份经 Bearer token 由 Convex 校验（`AUTH_REQUIRED`）。
- **显式配置**（SPEC 5.6 新增）：`VOICE_WORKER_URL`、`CONVEX_SITE_URL`（HTTP action 基址：本地 `:3211` / 生产 `*.convex.site`——与 API 端口不同源，踩坑已记录）、`voice-worker/voice-pack.json`。
- **验证**：TTS→ASR 中文往返（合成“Meta计划裁减约百分之二十……一万五千八百人”→ 识别回含 `20%`/`15800` 的文本）；31 秒音频 → `TOO_LONG`；纯静音 → `NO_SPEECH`；TTS Route 全链（Envelope→合成→存储→重放）通过。

## 明确未完成

- **五音色 A/B 真人试听锁定**（用户动作）：`voice-pack.json` 当前 `locked=false`、五个槽位为候选映射（含 note），锁定后改 `locked=true`。
- REL1 的 P1-2 验收（正常路径 + 两条可见失败路径的人工确认）待用户批量验收。
- A9 公网部署拓扑未决定（SPEC 明确不宣称公网语音能力）；生产 build 已包含两个 voice route，但生产环境未配置 `VOICE_WORKER_URL`/`CONVEX_SITE_URL` 时它们返回 `SERVICE_NOT_CONFIGURED`（契约行为，非缺陷）。

## 修改文件

- `voice-worker/worker.py`、`voice-worker/download_models.py`、`voice-worker/voice-pack.json`、`voice-worker/models-manifest.json`、`voice-worker/requirements.lock.txt`（139 pin）— A9 Worker 与供应链。
- `convex/schema.ts` — `role_turn_tickets.envelope_json`。
- `convex/roleTurns.ts` — finalizeTurnSuccess 持久化 Approved Speech Envelope。
- `convex/voice.ts`、`convex/http.ts` — Envelope 查询、ASR/TTS 幂等记录、语音文件存取 HTTP action（`/api/voice/stored-speech`）。
- `convex/admin.ts` — `seedRoleMessage` 复刻 envelope 持久化（测试工具）。
- `app/api/voice/transcriptions/route.ts`、`app/api/voice/messages/[message_id]/speech/route.ts`、`lib/voice.ts` — 同源 Route 与服务端辅助。
- `contracts/public/index.ts`、`contracts/private/index.ts` — 内部相对导入去 `.js` 扩展名（Turbopack 解析要求；无类型变化）。
- `tests/p12-voice-routes.test.ts`（默认运行）、`tests/p12-voice-worker.test.ts`（`RUN_VOICE_WORKER=1` opt-in）。
- `.gitignore` — voice-worker 权重/venv/日志排除。

## 权威文档更新

- `docs/developer-a/ENGINEERING_SPEC.md` — 5.6 新增显式配置与供应链固定要求。契约数据形状无变化（Public/Private schema 均为既有冻结形状）。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — P1-2 行 → IN PROGRESS（P1-2a 基建完成，P1-2 收口待用户音色锁定）。

## 定向验证

- `bun run typecheck` — 通过。
- `bun test tests/p12-voice-routes.test.ts` — 6 pass / 0 fail（无 Worker：鉴权/schema/MIME/配置缺失/provider 失败/Envelope 门控）。
- `RUN_VOICE_WORKER=1 bun test tests/p12-voice-worker.test.ts` — 4 pass / 0 fail（health、TTS→ASR 往返、TOO_LONG/NO_SPEECH、TTS Route 全链）。
- `bun test` 全套件 — 133 pass / 0 fail / 10 skip（TB/P1 模型与 worker 测试显式 opt-in），零回归。
- `bun scripts/verify-rel0.ts`（本地后端语义等价面）不涉及；`NEXT_PUBLIC_CONVEX_URL=... CONVEX_SITE_URL=... bun run build` — 通过，两个 voice route 注册为动态路由（ƒ）。
- `download_models.py --verify` — 143 文件哈希零漂移。
- Worker 启动：`cd voice-worker && .venv/Scripts/python.exe -u worker.py`（模型加载约 30–50s）。

## 已知风险、阻塞与下一步

- 音色候选（`voice-pack.json`）未经真人试听：当前五个 `kokoro_voice` 仅为占位候选，音色最终效果以用户 A/B 结果为准。
- SenseVoice 对英文词（如 “Meta”）转写不稳定（例：识别为 “A大”）；断言与产品预期以中文内容为主。
- Convex HTTP action 与 API 不同源（site 端口/域名）：已在 SPEC 5.6 固化为 `CONVEX_SITE_URL` 显式配置。
- 生产（Vercel/Convex Cloud）未部署 voice 能力：A9 仅承诺本地；未配置环境变量时 route 返回 `SERVICE_NOT_CONFIGURED`。
- 下一步：① 用户音色 A/B 锁定（`voice-pack.json`）；② P1-3 第二案件（等用户第二篇 URL+全文）；③ REL1 批量验收。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/ENGINEERING_SPEC.md` 5.6、`docs/developer-a/CONTRACTS.md` 13.3 / 14
3. `voice-worker/worker.py` 与 `lib/voice.ts`
4. `tests/p12-voice-worker.test.ts`（本机 smoke 清单）
