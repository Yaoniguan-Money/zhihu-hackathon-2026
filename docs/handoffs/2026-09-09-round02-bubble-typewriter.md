# 2026-09-09-round02-bubble-typewriter：气泡防裁切 + Typewriter 修复

状态：`complete`

完成时间：2026-09-09 03:25
负责人：ZCode（自治迭代第 2 轮）

## 实际完成

- 气泡锚点改为桌心方向 seat*0.78、高度 2.05；distanceFactor 8→6.5——近景气泡不再被视口裁切。
- `Typewriter` 的 `onDone` 移出 `setCount` updater（countRef 推进 + 定时器回调触发），消除 React 渲染期 setState 警告（dev 角标 1 Issue → 0）。

## 明确未完成

- 无。

## 修改文件

- `components/three/InterrogationStage.tsx`、`components/three/SpeechBubble.tsx`、`components/ui/Typewriter.tsx`

## 权威文档更新

无规范变更。

## 定向验证

- `bun run typecheck` 通过；浏览器提问触发思考气泡完整显示；Issues 角标消失。

## 下一步

- 第 3 轮：3D 房间资产密度第一波（书墙/窗景/道具库）。

## 最小阅读顺序

1. 本记录；2. 桌面 `zhihu-game-iterations/rounds/02-bubble-typewriter.md`
