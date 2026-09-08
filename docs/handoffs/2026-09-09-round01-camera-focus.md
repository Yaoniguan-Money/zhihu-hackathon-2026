# 2026-09-09-round01-camera-focus：审讯室镜头构图与说话者聚焦

状态：`complete`

完成时间：2026-09-09 03:10
负责人：ZCode（自治迭代第 1 轮）

## 实际完成

- `CameraRig.tsx`：默认机位 (0,3.5,7)→(0,5.1,8.8)、注视 (0,1,0)→(0,0.75,-0.1)；聚焦机位从「说话者同侧」改为「对面桌沿斜上方」正面构图；用户拖拽后恢复延时 0.4s→2.5s。
- `interrogation/page.tsx`：focusRoleId 链路 = 选中 > 思考中 > 正在发言（开场陈述与审讯回答均触发运镜）。

## 明确未完成

- 气泡防裁切、Typewriter 渲染期 setState 警告（第 2 轮）。

## 修改文件

- `components/three/CameraRig.tsx`、`app/game/interrogation/page.tsx`

## 权威文档更新

无规范变更。

## 定向验证

- `bun run typecheck` 通过；浏览器实测全景无遮挡、点选何叙运镜到正面（桌面 shots/r01-*.png）。

## 下一步

- 第 2 轮：SpeechBubble 视口防裁切 + Typewriter setState 修复。

## 最小阅读顺序

1. 本记录；2. 桌面 `zhihu-game-iterations/rounds/01-camera-focus.md`
