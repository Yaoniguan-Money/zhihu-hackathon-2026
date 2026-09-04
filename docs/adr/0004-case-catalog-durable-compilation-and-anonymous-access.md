---
status: accepted
---

# 案件目录、Durable 编译与匿名访问控制

P0 引入三项相互配套的基线决定，取代 v2.0 中隐含的“同步建案、无鉴权、用户案件公开”假设：

1. **系统案件目录**：新增 `cases.listPublic` 与 `CaseCatalogItemPublic`，只列出已批准且 `ready` 的系统案件；用户创建的案件默认仅创建者可见。开放建案后若无目录门槛与私有默认，匿名用户生成的内容会直接变成公共玩法输入，破坏 Golden 审批与内容质量边界。
2. **Durable Case Compilation**：`cases.createFromSource` 改为先返回 `CaseCompileReceipt`，编译异步执行，进度经 `cases.observeCompilation` 以 `accepted / working / succeeded / failed` 公开；任何失败不留下可玩 Case。完整编译依赖多次模型调用，同步 HTTP 路径在真实供应商延迟与失败面前不可靠，也会诱使实现加入超时兜底。
3. **匿名身份 + 邀请码 + 额度**：P0 使用 Convex Auth 的 Anonymous 身份，权限全部来自服务端认证上下文；匿名建案必须提供只存哈希的邀请码，并按身份执行滚动 24 小时 ≤3 次、并发 ≤1、全站 UTC 日 ≤50 次与 30,000 UTF-16 code units 正文上限；幂等命中先于额度扣减；超长正文直接拒绝不截断。公网匿名开放没有这些闸门时，建案成本会被滥用转嫁到模型供应商与 Convex 配额上。

这些决定是用户在 D0 契约修复包评审中锁定的明确决定；跨端数据形状、校验与错误语义的规范性文本以 [CONTRACTS.md](../developer-a/CONTRACTS.md) 为唯一事实来源，Public 契约变更仍须开发人员 B 共同评审。Convex Auth 的 beta 兼容风险用固定版本与兼容 smoke 管控，无法满足时相关阶段保持 BLOCKED，不以自制鉴权兜底。
