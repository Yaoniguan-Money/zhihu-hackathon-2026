# 2026-09-05 夜间开发中继（夜间总结与继续点）

状态：`complete`（中继快照，随夜间进度更新）  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 用户授权（2026-09-05 夜间指示）

照开发文档与规范完成绝大多数任务、不做降级；需要用户手动操作/验收的环节先跳过、留待醒后批量验收；用户代行 B 审批的事项一律视为通过；不替 B 开发者实现页面/XState。

## 本夜已完成（全部有 handoff + commit）

| 环节 | commit | 要点 |
|---|---|---|
| GC0 工作基线 | 05bad61 | 九项清单确认与冻结签署延后批量验收；草案即工作基线 |
| TB1 Source 与 Durable 建案 | 6772afb | A1 纯函数、建案三接口、durable worker、幂等/邀请码/三重额度；真实模型编译端到端通过 |
| TB2a Golden 种子与公开查询 | 1da1261 | 冻结标注直接落库系统案件；getPublic/getSource |
| TB3 Session Authority | c4b1440 | sessions.create/getPublic、messages/events.listPublic、Owner 隔离、幂等 |
| TB4 Faithful 成功回合 | 9610862 | ask/observe 全链路、生成+校验+重写门控、证据解锁；真实模型 entailed 回合通过 |

另外：PF1 补齐 auth.config.ts + JWKS（JWT 校验链路首次真正打通）、AI_* 配置落地（DeepSeek v4）+ smoke、AI 配置 handoff。

## 测试状态

- `bun test`：69 pass / 0 fail / 1 skip（模型测试显式 opt-in）
- `RUN_MODEL_INTEGRATION=1`：TB1 编译、TB4 回合各自通过（消耗真实 DeepSeek 调用）
- `bun run typecheck`：通过

## 待用户醒后批量验收清单

1. GC0 九项清单（golden-case/case-demo-001/gc0-draft/README.md）→ 确认后执行冻结流程。
2. 本夜全部 commit 审阅（未推送远端；是否 push 由用户决定）。
3. 旧中文目录删除确认（ascii-path handoff 遗留项）。

## 剩余依赖前沿（按序）

1. **TB5**：把 worker 的尝试循环抽成 `server/turn-engine/` 纯函数（接 ModelGateway Seam），用 Scripted Adapter 覆盖：首试通过/一次重写通过/两次重写通过/三次全拒；协议错误不进入语义重写。
2. **TB6**：Distorted 门控测试（status=distorted、类型⊆允许集、新事实拒绝、公开结果不泄露 Fidelity）。
3. **TB7**：game.start——briefing→opening_statements，按 CasePublic.roles 固定顺序串行五条开场（一次一个活动 Ticket），全过→investigation（allowed=ask/update_board/accuse），任一失败→failed+terminal_error，历史保留。
4. TB2b：用户案件完整编译器（模型出角色/Catalog 候选、服务器定 4+1 与答案、Public Projection）。
5. TB8（Board/证据投影）、TB9（accuse/Reveal + rubric 消费）、TB10（全链证明）。
6. REL0/AUTH1/G1/P1：需外部资源或用户输入，保持 BLOCKED（不降级）。

## 继续工作的最小阅读顺序

1. 本记录 + 根计划第 5 节状态
2. `docs/handoffs/2026-09-05-tb4-faithful-role-turn.md`
3. `convex/roleTurns.ts`、`server/model/schemas/role-turn.ts`
4. `tests/helpers/convex-local.ts`（HTTP 集成基建、AI 环境设置模式）

## 已知运维事实

- 本地后端常驻（重启命令见 2026-09-05-workspace-ascii-path）；CLI 用 `bunx convex` + CONVEX_SELF_HOSTED_URL/ADMIN_KEY。
- bun test（NODE_ENV=test）不自动加载 .env.local；模型类测试显式解析。
- 含建案的测试套件在 beforeAll 调 `admin:resetQuotaState`（全局日额度跨运行累积）。
- AI_* 在测试前后由 beforeAll/afterAll 设置/移除（--from-file --force）。
