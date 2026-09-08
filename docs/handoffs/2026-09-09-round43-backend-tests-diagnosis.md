# 2026-09-09-round43-backend-tests-diagnosis：后端集成测试失败根因

状态：`complete`（诊断与移交；代码修复需 A 评审测试语义）

完成时间：2026-09-09 12:15
负责人：ZCode（自治迭代第 43 轮）

## 根因

7 例失败（P1-1/P1-3b/TB1/TB3/TB4/TB7/TB10 子用例）共同假设函数环境无 AI_*；自 8f8d0b1 恢复 AI_* 后，`convex dev --once` 每次推送都会携带该配置，`modelGatewayFor` 的 `fromEnv()` 回退使命题失效——回合真实调用模型而非 SERVICE_NOT_CONFIGURED 快速终态。属测试假设漂移，非运行时回归。

## 建议修法（需 A 评审）

- 测试内通过 `aiConfig:saveRegistry`（admin secret）注入指向本地 mock 模型服务器的 registry（可构造、可断言），替代"环境无 AI"假设；或引入 per-file 函数环境隔离。

## 权威文档更新

无规范变更（测试基建建议，未改契约）。

## 定向验证

- 单独/全量复跑数据一致；失败清单逐条核对；前端改动无交集（git 范围可证）。
