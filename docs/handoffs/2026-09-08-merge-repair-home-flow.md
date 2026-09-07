# MERGE-REPAIR-home-flow：kang-feature-zhihu 合并损伤修复 + 大厅动线重整

状态：`complete`（合并损伤修复与动线重整完成；全功能校验完成；AI_* 配置恢复完成，全链成功路径验证推进至 4/5 开场后遇供应商故障，见文末追记）  
完成时间：`2026-09-08`  
负责人：`ZCode`

## 实际完成

### 根因诊断（浏览器实测确认）

合并后首页"失去设计"的真相：**整页 React 未 hydrate**（DevTools hook `rendererCount=0`、页面发出 0 个 Convex 请求、无 canvas、`<main>` 无 React fiber 标记）。标题/案件卡/3D 大厅组件全部在代码中，只是停在 SSR `opacity:0` 初始态不可见。

根因有两个：

1. **Next.js 16.3.4 dev 防护**：dev server 默认只认 `localhost`，把 `127.0.0.1` 判为跨域并拦截 `/_next/hmr` 等开发资源（`Blocked cross-origin request to Next.js dev resource`），应用引导卡死、hydration 不发生。用户以 `127.0.0.1:3000` 访问即触发；`localhost:3000` 完全正常。
2. **合并损伤**（kang 分支为"无 Convex 可跑"设计的静默降级覆盖了主线契约）：`app/layout.tsx` 被改为无 `NEXT_PUBLIC_CONVEX_URL` 就不挂 Provider、`lib/convex-client.ts` 的 fail-fast throw 被改为返回 `null as unknown as ConvexReactClient`。违反 AGENTS.md「禁止默认值、静默降级」。

### 修复

- `next.config.ts`：新增 `allowedDevOrigins: ["127.0.0.1"]`（仅影响 next dev），127.0.0.1 访问恢复正常。
- `lib/convex-client.ts`、`app/layout.tsx`：`git checkout 0784c93 --` 还原为合并前契约版本（缺配置直接失败；Provider 无条件挂载）。
- 重启 3000 端口 dev server（原进程为合并前启动的常驻实例）。

### 大厅动线重整（app/page.tsx 右栏，保住 FE-B1 设计）

右栏按玩家动线重排为四段（`SectionLabel` 编号组件统一语言，emoji 全部换成手写 SVG 图标）：
① 开始一局（案件目录，点击 → /game/briefing）→ ② 带一篇知乎文章来（正式建案表单，支持 `?prefill_url=` 预填并自动展开）→ ③ 从知乎找选题（今日热案/知乎搜索入口，注明正式开局仍回 ②）→ ④ 我的战绩（战绩卡入口）。「玩法·90秒看懂」默认折叠。

### 成绩闭环

- `app/game/reveal/page.tsx`：揭晓后按 session 幂等写入 `localStorage.lastGameResult`（totalScore=双维分均值；roundsPlayed=role 消息数；timeUsed 由 `sessionView.created_at` 计算），行动区新增「生成战绩卡」→ `/zhihu/score-card`。
- `lib/score-card.ts`：分享文案与 HTML 的分数口径 /40、/35 修正为 /100（主线 reveal 双维分均为 0-100）。
- `app/zhihu/score-card/page.tsx`：重写为设计系统（ZhihuShell + card-dark + Mascot 空态「回大厅开一局」），新增战绩卡 iframe 预览。

### 知乎三页视觉对齐

- 新增 `components/zhihu/Shell.tsx`：知乎支线统一外壳（返回大厅导航 + 琥珀标题区 + Mascot）。
- `app/zhihu/hot/page.tsx`：套壳重写；初始加载检查 `data.error`（此前"ZHIHU_ACCESS_SECRET not set"被吞成空态）；生成结果改为**选题预览** + 「带着这篇回大厅建案」（`?prefill_url=`），移除原先直达 `/game/briefing` 的断链（该案未经 Convex 管线编译，简报页必空）与裸「证据板」链接。
- `app/zhihu/search/page.tsx`：套壳重写；每条结果加「带去建案 →」（同 prefill 机制）。

## 明确未完成

- `ZHIHU_ACCESS_SECRET` 仍未配置进 `.env.local`（秘钥只在系统 keychain 供 zhihu-cli 使用），热榜/搜索接口会显式报 `ZHIHU_ACCESS_SECRET not set`。需用户把秘钥写入 `.env.local`（已 gitignore）后这两个页面才可用。
- 热榜「生成案件预览」走知乎直答 AI（zhida-thinking-1p5），结果仅为选题预览；与主线 Convex 严格建案管线的打通（需完整正文+邀请码）刻意未做，防止绕过门控。
- 战绩卡预览 iframe 高度固定 420px，未做移动端自适应打磨。

## 修改文件

- `next.config.ts` — allowedDevOrigins。
- `lib/convex-client.ts`、`app/layout.tsx` — 还原合并前契约版本。
- `app/page.tsx` — 右栏四段式动线 + SectionLabel + 玩法折叠 + CustomCaseForm 支持 prefill_url（Suspense 包裹 useSearchParams）。
- `app/game/reveal/page.tsx` — lastGameResult 写入 + 生成战绩卡 CTA。
- `lib/score-card.ts` — 分数口径修正。
- `components/zhihu/Shell.tsx` — 新增。
- `app/zhihu/{hot,search,score-card}/page.tsx` — 套壳重写。

## 权威文档更新

无规范变更（CONTRACTS/ENGINEERING_SPEC/根计划/ADR 零改动；本环节为合并损伤修复与 B 侧前端实现，公开契约消费方式与 `docs/developer-a/CONTRACTS.md` 一致，且修复了此前的契约偏离）。

## 定向验证

- `bun run typecheck` — 通过（0 错误）。
- `bun run build` — 通过（20 条路由；知乎三页静态预渲染成功，确认 Suspense 包裹 useSearchParams 合规）。
- 浏览器走查（127.0.0.1:3000，IAB）：大厅 canvas 渲染 + 匿名身份建立 + 案件目录加载 ✅；点案件卡 → /game/briefing 档案/角色齐全 ✅；`?prefill_url=` 预填并展开建案表单 ✅；热榜页显式报 `ZHIHU_ACCESS_SECRET not set` ✅；搜索页空态引导 ✅；战绩卡空态 + 回大厅 CTA ✅。
- 生产 build 与 dev 均未受 Convex 后端影响（本地 backend 3210 由 `convex dev` 常驻）。

## 已知风险

- 生产（Vercel）若未配置 `NEXT_PUBLIC_CONVEX_URL`，还原 fail-fast 后页面会显式报错而非静默白页——这是契约行为，需确认 Vercel 环境变量已配置。
- GLM 免费档时段性过载仍可能使真实模型回合显式失败（既有事实，非本环节引入）。

## 下一位 Agent 的最小阅读顺序

1. 本记录
2. `git diff f3245b4..HEAD -- app/page.tsx app/zhihu/ lib/score-card.ts`
3. `docs/handoffs/2026-09-06-frontend-b-aesthetic-live-data.md`（FE-B1 设计与动线基准）

---

## 追记（2026-09-08 凌晨）：全功能校验 + AI_* 配置恢复 + 全链重试记录

### 全功能校验结论（只测未改，44 项）

- **PASS（24 项）**：大厅 3D/目录/四段动线/玩法折叠/建案表单校验态与假邀请码负例（CASE_CREATION_NOT_ALLOWED 显式呈现）/prefill_url、刷新恢复（终态+ecw.session_id+auth 令牌）、无会话守卫（等待+返回大厅）、热榜页错误显式透出、搜索页空态、战绩卡空态与**有数据路径全绿**（含 iframe 分享图）、管理台口令解锁与「生效来源：环境变量」视图（保存/清除未点击）、voice worker TTS 中英文（合法 WAV）、ASR 回环、语音路由负例（401 AUTH_REQUIRED）、dev-characters/dev-glb、全套件 147 pass / 0 fail / 11 skip。
- **两个阻塞根因（当日先后处置）**：① 本地部署 8 项 AI_* 模型配置缺失（仅剩 AI_ADMIN_SECRET，判为上会话清理后未恢复）；② ZHIHU_ACCESS_SECRET 不在 .env.local。
- **观察项（不修）**：复制文案在 IAB 沙箱不同步系统剪贴板（按钮态切换正常，真实浏览器待人工点验）；无会话直达证据板为"等待+返回大厅"非自动跳转。

### 用户决定与修复执行

- 用户指示「修复」并批准计划；对知乎秘钥选择「留好前端显式配置」——即 **ZHIHU_ACCESS_SECRET 保持不配置**，前端显式报错为契约合规状态。
- **已恢复** 8 项 AI_* 至本地部署（值经 shell 变量从 .env.local 传入，未回显未记录）；`convex env list` 回读 8/8；`scripts/model-smoke.ts` 真实供应商冒烟通过（`verdict:pass`；另一次尝试遇 1305 过载与一次 AI_TypeValidationError 模型输出抖动，均为已知的免费档/模型随机行为）。

### 全链重试记录（开庭→五条开场）

1. 尝试 1：开场回合快速失败（ROLE_TURN_FAILED → 对局终止，失败呈现符合契约）。
2. 尝试 2：同上。
3. 尝试 3（探针 pass 后）：**4/5 条真实开场陈述成功上屏**（沈青梧/纪云汀/阿岚/何叙，打字机+情绪徽章+时间戳），第 5 条遇供应商失败终局。
- 按计划「每模型步骤重试最多 2 次」预算用尽，停止重试；未伪装成功。审讯/录音/TTS/证据板/对质/指控/Reveal/成绩回写的浏览器级成功路径验证仍待供应商健康窗口，后端等价确定性覆盖已由全套件（含 Scripted TB9 家族）提供。

### 当前遗留（下位接手起点）

1. 择健康窗口重开一局走完整链（大厅→开庭→开场 5/5→审讯→存录音→TTS→证据板→对质→指控→Reveal→真实成绩回写战绩卡）。
2. 用户在自己浏览器点验战绩卡「复制文案」。
3. ZHIHU_ACCESS_SECRET 待用户提供时写入 .env.local（gitignored）。

---

## 追记 2（2026-09-08）：游戏内新手指引（分步聚光灯）

### 实现

- 新增 `components/onboarding/GameTour.tsx`（自包含）：六个页面（大厅/简报/审讯/证据板/指控/揭晓）各一段步骤（`TOURS` 注册表：data-tour 锚点 + 标题 + 文案）；聚光灯 = 目标定位高亮框 + 巨大 box-shadow 遮罩；说明卡就近放置（下/上/居中降级），上一步/下一步/跳过，Esc 可退；首次进页自动弹出一次（`localStorage ecw.tour.<id>`），自定义事件 `ecw:tour-start` + `requestTour()` 供「?」按钮重放；`enabled` prop 控制自动弹出时机（审讯页仅 investigation 阶段）；尊重 prefers-reduced-motion。
- **两个实现要点（踩坑记录）**：① 说明卡/高亮坐标必须在 measure()（scroll/resize 监听 + 双次 setTimeout 兜底）写入 state，不能在 render 里读 window 尺寸（视口变化后 stale render 导致卡片飞出屏幕）；② 引导层必须 `createPortal(document.body)`——大厅右栏 `backdrop-blur-md` 会创建 containing block，把 position:fixed 劫持为相对面板定位（视觉偏移 +1150px）。
- 接线：六页关键元素加 `data-tour` 锚点并挂载 `<GameTour/>`；`app/game/layout.tsx` 导航与大 lobby 右栏头部各加「?」帮助按钮（按 pathname 映射 tour）。

### 验证

- `bun run typecheck` 0 错误；`bun run build` 通过。
- 浏览器实测：大厅 4 步自动弹出→逐步推进→完成写标记→刷新不弹→「?」重放 ✅；四步说明卡全部在视口内（portal 修复后）✅；简报页首次到达自动弹出 ✅；聚光灯视觉截图目检通过（遮罩+琥珀高亮框+说明卡）✅。审讯/证据板/指控/揭晓四段 tour 与已验证段落同构，锚点存在性由代码审查保证，实际观感待全链通关时人工复看。

### 修改文件

- 新增 `components/onboarding/GameTour.tsx`；修改 `app/page.tsx`、`app/game/layout.tsx`、`app/game/{briefing,interrogation,evidence,accusation,reveal}/page.tsx`（data-tour 锚点 + 挂载 + 帮助按钮）。无规范变更（纯 B 侧前端）。
