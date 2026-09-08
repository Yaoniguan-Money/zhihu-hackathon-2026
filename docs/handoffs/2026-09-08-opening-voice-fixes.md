# 2026-09-08 · 开庭体验与语音链路修复（对应同日诊断记录）

状态：`complete`  
完成时间：2026-09-08  
负责人：AI 代理（用户批准诊断记录后执行修复）

## 实际完成

对应 [2026-09-08-opening-freeze-and-voice-silent-diagnosis](./2026-09-08-opening-freeze-and-voice-silent-diagnosis.md) 的修复轮：

1. **语音 401（P0）**：`components/ui/VoicePlayer.tsx`、`components/ui/RecordButton.tsx`、`app/game/interrogation/page.tsx` 的 speech/transcriptions fetch 均通过 `useConvexAuth().fetchAccessToken` 取 Convex access token 并附 `Authorization: Bearer`（修复此前每次必返 `401 AUTH_REQUIRED` 且被静默吞掉的缺陷）。
2. **自动朗读（P0）**：`app/game/interrogation/page.tsx` 新增 `speakMessage`——新到达的角色发言（含五条开场陈述与审讯回应）自动经同源 TTS Route 合成并播放；与 3D 口型同步（`speakingMessageId` 在音频 `onended` 时关闭，超时估算保留为兜底）；恢复会话（挂载时已存在的消息）不自动朗读；自动播放被浏览器策略拒绝时显式提示手动播放路径。
3. **服务端阶段门禁**：`convex/voice.ts` `approvedEnvelope` 由 investigation-only 放宽为 `opening_statements | investigation`（briefing/judging/revealed/failed 仍 `SESSION_PHASE_CONFLICT`）。契约（CONTRACTS 14）已先行补充该阶段语义。
4. **错误显式呈现**：`components/DialogueList.tsx` 新增 `onVoiceError` 透传 `VoicePlayer.onError`，上抛至审讯页 `voiceError` 面板（不再静默吞掉）；`lib/convex-errors.ts` `toPublicError` 支持顶层 `{code,message}` HTTP 错误体（此前 Route JSON body 被误归一化为 SERVICE_UNAVAILABLE，丢失真实 code）。
5. **打字机提速**：`components/ui/Typewriter.tsx` `PACE_MS` slow 95→42、normal 46→20、fast 24→12（约 2.2 倍）。
6. **开场等待反馈**：`app/game/interrogation/page.tsx` `OpeningTheater` 未完成时显示「正在准备第 N / 5 条开场陈述（每条约需 30~120 秒，读完可点击文字跳过）」，消除"卡死"错觉。

## 明确未完成

- 开场五条陈述串行生成（CONTRACTS 11 既定行为，单条含角色生成+Validator 各 12~111s）未并行化——属契约层决策，未获授权改动。
- 渲染性能假说（诊断记录根因 1.2：打字机 setState 引发的全树重渲染）未做 `React.memo` 等优化——待 Performance trace 验证后再动。
- 真人浏览器端到端（开庭自动朗读的听感、autoplay 解锁时序）未实测，留待用户实局验证。

## 修改文件

- `convex/voice.ts` — approvedEnvelope 阶段门禁放宽
- `components/ui/VoicePlayer.tsx` — Bearer 鉴权
- `components/ui/RecordButton.tsx` — Bearer 鉴权
- `components/DialogueList.tsx` — onVoiceError 透传
- `app/game/interrogation/page.tsx` — 自动朗读 + 进度反馈 + voiceError 上抛接线
- `components/ui/Typewriter.tsx` — PACE_MS 提速
- `lib/convex-errors.ts` — toPublicError 支持顶层 {code,message} 错误体

## 权威文档更新

- `docs/developer-a/CONTRACTS.md` §14 — 补充 Approved Speech Envelope 读取的阶段语义（opening_statements 与 investigation 开放，其余 SESSION_PHASE_CONFLICT）。

## 定向验证

- `bun run typecheck` — 通过。
- `bun test tests/p12-voice-routes.test.ts` — 6 pass / 0 fail（含 briefing 阶段 SESSION_PHASE_CONFLICT 断言，确认门禁放宽未破坏既有语义；本地 watch 后端已热推送 voice.ts）。
- 诊断轮运行时取证已证明 worker TTS 直连正常（1750ms WAV）+ 无鉴权 401 可复现；本轮修复即针对该断点。

## 已知风险、阻塞与下一步

- autoplay 策略：开庭由用户点击「开庭」触发，同源页面 autoplay 一般已解锁；若仍被拒会显式提示手动播放（文字不受影响），符合"ASR/TTS 失败保留人工文字路径"。
- 每次朗读/手动播放都会生成新 `client_action_id` 并在 Convex storage 存一份 WAV（幂等按 action_id），重复播放同一消息会有存储冗余——现状行为，未改。
- 下一步建议：用户实局走查开庭（听自动朗读、看进度提示）；若逐字/朗读同步观感仍差，再评估打字机与语音时长对齐。

## 最小接手阅读顺序

1. [2026-09-08-opening-freeze-and-voice-silent-diagnosis](./2026-09-08-opening-freeze-and-voice-silent-diagnosis.md)（根因总表）
2. `docs/developer-a/CONTRACTS.md` §14（阶段语义）
3. `app/game/interrogation/page.tsx`（speakMessage / OpeningTheater）
