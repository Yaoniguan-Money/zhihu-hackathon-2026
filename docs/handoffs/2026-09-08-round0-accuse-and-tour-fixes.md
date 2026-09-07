# 2026-09-08 · Round 0：指控提交 P0 修复 + 揭底页引导滚动死锁修复

- 状态：complete
- 完成时间：2026-09-08（持续迭代第 0 轮收尾）
- 负责人：AI 代理（用户委托的持续迭代循环，桌面 `证据链狼人杀-迭代记录/00-第0轮-*.md` 为完整体验报告）

## 实际完成

1. **Fix-1（P0）指控提交无效**：`context/gameMachine.ts` 的 investigation 状态此前只声明了 `ACCUSE` 事件类型与 `accuser` actor，但没有任何 transition 处理 ACCUSE，事件被 XState 静默丢弃，「提交指控」点击无效，游戏流程不可能到达 judging/revealed。修复：仿照 BOARD_SAVE→.savingBoard 模式新增 `ACCUSE → .accusing` 转换与 `.accusing` invoke 子状态（onDone 更新 sessionView + 成功通知；onError 走 typed actionError）。
2. **Fix-2（P0）揭底页三重锁死**：`components/onboarding/GameTour.tsx` 在 scroll 事件（capture）上注册的 measure 每次执行 `scrollIntoView(center)`，与用户滚动形成反馈死锁；测量竞态导致说明卡定位到视口外（top≈-349px）；全屏浮层拦截点击。首次到达揭底页的玩家无法滚动/无引导可见/无法操作。修复：measure 拆分意图——换步 `measure(true)` 锚定一次，滚动/resize `measure(false)` 只重测不滚动；说明卡上方位置对 bottom 夹取（`vh-170`）保证可见。
3. 供应商运维：经 `/admin/providers` 将运行时由 GLM（1305 过载）切至 DeepSeek `deepseek-v4-flash`（数据库注册表覆盖层，env 未动）。
4. 首次全链路人工式通关验证：大厅→简报→开庭→审讯（三问法、录音存证、对质）→证据板（连线、对质）→指控→合议→揭底（判决/真相链/双评分）。

## 规范变更

无（两处均为前端状态机接线与组件缺陷修复，不触碰 contracts/公开投影/服务端契约）。

## 验证

- `bun run typecheck` 通过（两处修改后各一次）。
- 浏览器端到端：提交指控后阶段徽章「合议中」→「真相揭晓」；揭底页滚动自由、引导可见可完成、判决头/被改变的关系/真相链/双评分/行动按钮全部可达。
- 未跑全量测试套件（按用户本轮迭代指示）。

## 已知失败 / 风险 / 遗留

- 入口门屏「正在进入审讯室…」不监听 session failed，失败会话永久盲等（P0，下一轮目标）。
- 开场陈述失败错误文案误用玩家话术；错误模板全局通用（P1）。
- 证据板芯片溢出/重叠/连线可发现性/目录 quote 证据对质静默无效（P1）。
- Validator 延迟（DeepSeek 下 19~111s 波动）主导等待，无思考占位（P1）。
- 判定过苛（人对类型漏一个=未成立）；判词泄漏 role-skeptic/cl-xxx/scope_expand 内部 ID（P1）。
- 管理台首次保存注册表报未加工内部错误（需先停用 env 来源供应商卡）（P1/P2）。
- 完整清单见桌面 `证据链狼人杀-迭代记录/README.md` 总账。

## 下一位 Agent 的最小阅读顺序

1. `context/gameMachine.ts` investigation 状态（新增 `.accusing`）。
2. `components/onboarding/GameTour.tsx`（measure 拆分意图）。
3. 桌面迭代记录 README 的遗留问题总账（下轮目标：入口门屏盲等）。
