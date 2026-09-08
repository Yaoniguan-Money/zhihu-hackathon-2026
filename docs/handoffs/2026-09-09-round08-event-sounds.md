# 2026-09-09-round08-event-sounds：庭审事件音接线

状态：`complete`

完成时间：2026-09-09 05:10
负责人：ZCode（自治迭代第 8 轮）

## 实际完成

- 证据板：上板=unlock、连线=connect、撤线=disconnect。
- 指控页：提交=accuse（低频鼓 sting）。
- 揭晓页：进入=reveal 和弦（一次性，reduced-motion 亦播）。

## 明确未完成

- BGM/氛围垫乐 → 第 21 轮。

## 修改文件

- `app/game/evidence/page.tsx`、`app/game/accusation/page.tsx`、`app/game/reveal/page.tsx`

## 权威文档更新

无规范变更。

## 定向验证

- `bun run typecheck` 通过；无控制台报错。

## 下一步

- 第 9 轮：证据板视觉重构。

## 最小阅读顺序

1. 本记录；2. 桌面 `zhihu-game-iterations/rounds/08-event-sounds.md`
