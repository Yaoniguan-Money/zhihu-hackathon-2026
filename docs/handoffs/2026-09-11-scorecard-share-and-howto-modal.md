# UX-SCORE-HOWTO-01 战绩卡原生分享重构 + 玩法弹窗 + 大厅右栏滚动修复

状态：`complete`
完成时间：`2026-09-11`
负责人：`Trae Agent（GLM-5.3-Flash）`

## 实际完成

- 战绩卡页（`/zhihu/score-card`）新增「分享战绩」与「保存图片」按钮，保留「复制文案」。分享走 `navigator.share` 降级链：PNG 文件分享 → 文案分享 → 复制文案（附明确提示）；用户取消分享面板（AbortError）不视为失败。
- 分享图改为真实 React 组件渲染（新 `ScoreCardArt`），用 `html-to-image@1.11.13`（`pixelRatio: 2`）在客户端导出 PNG；视觉 1:1 复刻原 HTML 卡（渐变底、顶部双色条、结果横幅、等级徽章、四格数据、页脚）。
- 删除服务端 HTML 字符串方案：`lib/score-card.ts` 移除 `generateScoreCardHTML`，删除 `app/api/zhihu/score-card/route.ts`（grep 确认无其他消费方）；`ScoreCardData` / `calcDiscernmentLevel` / `generateShareText` 保留（reveal 页与 tests 继续使用）。
- 「玩法 · 90 秒看懂」改为点击弹出新弹窗 `HowtoModal`（portal + fixed 遮罩 + `max-h-[85vh]` 内部滚动；✕ / 点遮罩 / Esc 关闭；五条玩法文字原样保留）；原右栏就地展开块删除。
- 大厅右栏滚动容器补 `overscroll-contain touch-pan-y` 并增加底部内边距（`pb-6`），缓解小屏触屏裁切。

## 明确未完成

- 弹窗、分享、下载的人工浏览器交互验证只做了 SSR/HTTP 层（两路由 200、大厅含玩法入口），未做真机触屏与真实知乎 App 分享验证。
- `bun run lint` 在仓库存在既有 `react-hooks/set-state-in-effect` 失败（未改动代码同样报错，如 `ModelSettingsDialog`、`app/page.tsx` 既有行）；本次新代码沿用了代码库既有 portal/localStorage 模式，未新增类别。

## 修改文件

- `components/zhihu/ScoreCardArt.tsx` — 新增：React 渲染的战绩卡分享图，`forwardRef` 暴露根节点供 `html-to-image` 截图。
- `app/zhihu/score-card/page.tsx` — 移除 fetch/iframe/HTML state；新增分享按钮组（分享战绩 / 保存图片）、PNG 生成 busy 态与结果提示；文案改为客户端直调 `generateShareText`。
- `lib/score-card.ts` — 删除 `generateScoreCardHTML`（服务端 HTML 字符串方案随 iframe 一起退役）。
- `app/api/zhihu/score-card/route.ts` — 删除（唯一消费方是已移除的 iframe HTML）。
- `components/lobby/HowtoModal.tsx` — 新增：玩法说明弹窗，范式照 `ModelSettingsDialog`。
- `app/page.tsx` — 玩法按钮改为开弹窗、删除就地展开块；右栏滚动容器补触滚兼容类。
- `package.json` / `bun.lock` — 新增依赖 `html-to-image@1.11.13`。

## 权威文档更新

无规范变更（不涉及 contracts/、ADR 术语或实施顺序；战绩卡不在公开契约内）。

## 定向验证

- `bun run typecheck` — 通过（先清掉了 `.next/types/validator.ts` 中引用已删除 route 的陈旧生成文件后通过）。
- `bun test tests/sfx.test.ts` — 通过（8 pass，含 `calcDiscernmentLevel` 分档，确认导出未破坏）。
- `bunx eslint`（改动文件） — 仅既有的 `react-hooks/set-state-in-effect` 类错误（未改动代码同样报错），无新增类别。
- `curl http://localhost:3000/`、`/zhihu/score-card` — 均 200，大厅 SSR 包含「玩法 · 90 秒看懂」入口。

## 已知风险、阻塞与下一步

- **2026-09-11 补充修正**：用户复测反馈「带一篇知乎文章来」展开后依旧无法滚动——右栏滚动容器的 `overscroll-contain touch-pan-y` 修复在用户真机上不生效。二次修复：新增通用弹窗壳 `components/ui/Modal.tsx`（portal + fixed 遮罩 + `max-h-[85vh]` 内部滚动 + Esc/遮罩/✕ 关闭），`HowtoModal` 改用该壳；「带一篇知乎文章来」表单整体从右栏就地展开改为点击弹窗（textarea 增至 8 行），彻底不再依赖右栏滚动；同时移除右栏滚动容器的 `backdrop-blur-md`（多层 backdrop-filter 叠加是真机触摸滚动卡顿的已知诱因，子卡片 `.card-dark` 自身磨砂保留）。typecheck 通过；`bunx eslint` 仅剩既有同类错误（`Modal` 的 portal `setState` 与 `ModelSettingsDialog` 同款模式，`app/page.tsx` 三处为改动前既有）。
- `html-to-image` 在 Tailwind v4 的 oklch 计算色下依赖现代浏览器渲染能力；卡片主体使用内联十六进制色，风险低，但建议真机过一遍「保存图片」确认图案完整。
- `navigator.share` 带文件仅 HTTPS / 安全上下文可用；本地 HTTP 桌面端会走文案分享/复制降级，部署到 HTTPS 后才有图文件分享。
- 下一步可执行的起点：真机（触屏）回归大厅滚动、玩法弹窗、带文建案弹窗、战绩卡分享四处；如需美化分享图，直接改 `ScoreCardArt.tsx` 单文件即可。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `.trae/documents/plan-scorecard-share-and-howto-modal.md`（本环节计划与决策）
3. 本记录
