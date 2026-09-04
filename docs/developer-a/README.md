# 开发人员 A 文档入口

本目录是 Evidence / AI Engine（A1–A9）的规格入口。当前已完成资源与初版文档审计，尚未创建业务实现；公开契约修复和开发人员 B 的共同评审仍是 D0 阻塞。

## 文档地图

- [工程规格](./ENGINEERING_SPEC.md)：问题、范围、Module、Interface、数据流、失败、安全与验收。
- [契约](./CONTRACTS.md)：Public / Private 类型、运行时不变量、逻辑接口、幂等、并发与错误语义。
- [根目录权威实施计划](../../DEVELOPER_A_IMPLEMENTATION_PLAN.md)：唯一的 tracer bullet、Gate、完成条件、测试与 B 端交接顺序。
- [旧计划迁移说明](./IMPLEMENTATION_PLAN.md)：只保留到根目录权威计划的跳转，不能独立编辑实施步骤。
- [官方资源](./OFFICIAL_RESOURCES.md)：知乎 skill / CLI、素材来源、安装结果、哈希、版本漂移和人工步骤。
- [领域语言](../../CONTEXT.md)：项目统一术语。
- [架构决策](../adr/)：对 v2.0 的少量、有意偏离。

## 规范优先级

当前用户的明确决定 > 已接受 ADR > 产品基线 v2.0 > `CONTRACTS.md` > `ENGINEERING_SPEC.md` > 根目录 `DEVELOPER_A_IMPLEMENTATION_PLAN.md`。发现冲突时先修正高层事实来源，不在实现中设计兼容兜底。

## A1–A9 状态

| 编号 | 责任 | 规格状态 | 实现状态 |
|---|---|---|---|
| A1 | Article Parser | 已定义 | 未开始；受 Golden Case 输入阻塞 |
| A2 | Claim Extractor | 已定义 | 未开始；受 Golden Case 输入阻塞 |
| A3 | Case Compiler | 已定义 | 未开始；受 Golden Case 输入阻塞 |
| A4 | Faithful Generator | 已定义 | 未开始 |
| A5 | Distortion Engine | 已定义 | 未开始 |
| A6 | Validator | 已定义 | 未开始 |
| A7 | GM / Reveal | 已定义 | 未开始 |
| A8 | Convex 数据与 actions | 已定义 | 未开始 |
| A9 | 本地 Voice Adapter | 已定义 | 未开始 |

## 当前显式阻塞

`case-demo-001` 必须使用用户提供的一篇真实知乎文章。当前尚缺来源 URL 与完整正文，因此 Golden Case 及依赖其语义标准答案的实现不可宣称完成；不得用合成文章、搜索摘要或官方 Hello World 数据替代。

D0 也仍被阻塞：在开发人员 B 签署 Public Contract、认证、错误和 P0 Cut 前，不能实现 Public runtime schema 或把根计划中的契约修复提案当成现行行为。
