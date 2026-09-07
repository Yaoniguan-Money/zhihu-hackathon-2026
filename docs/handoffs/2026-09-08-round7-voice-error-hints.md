# 2026-09-08 · Round 7：语音错误码提示细化

- 状态：complete
- 负责人：AI 代理（持续迭代第 7 轮）

## 实际完成

1. **语音错误码提示细化**（`lib/convex-errors.ts`）：四个语音码此前共用"语音服务不可用"一句，语义错位。拆分为：
   - VOICE_ASR_FAILED / VOICE_TTS_FAILED → "语音服务暂时不可用，可以继续使用键盘输入。"（保留契约要求的人工文字路径提示）
   - VOICE_NO_SPEECH → "没听到说话内容，请靠近麦克风再试一次。"
   - VOICE_AUDIO_TOO_LONG → "录音超过 30 秒上限，请把问题说短一点。"
2. **链路复核**：RecordButton 有 30s 自动停止与倒计时；/api/voice/transcriptions 对 worker 错误有完整 typed 映射（TOO_LONG/NO_SPEECH→422），errorResponse 返回顶层 {code,message} 与客户端 toPublicError 匹配。第 0 轮实测的 SERVICE_UNAVAILABLE 判定为录音触界后的偶发失败，映射链本身完好。

## 验证

- `bun run typecheck` 通过；代码审读复核整条 ASR 错误链（RecordButton → route → worker → hint）。

## 遗留

- 真实说话的 ASR 识别率未测（自动化环境无真人语音源），留给真人体验。
- ASR 文案回填后的"确认发送"交互未实测。

## 下一位 Agent 最小阅读顺序

`lib/convex-errors.ts` errorCodeHint；`components/ui/RecordButton.tsx`；`app/api/voice/transcriptions/route.ts`。
