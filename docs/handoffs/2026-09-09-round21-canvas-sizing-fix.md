# 2026-09-09-round21-canvas-sizing-fix：[P0] WebGL 画布尺寸回归修复

状态：`complete`

完成时间：2026-09-09 09:20
负责人：ZCode（自治迭代第 21 轮）

## 实际完成

- 修复 r11 引入的画布尺寸回归：自愈包装层补 `style={{width:"100%",height:"100%"}}`（InterrogationStage/PortraitRow）。className 缺省时（大厅）包装层塌陷导致 canvas 停在 300×150。
- 验证基建：新增 `scripts/probe-canvas-layout.mjs`；接入 threejs-qa-release 的 inspect-threejs-canvas.mjs（项目 devDeps 增加 @playwright/test、pngjs）；headless 诊断确认 GPU 硬件渲染、满幅、无控制台错误。

## 经验教训

- 给第三方组件包 wrapper 时必须自带尺寸兜底（width/height 100%），不能依赖 className 透传。
- 显示器休眠会让 IAB 内 rAF 挂起，使截图/点击/布局测量全部不可信；headless Playwright 是该环境下的可信验证通道。

## 定向验证

- headless 布局探针 1280×800 ✓；诊断脚本 metrics 达标（对比度 43.2 偏暗登记后续灯光轮）。

## 下一步

- 第 22 轮：唤后视觉复验队列执行（headless 截图）。
