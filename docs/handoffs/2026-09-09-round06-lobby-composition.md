# 2026-09-09-round06-lobby-composition：大厅构图与面板避让

状态：`complete`

完成时间：2026-09-09 04:35
负责人：ZCode（自治迭代第 6 轮）

## 实际完成

- CameraRig 新增 targetBiasX（无聚焦时注视点横偏）；lobby 传 1.35 使桌面主体让开右侧 420px 面板。
- InterrogationRoom 新增前景案卷篮（大厅/环绕机位可见）。

## 明确未完成

- autoRotate 周期性遮挡可接受；大厅重设计在第 32 轮。

## 修改文件

- `components/three/CameraRig.tsx`、`components/three/InterrogationStage.tsx`、`components/three/scene/InterrogationRoom.tsx`

## 权威文档更新

无规范变更。

## 定向验证

- `bun run typecheck` 通过；浏览器截图（桌面 shots/r06-lobby-composition.png）确认面板避让生效。

## 下一步

- 第 7 轮：WebAudio 合成音效引擎落地。

## 最小阅读顺序

1. 本记录；2. 桌面 `zhihu-game-iterations/rounds/06-lobby-composition.md`
