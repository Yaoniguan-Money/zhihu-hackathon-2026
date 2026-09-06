# REL1 批量验收清单（用户手动验收）

本清单整合 REL1 阶段的全部人工验收项。逐项通过后由用户签署，REL1 才能 COMPLETE；任何一项失败只标记该项 FAILED，不回写其它项。带 ⛔ 的项目当前被外部阻塞，解除后补验。

## 0. 前置

- [ ] 本地后端运行中（见 `docs/handoffs/2026-09-05-workspace-ascii-path.md`）
- [ ] 真实模型可用（`.env.local` 八项 `AI_*`；2026-09-06 已切换智谱 `glm-4.7-flash`，smoke 通过；注意免费档时段性过载，见 AI 切换 handoff）
- [ ] 语音 Worker 运行中：`cd voice-worker && .venv/Scripts/python.exe worker.py`

## 1. P0 完整游玩（可用线上/本地数据面）

- [ ] 匿名打开 https://zhihu-hackathon-2026.vercel.app ，骨架页可访问（产品页为 B 侧交付物，功能验收走本地数据面/脚本）
- [ ] `bun scripts/verify-rel0.ts https://agile-turtle-860.convex.cloud` → 8/8 PASS
- [ ] 本地走一遍第一案件完整对局（可复用 `RUN_MODEL_INTEGRATION=1 bun test tests/tb9-model.test.ts` 的断言口径）：五条开场 → 审讯（三种问法任选）→ 证据解锁 → 证据板 CAS（改版本冲突可见）→ 正确指控 → Reveal 展示 truth chain / altered links / 双评分

## 2. P1-1 录音与对质

- [ ] 审讯成功后保存录音（`evidence.saveRecording`），证据列表出现 type=quote、正文逐字等于原发言的录音证据
- [ ] 把录音投递给另一角色（`roleTurns.presentRecording`），对质回应消息带 `rebuttal_to_message_id` 指向来源消息
- [ ] 对质期间提问 → `ROLE_TURN_BUSY`；投递未解锁/陌生证据 → `EVIDENCE_UNAVAILABLE`
- [ ] 参考断言口径：`tests/p11-recording.test.ts`（7 项）

## 3. P1-2 本地语音（五音色已由用户锁定，voice-pack locked=true）

- [ ] Worker `/health` 返回 `voice_pack_locked: true`
- [ ] 对一段已批准发言请求 TTS → 返回 `audio/wav` 可播放，音色为锁定映射
- [ ] 对 TTS 输出直接做 ASR → 文本可识别回关键内容（参考 `tests/p12-voice-worker.test.ts`）
- [ ] 超过 30 秒音频 → `VOICE_AUDIO_TOO_LONG`；纯静音 → `VOICE_NO_SPEECH`
- [ ] Worker 未启动时调用语音 Route → `VOICE_ASR_FAILED` / `VOICE_TTS_FAILED`（保留键盘输入路径）

## 4. P1-3 第二案件 ⛔（2026-09-06 更新：等 glm-4.7-flash 之外的抽取模型决策——flash 档不满足长文逐字抽取契约，游玩链不受影响，见 AI 切换 handoff）

- [ ] `RUN_MODEL_INTEGRATION=1 bun test tests/p13-second-case.test.ts` 全绿（编译 → 不变量/Span → 开场 → 审讯 → 对质 → 指控 → Reveal）
- [ ] 用户对照知乎原页抽查 `golden-case/case-demo-002/source.md`（逐段完整性）
- [ ] 审阅 `golden-case/case-demo-002/case-private.json`（85 claims / 11 证据 / 标准答案 cherry_pick+context_omit）与 `case-public.json`，决定是否批准晋升系统目录（晋升由内部操作执行，ADR 0004）

## 5. 收尾

- [ ] REL1 handoff 签署（各项结果 + 失败项明确列出）
- [ ] 遗留清理确认：旧中文目录删除（ascii-path handoff 遗留项）、多余空部署 woozy-alpaca-64 删除
