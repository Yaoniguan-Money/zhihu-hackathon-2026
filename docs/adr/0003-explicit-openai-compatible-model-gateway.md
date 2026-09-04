---
status: accepted
---

# 使用显式配置的 OpenAI-compatible 模型网关

所有模型任务通过 OpenAI-compatible Adapter 接入，并分别显式配置供应商名称、Base URL、API Key 与任务模型；项目不绑定单一厂商、不读取其他工具已有密钥、不提供默认模型，也不自动切换供应商。这样保留供应商可替换性，同时保证缺配置和供应商失败会被直接暴露，而不是以不可验证的降级结果继续游戏。

