# 2026-09-08 · Round 6：知乎选题页走查 + 错误文案脱敏

- 状态：complete
- 负责人：AI 代理（持续迭代第 6 轮）

## 走查结论

- **/zhihu/hot**：无 ZHIHU_ACCESS_SECRET 时优雅降级（吉祥物空态 + 错误横幅），不崩溃 ✅。但错误横幅把内部环境变量名 `ZHIHU_ACCESS_SECRET not set` 直接暴露给玩家 → **已修**：`app/api/zhihu/hot/route.ts` 改为玩家友好文案「知乎热榜服务未配置，暂不可用」+ 503（运维定位走服务端日志）。
- **/zhihu/search**：搜索框、玩法引导、"去今日热案看看"链接正常，无报错 ✅（搜索动作依赖同一 secret，行为同上）。
- 两页滚动、导航（侦探事务所返回、知乎选题工坊徽章）正常 ✅。

## 验证

- `bun run typecheck` 通过。
- 实机截图走查两页（热榜错误横幅、搜索页结构）。

## 遗留

- 配置 ZHIHU_ACCESS_SECRET 后的热榜/搜索真实数据流未验证（本地无 secret，按用户环境补充配置后可测）。

## 下一位 Agent 最小阅读顺序

`app/api/zhihu/hot/route.ts`（错误文案）、`/zhihu/search` 页面结构。
