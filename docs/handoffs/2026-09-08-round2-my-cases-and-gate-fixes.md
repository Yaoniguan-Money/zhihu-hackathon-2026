# 2026-09-08 · Round 2：入口门屏盲等修复 + 「我的案件」入口 + 建案输入净化

- 状态：complete
- 完成时间：2026-09-08
- 负责人：AI 代理（持续迭代第 2 轮；桌面 `证据链狼人杀-迭代记录/02-第2轮-*.md`）

## 实际完成

1. **Fix-5（P0）入口门屏盲等的根因与兜底**：
   - 根因：createSession 等失败后状态机回到 lobby 态，但路由仍停在 /game/interrogation，「正在进入审讯室…」门屏因 sessionView 为空永远不消失。
   - `context/GameContext.tsx`：GameApi 暴露 `matchesLobby`（snapshot.matches("lobby")）。
   - `app/game/layout.tsx`：booted && matchesLobby && 路由在 /game/* 时 `router.replace("/")` 回弹大厅——修复这一类“机器状态与路由脱钩”问题。
   - `app/game/interrogation/page.tsx`：门屏增加已等待秒数；≥20s 提示“若长时间无响应，请返回大厅重新开始”。
2. **Fix-6（P1）用户自编译案件无 UI 入口**：
   - `convex/cases.ts` 新增公开查询 `cases:listMine`（owner+ready 案件，复用 CaseCatalogItemPublic 形状）；`finalizeCompilationSuccess` 回补 `source_url`；listMine 对历史数据从 source_documents 回查。
   - `app/page.tsx` 大厅新增「我的案件 · 自己带来的文章」区块，点击即 selectCase→简报。
   - `docs/developer-a/CONTRACTS.md` 4.4 已补 listMine 契约说明（additive，listPublic 语义不变）。
3. **Fix-7（P1）建案输入净化**：`app/page.tsx` 提交前 `stripMarkdownDecorations()`（剥 #标题、--- 水平线、**加粗**、行内反引号）。实测 markdown 正文曾触发 SOURCE_SPAN_INVALID、纯文本成功；不改 server 规范化（CONTRACTS 3.1 契约冻结）。
4. **验证**：`bun run typecheck` 通过；`bunx convex dev --once` 推送函数成功；浏览器验证「我的案件」出现自编译案件《一场结构化的雨：程序员行业的筛选与幸存》并可进入简报（5 个新 AI 角色正常渲染）。

## 规范变更

- `docs/developer-a/CONTRACTS.md` 4.4：新增 `cases.listMine` 说明（additive 查询；listPublic 语义不变）。

## 已知失败 / 风险 / 遗留

- 证据板拼图三问题（芯片溢出/重叠、连线可发现性、目录 quote 对质静默无效）→ 第 3 轮。
- 等待体验（Validator 60~120s、无思考占位）与错误文案模板 → 第 4 轮。
- 评分 rubric 核查（指控成立证据分 0 之谜）+ AI 提示词（隐蔽性、判定过苛）→ 第 5 轮。
- 机器在 creating/opening 等非 lobby 态的长挂起仍靠门屏计时兜底（未做逐状态超时）。

## 下一位 Agent 的最小阅读顺序

1. `app/game/layout.tsx`（回弹 useEffect）、`context/GameContext.tsx`（matchesLobby）。
2. `convex/cases.ts` listMine / finalizeCompilationSuccess。
3. `app/page.tsx` stripMarkdownDecorations + MyCases。
