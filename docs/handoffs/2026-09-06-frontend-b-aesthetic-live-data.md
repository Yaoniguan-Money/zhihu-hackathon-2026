# FE-B1：前端审美全面重制 + B 侧真实数据重接

状态：`complete`（前端交付完成并全量验证；真实模型全链人工试玩因 GLM 免费档间歇性故障留待 REL1，见"已知风险"）  
完成时间：`2026-09-06`  
负责人：`开发人员 B / ZCode`

## 实际完成

按用户夜间指示（"全面优化前端审美、完整 3D、卡通角色五官/肢体/表情丰富、交互动效、照开发文档规范不降级、装动效库、严格把关多轮迭代"），以 B 侧所有权完成：

### 审美与 3D（全部程序化，零外部模型文件）

- **Q 版卡通角色系统** `components/three/characters/`：球体/胶囊装配的坐姿 chibi（大头、大眼、眉、嘴、腮红、鼻、耳、汗滴），Toon 三阶渐变 + 描边；眨眼、呼吸、张望、说话口型/点头、stance 映射手势（answer→点头、deny→摇头、challenge→前倾、clarify→歪头、evade→耸肩）、emotion（calm/uneasy/defensive/agitated）映射眉角/嘴型/脸红/汗滴/颤抖，pressure 放大紧张表现；5+1 套外观（bob/bun/swept/curly/hood/short + 眼镜/贝雷帽/记者证/领结/围巾/工牌），已知 persona_key 精选 → bio 关键词推断 → role_id 哈希兜底。
- **卡通审讯室** `components/three/scene/InterrogationRoom.tsx`：圆木桌 + 暖光吊灯（唯一 shadow 光源）+ 夜窗星月 + 书架（种子随机书籍）+ 软木证据墙（图钉纸条红线）+ 绿植 + 挂钟 + 尘埃 Sparkles + ContactShadows。
- **舞台封装**：`InterrogationStage`（大厅自动环绕 / 审讯聚焦双模式 + 3D 气泡）、`PortraitRow`（档案/指控立绘阵列）、`CameraRig`（gsap 入场运镜 + 聚焦 lerp + 用户拖拽即交还控制权）。
- **设计系统重制** `app/globals.css`：「夜色侦探事务所」桌游贴纸风（夜蓝×暖琥珀×米纸、墨线描边、硬偏移投影、胶带/纸纹/圆钮），btn/chip/card 全套；emoji 图标全部替换为手写 SVG（`components/ui/Icons.tsx`）；`prefers-reduced-motion` 全线降级。
- **刘看山官方素材**：按 OFFICIAL_RESOURCES 清单路径用于引导/加载/空态/终局演出（`components/ui/Mascot.tsx`）。

### 规范化重接（按合并可行性报告的 B 侧整合路径）

- **mock 出清**：删除 `mock/goldenCase.ts` 与漂移的 `contracts/types.ts`；前端一律导入 `@/contracts/public`（+`@/contracts/shared` 的 RoleId/DistortionType）。
- **XState 状态机** `context/gameMachine.ts`：lobby→briefing→opening_statements→investigation（ask/presentRecording/saveRecording/updateBoard 子流程）→judging→revealed|failed，全部镜像 `SessionView` 与公开事件；轮询 `sessions.getPublic` + `events.listPublic(after_sequence)`（事件触发证据解锁/录音保存/失败 toast 与思考气泡）；`roleTurns.ask/presentRecording` 提交后 observe 轮询至终态（3 分钟上限，显式失败）；Board 保存带 `expected_revision` CAS；`client_action_id` 全 UUID；`SELECT_CASE`/`RETRY_CATALOG` 提升根级（任何状态可回大厅开新局）。
- **刷新恢复**：localStorage 存 session_id → `restoring` 流程拉 SessionView + 案件 + 消息 + 证据后按 phase 路由（规格 2.1.8）。
- **六页全部重写**：Lobby（3D 大厅 + `cases.listPublic` 真目录 + 邀请码建案表单走 `createFromSource`→`observeCompilation` 进度）；Briefing（档案美学 + 3D 立绘 + 开庭后自动跟随 phase 进入审讯）；Interrogation（3D 舞台 + 开场剧场 1/5 进度 + 温和/直接/施压问法选择器（契约必填）+ 打字机 + 逐条发言「存为录音证据」`saveRecording` + TTS 播放按钮（失败显式保留文字）+ 麦克风 ASR 回填确认（`source:"asr"`，30s 上限环）+ emotion→3D 表情/气泡实时联动；删除了契约中不存在的假回合数/倒计时）；Evidence（契约六泳道 + 自由 x/y 摆放 + BoardLink 六种关系连线 + `conflicts_with` 自动红线 + 整板 CAS 保存 + 冲突刷新重提 + 录音证据「递给角色对质」`presentRecording`）；Accusation（嫌疑角色 3D 选择 + 10 类篡改方式多选 + 证据多选 + 备注）；Reveal（gsap 时间轴：正误时刻/真凶卡/篡改徽章/altered_links 原文vs篡改对照/truth_chain 步进/双评分滚动计数/判词/现实映射）。
- **全局**：Convex Auth 匿名登录门控（`ConvexAuthProvider`）；typed failure 统一组件（错误码 + 玩家可采取动作）；toast 系统；导航按 `allowed_actions` 门控。

## 明确未完成

- 浏览器内真实模型**全链试玩 demo**（开场→审讯→证据→指控→Reveal）未走通：GLM 免费档对长结构化回合间歇性失败（详见"已知风险"）。已验证到的最远链路：建 session → `game.start` → `opening_statements` phase → `role_turn_working` 思考气泡真实事件 → 回合失败 → 显式终局（三次，全部按契约呈现）。此为外部供应商问题，非前端缺陷；UI 代码路径均为真接口、无任何 mock。
- 录音 ASR 的真实麦克风流未被自动化验证（无麦克风环境）；组件按契约实现（回填确认、失败保留键盘、不自动提交），留 REL1 人工项。
- 动效库未新增安装：gsap + motion 已在依赖内且全量启用（用户指示"安装 gsap 或更合适动效库"，评估后双库分工即最优，无需引入更多）。

## 修改文件

- 新增：`lib/convex-client.ts`、`lib/convex-errors.ts`、`lib/distortions.ts`、`context/gameMachine.ts`、`components/three/{InterrogationStage,PortraitRow,SpeechBubble}.tsx`、`components/three/characters/{ChibiCharacter,personas}.ts(x)`、`components/three/scene/InterrogationRoom.tsx`、`components/ui/{Icons,Typewriter,Toaster,ErrorPanel,VoicePlayer,RecordButton,Mascot}.tsx`、`app/dev-characters/page.tsx`（仅本地角色陈列室，生产 404）。
- 重写：`app/page.tsx`、`app/layout.tsx`、`app/game/layout.tsx`、`app/game/{briefing,interrogation,evidence,accusation,reveal}/page.tsx`、`components/DialogueList.tsx`、`components/three/CameraRig.tsx`、`context/GameContext.tsx`（机器适配层）。
- 删除：`mock/goldenCase.ts`、`contracts/types.ts`、`lib/roleUtils.ts`、`components/{EvidenceBoard,EvidenceChip,PressureBar,RoleCard,AccusationSlot,ContradictionMarker,RecordButton}.tsx`、`components/three/{RoundTable,RoleSeat}.tsx`。

## 权威文档更新

无规范变更（CONTRACTS/ENGINEERING_SPEC/根计划/ADR 零改动；本环节为 B 侧实现，公开契约消费方式与 `docs/developer-a/CONTRACTS.md` 完全一致）。

## 定向验证

- `bun run typecheck` — 通过（0 错误）。
- `bun test` — 两种环境态均实测：本地部署**无 AI_*** 时 135 pass / 0 fail / 11 skip（与合并后基线一致）；本地部署**已配置 AI_***（产品可玩态）时 130 pass / 5 fail，5 个失败全部是"(本地后端，无模型)"家族断言 `SERVICE_NOT_CONFIGURED`（TB1/TB4/TB7/TB10/P1-1），因部署已带模型配置而按真实模型路径执行——环境态互斥，非本环节回归（A 侧后端文件本环节零改动）。
- `bun run build` — 通过（`/`、`/game/*` 五页、`/dev-characters`（生产 404 化）、两个 voice Route）。
- 浏览器实测（localhost:3100 + IAB）：大厅 3D 渲染 + 真实案件目录拉取；选案→档案→开庭自动跳转；开场剧场进度卡；真实 `role_turn_working` 思考气泡（沈青梧）；回合失败→ROLE_TURN_FAILED 显式终局（三次，呈现均正确）；证据板六泳道/空态；Reveal 非揭晓期守卫；档案立绘相机两轮调优；角色五官 z 深度修复（球面方程重算）后陈列室复验通过。
- 本地部署 AI_* 八项已按 `.env.local` 显式配置（REL1 前置条件 0），`scripts/model-smoke.ts` 多次通过。

## 已知风险、阻塞与下一步

- **外部阻塞（供应商）**：GLM `glm-4.7-flash` 免费档 smoke 可过、但完整角色回合（长结构化输出）间歇失败（症状与 [AI 切换 handoff](./2026-09-06-ai-provider-switch-glm.md) 记录的 1305/900s 切断一致）。后台健康探测循环（每 8 分钟 `model-smoke`，日志 `/tmp/health-probe.log`）已挂起，健康窗口内可直接在 https://localhost:3100 人工试玩全链。
- **测试环境态互斥**：产品可玩（部署带 AI_*）与"无模型"测试族（断言 SERVICE_NOT_CONFIGURED）不能同时成立；批量验收若要 135/0 基线，先 `bunx convex env remove AI_*`（八项）再跑，验完按 REL1 前置重新配置。建议后续由 A 侧为该测试族引入独立无模型部署。
- REL1 人工清单项（麦克风试听、case-demo-002 审阅、verify-rel0 等）保持留待用户，与 [REL1 清单](../REL1-acceptance-checklist.md) 一致。
- 下一步入口：① 用户晨起直接打开 localhost:3100（或 Vercel）体验；② 健康窗口跑通全链后补 REL1 第 1 节浏览器路径勾选；③ 若 GLM 持续不稳定，供应商层重试/降档决策属 A 侧。

## 最小接手阅读顺序

1. 本记录
2. `AGENTS.md`（所有权边界）
3. `docs/handoffs/2026-09-06-developer-b-merge-feasibility.md`（B 侧整合路径——本环节按其第 2/3 步执行完毕）
4. `docs/developer-a/CONTRACTS.md`（前端消费的公开形状）
