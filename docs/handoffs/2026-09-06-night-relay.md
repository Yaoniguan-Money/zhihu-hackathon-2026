# 2026-09-06 夜间开发中继（供应商切换 + B 分支研究 + P1-3 收口推进）

状态：`complete`（中继快照，P1-3 过夜重试结果以追加更新为准）  
完成时间：`2026-09-06`  
负责人：`开发人员 A / ZCode`

## 用户授权（2026-09-06 夜间指示）

① 检查新支线上 B 端工作者的状态、研究合并可行性；② AI 分析更换为用户提供的智谱 API、模型用 `glm-4.7-flash`；③ 照开发文档要求与规范、不做任何降级地完成绝大多数任务；④ 需要用户手动操作/验收的环节先跳过、留待醒后批量验收。

## 本夜已完成（全部有 handoff + 验证）

| 环节 | 要点 |
|---|---|
| AI 供应商切换 | 本地 `.env.local` 与生产 `agile-turtle-860` 八项 `AI_*` 全部切换为智谱 `glm-4.7-flash`（Key 仅存本地/部署 env，不入库不入文档）；`scripts/model-smoke.ts` 真实供应商 smoke 通过；切换后生产 `auth:signIn` + `cases:listPublic` 冒烟正常。见 [AI 切换 handoff](./2026-09-06-ai-provider-switch-glm.md)。 |
| developer-b 分支研究 | `origin/developer-b`（2 提交，merge-base=main HEAD，git 层面可 FF 零冲突）经逐文件审查结论为**原样不可合并**：AGENTS.md/README 被脚手架覆盖、package.json/tsconfig 破坏共享工具链（38 个保留文件引用被删别名，分支自身构建必败）、`contracts/types.ts` 公开契约系统性漂移、UI 100% mock 驱动（mock 进生产路径违规）。B 侧有价值的页面/组件/three.js 资产与重接路径已写入报告，按所有权边界 A 不代写。见 [合并可行性报告](./2026-09-06-developer-b-merge-feasibility.md)。 |
| COMPILE_LEASE 重校准 | 实测智谱免费档对非流式请求约 900s 切断；`convex/cases.ts` 的 `COMPILE_LEASE_MS` 按新供应商观测延迟 15→30 分钟（过期显式失败/不自动重调/防复活机制零变化）；lease 专项测试 2/2、typecheck 通过、函数已推送本地后端。 |
| REL1 P1-2 本地证据 | Voice Worker 单实例清理双绑定后启动，`/health` 返回 `voice_pack_locked:true`；`tests/p12-voice-worker.test.ts` 4/4、`tests/p12-voice-routes.test.ts` 6/6（注意：两文件并发跑会互相干扰，单独跑各自全绿）。 |

## P1-3 状态（过夜进行中）

- 第一次重跑：`No CONVEX_DEPLOYMENT` 环境缺失失败（已解决：本会话 shell 需 `CONVEX_SELF_HOSTED_URL/ADMIN_KEY`，从 `.convex/local/default/config.json` 读取注入）。
- 第二次重跑：编译尝试 1 的 claim 调用 227ms 失败（智谱 1305 过载）、尝试 2 挂起 15.4 分钟被供应商切断→显式失败，测试等待预算(480s)内未到终态。
- 已将测试观察窗预算按新供应商重校准（编译等待 480s→1200s、五条开场 600s→1500s、单回合 240s→600s、文件 25min→90min；**断言与产品行为零变化**）。
- 第三次重跑在健康探测通过后启动，attempt 1 claim 调用 881s 后仍被供应商切断（暴露 900s 上限与 lease 边界问题→触发 lease 重校准）。
- 当前：**探测门控过夜重试循环运行中**——每 25 分钟探测吞吐（≤90s 判健康），健康窗口才启动全链测试，最多 8 个循环；结果以 `/tmp/p13-overnight.log` 与本记录追加更新为准。

## 测试状态（本夜实测）

- `bun test` 全套件：135 pass / 0 fail / 11 skip（Scripted 路径，供应商无关）。
- `RUN_VOICE_WORKER=1`：worker 4/4 + routes 6/6。
- `bun run typecheck`：通过。
- 真实供应商：model-smoke 通过；P1-3 全链待健康窗口（见上）。

## 待用户醒后批量验收清单

1. `docs/REL1-acceptance-checklist.md` 各人工项（本地后端/GLM 配置/voice worker 均已就绪；第 4 节 P1-3 待过夜循环结果）。
2. `bun scripts/verify-rel0.ts` 需要 `CONVEX_DEPLOY_KEY`（用户持有；本夜以 CLI 生产冒烟替代验证）。
3. case-demo-002 工件审阅与系统目录晋升决定（ADR 0004，等 P1-3 全链绿灯后更有意义）。
4. B 端整合路径转达（见合并可行性报告）；AUTH1 仍等 App ID/App Key 与回调登记。
5. 本夜 commit 审阅与 push 授权确认（沿用既有环节授权模式已推送，见下）。

## 继续工作的最小阅读顺序

1. 本记录 + [AI 切换 handoff](./2026-09-06-ai-provider-switch-glm.md) + [合并可行性报告](./2026-09-06-developer-b-merge-feasibility.md)
2. 根计划第 5 节 P1-3 行
3. `tests/p13-second-case.test.ts`（观察窗预算注释）与 `convex/cases.ts` lease 常数注释

## 已知运维事实（新增）

- 智谱 `glm-4.7-flash` 免费档：错误 1305「访问量过大」快速失败，或接受后在 ~900s 切断；吞吐随时段波动，长输出任务（claim 抽取）需健康窗口。
- 本地后端常驻；模型类测试需 shell 注入 `CONVEX_SELF_HOSTED_URL/ADMIN_KEY`（config.json 读取方式见 `tests/helpers/convex-local.ts`）。
- voice worker 常驻单实例（127.0.0.1:8717）；双实例会在 Windows 下双绑定竞争，启动前先查端口。

## 追加（03:00 前后）：developer-b 调和合并完成

- 用户预览 B 端 UI 后明确指示「合并且推送」；已按可行性报告的整合路径执行调和合并（merge commit `4611e59`）：保留 B 全部产品代码与依赖，从 `bf2789f` 还原 AGENTS.md/README/tsconfig/next.config，package.json 手工并入 B 依赖后重装。合并后 main：typecheck 零错误、全套件 135 pass / 0 fail、build 通过（`/` + `/game/*` 五页 + voice Routes）。详见[合并可行性报告追记](./2026-09-06-developer-b-merge-feasibility.md)。
- 新增运维事实：**手动 kill 模型类测试会跳过其 afterAll，把 AI_* 残留在本地部署上**，导致后续「无模型」测试误报（期望 SERVICE_NOT_CONFIGURED 实得 ROLE_TURN_FAILED）。清理方式：`bunx convex env remove AI_*` 八项后复跑即恢复 135/0。
- P1-3 过夜循环：cycle 1-2 探测均未达健康窗口（1302 限频 → 183s 慢响应），继续运行中。
