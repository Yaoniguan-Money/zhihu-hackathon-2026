# TB9：Final Accusation 与 Reveal（P0 游戏主循环闭环）

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **game.accuse**（public action，`convex/game.ts` 包装 → `convex/reveal.ts` `accuseCore` internalAction）：auth/UUID → `initializeAccusation` 单事务（幂等命中先于阶段校验；Owner 隔离；仅 investigation；`finalAccusationSchema` 校验；Role 有效性 `ROLE_NOT_FOUND`；证据已解锁检查 `EVIDENCE_UNAVAILABLE`；服务器判定 `player_correct` + rubric 证据分 + questioning 分；进入 judging 瞬态 + `accusation_submitted` 事件）→ Reveal 解释模型调用（`reveal-v1@1`，候选须引用真实 Claim ID）→ `finalizeRevealed` 原子持久化完整 `RevealResult` + phase=revealed + `reveal_published` 事件。模型/协议失败 → `failRevealInternal`（phase=failed、terminal REVEAL_FAILED、`session_failed` 事件），同 ID 重放返回同一失败。
- **服务器确定项（CONTRACTS 10.1）**：`player_correct`（Role 相同且篡改类型集合完全相同）；`evidence_score`（rubric 整数权重 criteria：类型允许 + Claim 命中，每项至多一次）；`questioning_score`（不同 Role 首问 8×n ≤40；同 Role 追问 10×n ≤30；审讯新证据 10×n ≤30——解锁来源经 `session_evidence_unlocked.via_kind` 区分开场/审讯）；truth_chain（golden truth_claim_ids + claim 命题作 label，order 连续）；altered_links（来自成功 distorted 回合持久化的 validation 摘要，original=被引事实命题，非模型输出）。
- **Reveal 模型只产出**解释与 Reality Mapping 候选（引用校验失败即整体失败）。
- **game.getReveal**（query）：非 revealed 阶段返回 null；Owner 隔离；输出经 `revealResultSchema` 校验。
- **辅助持久化**：`role_turn_tickets.validation_json`（succeeded 回合的 Validator 摘要）、`session_evidence_unlocked.via_kind`。
- **真实模型完整闭环（DeepSeek，293s）**：五条开场 → 审讯 role-observer（Meta 数据）→ 解锁 ev-meta-quote → 正确指控 role-skeptic + [scope_expand, condition_delete] + ev-meta-quote → phase=revealed；Reveal 断言全过：player_correct=true、truth_chain 5 条连续、evidence_score=25、questioning_score ∈ {8,18}（取决于开场是否先行解锁——两种均符合契约公式）、explanation/reality_mapping 非空。

## 明确未完成

- TB8（evidence.getAll/updateBoard、Board CAS）未实现——accuse 不依赖 Board，主循环已闭合。
- TB2b（用户案件完整编译器）、TB10（P0 全链证明）未开始。

## 修改文件

- `convex/schema.ts`（reveals 表；validation_json/via_kind 列）
- `convex/reveal.ts`（新）、`convex/game.ts`（accuse/getReveal 公开入口）、`convex/roleTurns.ts`（validation 摘要与解锁来源）
- `server/model/schemas/reveal.ts`（新）
- `tests/tb9-accuse.test.ts`、`tests/tb9-model.test.ts`
- 本记录、索引、根计划。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — TB9 → COMPLETE。无契约变更。

## 定向验证

- `bun test tests/tb9-accuse.test.ts` — 2 pass：AUTH_REQUIRED/INVALID_ARGUMENT/SESSION_NOT_FOUND、阶段门控、EVIDENCE_UNAVAILABLE、getReveal 非 revealed 返回 null。
- `RUN_MODEL_INTEGRATION=1 bun test tests/tb9-model.test.ts` — **通过**（完整 golden 闭环 293s）。
- `bun test` 全套 — 89 pass / 0 fail / 4 skip；`bun run typecheck` 通过。

## 已知风险、阻塞与下一步

- 开场允许解锁证据（规则照常应用于 Approved Role Message）：若产品要求"开场不解锁"，属规则调整，待 A/B 决定。
- 完整闭环对模型耗时敏感：五条开场含重写可达 5-8 分钟；opt-in 测试时限已放宽至 960s。
- 校验器校准提示词（同义概括视为 entailed、条件/前瞻句保留情态即通过）已显著降低忠实回合误拒；若再现误拒，优先调提示词而非放宽 schema。
- 下一步：TB8（Board）→ TB2b（用户案件编译器）→ TB10（P0 全链证明 + 发布 Gate smoke）。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 10 节
3. `convex/reveal.ts`、`convex/game.ts`
4. `tests/tb9-model.test.ts`
