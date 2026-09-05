# developer-b 分支合并可行性研究

状态：`complete`（研究结论：原样不可合并；合并未执行）  
完成时间：`2026-09-06`  
负责人：`开发人员 A / ZCode`

## 实际完成

用户夜间指示「检查新支线上 B 端工作者的状态，研究合并可行性」。本记录为该研究的完整证据与结论；**合并决策：不执行合并**，理由与 B 侧整合路径见下。

### 分支现场事实

- 远端分支 `origin/developer-b` 存在，含 2 个提交：`d13fd45`、`54af9c6`，作者为 B 端工作者。
- merge-base 为 `bf2789f`，与当前 `main` HEAD 相同：`main` 在分叉后无新提交，**git 层面可 fast-forward、零文本冲突**。
- 两个提交的 message 在提交时已发生编码损毁（`git log` 中呈现为连续 `?`，非终端显示问题），无法从提交信息恢复语义。
- 累计 diff：39 个文件、+10,274 / −160 行。

### 结论：原样不可合并（四类证据）

1. **治理文件被脚手架覆盖**：`AGENTS.md` 的项目级全部约束（所有权、失败策略、交接规则）被整体替换为 Next.js `next dev` 自动写入的 agent-rules 样板；`README.md` 被替换为 create-next-app 模板。合并即删除仓库治理。
2. **共享工具链被破坏**：`package.json` 移除了 `convex`、`@convex-dev/auth`、`@auth/core`、`zod`、`@ai-sdk/openai-compatible`、`ai` 依赖，删除 `typecheck`/`test` 脚本与 `packageManager`/`engines` 锁定，并引入 7,572 行 `package-lock.json`（本仓库以 bun.lock 管理）；`tsconfig.json` 删除 `@contracts/*`、`@server/*` 路径别名。**分支树内保留的 38 个 A 侧文件仍引用这两个别名**（如 `app/api/voice/transcriptions/route.ts` → `lib/voice.ts` → `@contracts/public`），因此该分支自身的 `tsc --noEmit` 与 `next build` 都无法通过——B 从未在本分支上验证过仓库整体构建。
3. **公开契约漂移**：B 新增 `contracts/types.ts`（146 行手写类型，自注「A端公开接口类型」），与权威 `CONTRACTS.md` / `contracts/` runtime schema 系统性不符，例如：`GameState` 使用 `lobby/interrogation/evidence_review/game_over`（真实阶段为 `briefing/opening_statements/investigation/judging/revealed/failed`）；`Accusation` 缺少契约必需的 `distortion_type`；`SessionView.current_round/max_rounds/time_remaining` 在公开投影中不存在；`DialogueTurn.pressure_level/is_interrupted/timestamp` 等字段与真实 `MessagePublic` 不符；`RolePublic.voice_id` 沿用 `voice-zh-01` 编号（真实为已锁定音色包语义）。该文件进入 `contracts/` 命名空间会形成与权威 schema 竞争的「第二契约来源」。
4. **mock 位于生产路径**：`context/GameContext.tsx` 的全部数据来自 `mock/goldenCase.ts`（254 行，`mockGetPublic/mockGetSource/mockDialogues/mockEvidences`），没有任何 Convex 客户端或公开接口调用；`submitAccusation` 在本地直接翻转到 reveal。违反「mock 不得进入生产路径」，若合并并部署，玩家看到的将是假数据面。

### B 侧工作中有价值的资产（保留意见，供整合）

- 完整页面流：`app/game/{briefing,interrogation,evidence,accusation,reveal}` 与 lobby 改版。
- 组件：`EvidenceBoard`、`DialogueList`、`RoleCard`、`RecordButton`、`EvidenceChip`、`PressureBar`、`AccusationSlot`、`ContradictionMarker`。
- three.js 圆桌场景：`components/three/{RoundTable,RoleSeat,CameraRig}`。
- 交互依赖选型：xstate、@dnd-kit、gsap、motion、tailwindcss 4（可并入 bun manifest）。

### B 侧整合路径（需由 B 或用户授权后执行；A 按所有权边界不代写页面/XState）

1. 以 `main` 为基，恢复 `AGENTS.md`、`README.md`、`package.json`、`tsconfig.json`（把 B 的新依赖合并进 bun manifest，不用 npm lockfile）。
2. 删除 `contracts/types.ts` 与 `mock/goldenCase.ts`；页面一律消费 `contracts/public` runtime schema 校验后的数据。
3. `GameContext` 数据源改接真实公开接口：`cases.listPublic` → `sessions.create` → `messages.listPublic`/`events.listPublic` → `roleTurns.ask/observe` → `evidence.getAll/updateBoard/saveRecording` → `game.accuse/getReveal`；阶段映射改用真实 phase 集合；指控补 `distortion_type`。
4. 语音走同源 `/api/voice/*` Route，不直连 Worker。

## 明确未完成

- 合并未执行（本研究结论为不可合并，非外部阻塞）。
- B 端实际重接工作未开始（属 B 所有权范围）。

## 修改文件

- 无（本环节为纯研究；检视用的临时 `git worktree` 已删除）。

## 权威文档更新

- 无规范变更（`main` 权威契约、规格、计划零变化；本记录只陈述分支事实）。

## 定向验证

- `git merge-base main origin/developer-b` → `bf2789f`（= main HEAD，FF 可行）。
- `git diff --stat main...origin/developer-b` → 39 文件 +10,274/−160。
- 分支树内 `grep -rl "@contracts/|@server/" app lib tests server convex` → 38 个文件引用已被该分支 tsconfig 删除的别名（静态证明构建必败）。
- `context/GameContext.tsx`、`contracts/types.ts`、`mock/goldenCase.ts` 逐文件人工审阅（证据 3、4 来源）。

## 已知风险、阻塞与下一步

- 风险：该分支与 `main` 的 merge-base 恰为 main HEAD，`git merge developer-b` 会**无冲突地**静默覆盖治理与工具链文件——任何人在未读本记录前执行 merge 都会破坏仓库。建议 B 整合时采用「以 main 为基重建 + 逐组件移植」而非 merge。
- 下一步：用户向 B 端工作者转达本记录第「B 侧整合路径」节；B 完成重接后再走 REL1 的产品页验收。

## 最小接手阅读顺序

1. 本记录
2. `AGENTS.md`（所有权边界）
3. `docs/developer-a/CONTRACTS.md`（B 端应消费的真实公开形状）
