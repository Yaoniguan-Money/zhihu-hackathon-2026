# 2026-09-09-round05-character-presence：角色情绪姿态与微动作

状态：`complete`

完成时间：2026-09-09 04:20
负责人：ZCode（自治迭代第 5 轮）

## 实际完成

- `GlbCharacter.tsx`：新增 EMOTION_POSE（情绪→脊柱前倾/头部低垂/呼吸速率幅度的姿态映射）；口型加短语化包络（双层正弦 gate，模拟分句换气）；非说话角色偶发待机微动作（幅度 40%）；静态选中环升级为脉冲环+旋转缺口弧（SelectionRing 组件）。

## 明确未完成

- 扩展手势库（托腮/抱臂）需逐骨骼验证，后续轮次。
- 选中环正面遮挡问题 → 第 33 轮。

## 修改文件

- `components/three/characters/GlbCharacter.tsx`

## 权威文档更新

无规范变更。

## 定向验证

- `bun run typecheck` 通过；浏览器实测选中运镜与姿态正常，微动作观察无异常。

## 下一步

- 第 6 轮：大厅首页构图与氛围。

## 最小阅读顺序

1. 本记录；2. 桌面 `zhihu-game-iterations/rounds/05-character-presence.md`
