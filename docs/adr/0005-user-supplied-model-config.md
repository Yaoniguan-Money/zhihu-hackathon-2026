---
status: accepted
---

# 模型 API 配置下放给用户（BYOK，用户必须配置）

模型调用的成本与供应商选择下放给终端玩家：每个用户（匿名身份）在前端设置里自行配置一个 OpenAI-compatible 供应商（名称可选、Base URL、API Key、默认模型，高级区可按五个任务分别指定模型），保存前必须通过一次真实结构化探针；配置是模型调用的**唯一运行时来源**，未配置的用户发起模型调用时收到显式 typed failure（`MODEL_CONFIG_MISSING` → 公开 `SERVICE_NOT_CONFIGURED`，文案引导去设置）。这样把 API 成本交给用户自身，同时保持"缺配置即失败、无任何默认与兜底"的失败策略。

## 决议（2026-09-09，用户明确决定）

1. **按用户隔离的配置存储**。用户配置存于 Convex 表 `ai_user_provider_config`（`owner_identity` 唯一，`registry_json` 复用 `providerRegistrySchema` 校验，`updated_at_ms`）。服务端把简化表单合成为单供应商注册表（五个任务路由全指向该供应商）后落库。
2. **无系统回退**。网关解析链只有一级：调用者本人的配置。原"全局 `ai_provider_config` 单例 → 八项 `AI_*` 环境变量"的回退链对玩家路径全部下线；本决议取代 ADR 0003 补充决议第 2、3 条的运行时部分。八项 env 语义仅保留给 `scripts/model-smoke.ts` 开发者冒烟，不再是任何玩家路径的来源。
3. **保存前必须探针成功**。保存动作 = schema 校验 → 用待保存配置做一次最小结构化调用（task=role，schema `{speech}`）→ 成功才写入。探针失败返回 typed failure（公开 `SERVICE_UNAVAILABLE`，message 只含玩家可执行动作，不含 provider 原始错误、模型名或 Key），且**不落库**。表单非法（URL 非 HTTPS、缺字段）返回 `INVALID_ARGUMENT`。不新增公开错误码。
4. **实时生效到全端**。网关在每次模型调用时按 owner 实时解析配置（internal worker 从票据/案件文档取 `owner_identity` 传入；public action 取 `ctx.auth.getUserIdentity()`），不做入票快照。保存、修改或清除配置后，下一次建案、角色回合、开场与 Reveal 立即使用新配置；中途清除配置则后续调用显式失败，无降级。
5. **Key 只存服务端**。API Key 只存在于 `ai_user_provider_config`；任何查询只返回 `maskKey()` 掩码，绝不回显明文；不进入审计、日志、错误响应或浏览器持久化。设置界面回显的 Base URL / 模型名都是用户自己输入的内容，不属于游戏 Public Projection 泄露面。
6. **范围**。知乎直答通道（`lib/zhihu-api.ts`、`app/api/zhihu/*`，绑定知乎平台端点与 `ZHIHU_ACCESS_SECRET`）与本地语音 worker（ASR/TTS）不在本决议范围内。管理台 `/admin/providers`、`convex/aiConfig.ts`、`AI_ADMIN_SECRET` 门控接口随运行时回退链一并下线删除。

## 与既有约束的关系

- 请求内行为约束不变：`maxRetries: 0`、结构化输出严格复验、不静默切换供应商、不隐藏重试、不 JSON 修复；供应商/配置失败仍是 typed failure。
- "路由是配置驱动的选择，不是失败恢复"语义不变；用户改配置是人在配置层的显式动作，与请求内自动切换无关。
- 未配置用户连系统预置案件的角色回合也无法生成——这是"用户必须配置"的直接推论，属期望行为。
