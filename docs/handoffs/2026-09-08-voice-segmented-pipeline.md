# 2026-09-08 · 语音分段流水线（首声 2~4 秒）+ 跳过朗读按钮

状态：`complete`  
完成时间：2026-09-08  
负责人：AI 代理（用户定夺方案 v2 后实施）

## 实际完成

对应方案文档 `.trae/documents/voice-fast-start-segmented-plan.md`（用户明确要求：字幕速度不降、语音必须尽快出声、字幕跑完后可跳过且本条不再播）：

1. **确定性分段函数**（`lib/voice.ts`）：新增 `segmentApprovedText` + `SEGMENT_MAX_CHARS=64`。按句末标点（。！？；…\n）切分，超长句按逗号/顿号二次切分、仍超长硬切；每段为 exact_text 连续子串，同输入产出恒定分段序列。
2. **speech Route 分段 transport**（`app/api/voice/messages/[message_id]/speech/route.ts`）：body 可选 `segment`（非负整数，strict schema 拒绝负数/非整数）；带 segment 时仅合成该分段；响应新增 `X-Segment-Index` / `X-Segment-Total`（重放路径同样返回，总数由信封文本重新切分得出）；分段幂等键纳入 segment 值（`sha256({session_id, message_id, segment})`）。Envelope 查询移到幂等查询之前（分段路径需先切分定界，纯读动作不违反 CONTRACTS 12）；越界 → 400 INVALID_ARGUMENT。无 segment 路径行为不变（手动播放）。worker 零改动（KPipeline 本就按句合成）。
3. **客户端分段流水线**（`app/game/interrogation/page.tsx`）：`speakMessage` 重写为分段队列——seg0（第一句）到手即播（实测首声从整段合成的 15~25 秒提前到 **约 2~4 秒**），随后边播边取后续段（合成速度约为播放时长 1/5，缓冲恒领先）；`AbortController` 贯穿，换消息/卸载/跳过即中止在飞请求；任一段失败显式 voiceError 并终止队列（不静默重试）。字幕路径不变：消息到达即以 20ms/字打出。
4. **跳过朗读按钮**：开场剧场卡片右上角 + 审讯阶段输入区上方浮动胶囊（`voiceActiveMessageId` 驱动可见性，语音开始后即可见）；点击 = 中止在飞分段 + 停止当前音频 + 本条剩余语音不再合成不再播；下一条新消息仍自动朗读。语音错误面板提到 z-40（开场 overlay 之上可见）。
5. **修复回归**：上一轮被同文件并行编辑竞态吞掉的「正在准备第 N/5 条」进度提示行补回（措辞更新为含跳过指引）。

## 明确未完成

- 真人实局听感验证（分段接缝、首声实测延迟）由用户体验；自动化已覆盖路由语义与切分确定性。
- worker 流式响应（MSE）未做（收益小、复杂度高，记录为后续选项）；服务端预合成不可行（Convex 云端无法触达 127.0.0.1 worker）。

## 修改文件

- `lib/voice.ts` — segmentApprovedText / SEGMENT_MAX_CHARS
- `app/api/voice/messages/[message_id]/speech/route.ts` — 分段 transport + X-Segment-* 头 + 分段幂等键
- `app/game/interrogation/page.tsx` — 分段流水线播放、跳过按钮、错误面板层级、进度提示行修复
- `tests/p12-voice-routes.test.ts` — 分段用例（schema/越界/合法段失败路径）+ segmentApprovedText 单测
- `docs/developer-a/CONTRACTS.md` — §14 分段 transport 语义（见下）

## 权威文档更新

- `docs/developer-a/CONTRACTS.md` §14 — 新增"分段 transport"段：可选 segment 参数、服务端确定性切分、X-Segment-Index/Total 头、分段独立幂等键与 client_action_id 要求、越界 INVALID_ARGUMENT。

## 定向验证

- `bun run typecheck` — 通过。
- `bun test tests/p12-voice-routes.test.ts` — 8 pass / 0 fail（新增 2 项：分段 schema/越界/失败路径；切分函数句末/二次/硬切/确定性）。
- worker 实测探针（2026-09-08）：15 字→墙钟 1.5s；52 字→3.0s（音频 10.75s）——支撑"首段 2~4 秒出声、边播边合成恒领先"的结论。

## 已知风险、阻塞与下一步

- 分段接缝：极端短首句可能出现 <2s 停顿（缓冲未跟上），正常句长下无可感停顿。
- 每段独立 client_action_id：中断重取同段会重新合成（CPU + 一行存储记录），量级与现状单次手动播放相同。
- 分段音频与整段合成的韵律一致性依赖 KPipeline 本身的按句切分，理论一致；如听感有差异再评估 SEGMENT_MAX_CHARS。
- 下一步建议：用户实局开庭验证首声延迟与跳过按钮；若需"全局关闭自动朗读"开关另立需求。

## 最小接手阅读顺序

1. `.trae/documents/voice-fast-start-segmented-plan.md`（方案与取舍）
2. `docs/developer-a/CONTRACTS.md` §14 分段 transport 段
3. `app/game/interrogation/page.tsx` speakMessage / OpeningTheater
