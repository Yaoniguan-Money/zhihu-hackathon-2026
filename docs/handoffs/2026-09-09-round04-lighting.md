# 2026-09-09-round04-lighting：灯光与色调重构

状态：`complete`

完成时间：2026-09-09 04:05
负责人：ZCode（自治迭代第 4 轮）

## 实际完成

- `InterrogationStage.tsx`：显式 ACESFilmicToneMapping + exposure 1.12；ambient 0.5→0.38、hemi ground 暖褐化、Key 0.85、Rim 冷光 0.55 抬高后移勾肩线；Environment Lightformer 强度上调（金属/头发反射源）；ContactShadows 加深收紧。
- 效果：吊灯罩渐变层次、角色面部立体、材质高光分离，全画面对比提升无死黑。

## 明确未完成

- 光数预算（当前 10）与移动端降载 → 第 19/41 轮。

## 修改文件

- `components/three/InterrogationStage.tsx`

## 权威文档更新

无规范变更。

## 定向验证

- `bun run typecheck` 通过；浏览器截图对比（桌面 shots/r04-lighting.png vs r03-room-default.png）。

## 下一步

- 第 5 轮：角色姿态/材质与说话反馈。

## 最小阅读顺序

1. 本记录；2. 桌面 `zhihu-game-iterations/rounds/04-lighting.md`
