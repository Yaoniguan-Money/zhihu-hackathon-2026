---
status: accepted
---

# 建案同时要求来源 URL 与完整正文

v1 的建案 Interface 固定为用户同时提交 `source_url` 与完整 `source_text`；服务器不依据 URL 自动抓取，也不把知乎搜索返回的摘要视作正文。该选择牺牲了 URL-only 的便利性，换取可复现的 Canonical Source、稳定 Source Span 与明确失败语义，并避免页面抓取限制被静默掩盖。

