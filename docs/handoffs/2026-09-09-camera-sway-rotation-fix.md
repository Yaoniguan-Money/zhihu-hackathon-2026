# CAM-ROT-01：开场 3D 相机摇摆失控修复

状态：`complete`
完成时间：`2026-09-09`
负责人：AI 代理

## 实际完成

- 修复大厅/开场 3D 相机的逐帧旋转累积：摇摆角度现在始终相对固定轨道基准计算，不再把上一帧角度再次作为下一帧基准。
- 入场 GSAP 运镜期间暂停摇摆与聚焦相机写入；聚焦角色时会中止尚未完成的入场时间线，避免多个控制器争抢同一相机。
- 增加相机运动纯函数 seam 与回归测试，覆盖连续 12 秒渲染不发生失控旋转。

## 明确未完成

- 无。

## 修改文件

- `components/three/CameraRig.tsx` — 使用固定基准轨道、协调 intro 与 sway/focus 的写入时序。
- `components/three/camera-motion.ts` — 提供可测试的轨道初始化与有界摇摆计算。
- `tests/camera-motion.test.ts` — 锁定连续渲染角度不累积的回归行为。
- `docs/handoffs/README.md` — 追加本环节索引。

## 权威文档更新

无规范变更。此修复只改变前端相机表现，不改变 public contract、会话状态或数据形状。

## 定向验证

- `bun test tests/camera-motion.test.ts` — 修复前 1 fail（12 秒角度偏移约 2.56 rad），修复后 1 pass。
- `bunx eslint components/three/CameraRig.tsx components/three/camera-motion.ts tests/camera-motion.test.ts` — 通过。
- `bun run typecheck` — 通过。
- Playwright 访问 `http://127.0.0.1:3000/` 等待 12 秒 — 1 个 Canvas、无 page error/console error；截图确认相机仍保持大厅构图。
- `bun run lint` — 未通过，仓库既有 lint 错误 15 个、警告 106 个；本环节涉及文件已单独 lint 通过，未修改无关历史问题。

## 已知风险、阻塞与下一步

- 未覆盖真实触屏设备上的手势阻尼差异；本次根因位于无用户输入时的逐帧计算，桌面浏览器运行时已验证。
- 下一步可直接阅读 `components/three/CameraRig.tsx` 与本记录，继续做相机观感微调。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `components/three/CameraRig.tsx`
3. `components/three/camera-motion.ts`
4. `tests/camera-motion.test.ts`
5. 本记录
