# 2026-09-08 · Round 4：等待体验反馈 + 证据板草稿持久化 + 错误文案纠偏

- 状态：complete
- 负责人：AI 代理（持续迭代第 4 轮）

## 实际完成

1. **审讯等待指示（P1）**：`app/game/interrogation/page.tsx` —— 角色回合在途时（thinking 非空），审讯记录面板头部显示「正在回答… Ns」实时计时（琥珀色 chip）。Validator 常需 1~2 分钟，玩家此前只有画面外的 3D 气泡提示。
2. **证据板草稿持久化（P1）**：`app/game/evidence/page.tsx` —— dirty 时 placements/links 写入 `sessionStorage ecw.board.draft.<session_id>`；页面重挂载时优先恢复草稿（标记 dirty 待保存）；保存成功即清除。修复"摆放后切页改动静默丢失"（第 0 轮实测 4 块芯片即因此丢失，rev 停留 0）。生命周期：save() 内同步清草稿，避免恢复回环。
3. **错误文案纠偏（P1）**：`lib/convex-errors.ts` errorCodeHint：
   - ROLE_TURN_FAILED："可以换一种问法重新提问"（开场陈述阶段语境完全不符）→"这条发言没有生成成功，可以重试一次；若反复失败，回到大厅重新开局。"
   - 默认 hint："返回首页重新开始"对临时性错误过度 →"请稍后重试；若反复出现，回到大厅重开一局。"

## 验证

- `bun run typecheck` 通过。
- 运行时验证安排：等待计时与草稿恢复将在第 5 轮完整对局中实测（需要 investigation 中间态；本项改动均为展示层/本地存储，风险低）。

## 遗留

- 开场陈述失败仍是"对局终止"硬失败（无重试入口）——涉及会话重试语义，需要产品设计决策（暂以文案缓解）。
- 连线第二步仍需点目标块「连线」按钮（横幅已说明）；后续可改为点芯片本体完成。

## 下一位 Agent 最小阅读顺序

`app/game/interrogation/page.tsx`（answerSeconds）、`app/game/evidence/page.tsx`（草稿三处）、`lib/convex-errors.ts`。
