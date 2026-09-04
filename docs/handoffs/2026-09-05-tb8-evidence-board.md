# TB8：Evidence 与 Board（getAll / updateBoard / Board CAS）

状态：`complete`  
完成时间：`2026-09-05`  
负责人：`开发人员 A / ZCode`

## 实际完成

- **evidence.getAll**（query，`convex/evidence.ts`）：auth → 不存在/越权返回安全空数组（CONTRACTS 4.3）；只投影当前 Session `session_evidence_unlocked` 的条目，从 `case_private` Catalog 以 `evidenceFragmentPublicSchema` 在服务端独立构造公开 Fragment（type/title/body/public_claim_refs/conflicts_with/unlocked_at），不返回私有 Catalog 对象；按 `unlocked_at_ms + evidence_id` 稳定排序；悬空解锁引用判 `INTERNAL_INCIDENT`。
- **evidence.updateBoard**（mutation）：输入 schema（含 `client_action_id` UUID，strictObject 拒绝未知字段/越界坐标/非法 lane/自连 link）→ payload 哈希（canonical JSON，`client_action_id` 不入哈希）→ 幂等命中先于阶段校验（同键同哈希返回首次 BoardState；异键同 ID `IDEMPOTENCY_CONFLICT`）→ `SESSION_NOT_FOUND`（不存在=越权）→ 仅 investigation（`SESSION_PHASE_CONFLICT`）→ **CAS：`expected_revision` 不匹配先于内容约束返回 `BOARD_REVISION_CONFLICT`** → Board 规则：每 Evidence 最多一个 placement（重复 `INVALID_ARGUMENT`）、placement/link 端点必须已解锁（含跨 Session ID，`EVIDENCE_UNAVAILABLE`）、link 两端必须已放置（`EVIDENCE_UNAVAILABLE`）、`link_id` 唯一（`INVALID_ARGUMENT`）→ revision+1 全量替换持久化 + `board_updated` 公开事件 + 幂等记录。
- **SessionView 契约补全**（`convex/sessions.ts` getPublic）：`allowed_actions` 按资源前置条件动态计算（CONTRACTS 7.1）——investigation 恒开放 `ask`，`update_board`/`accuse` 需至少一条已解锁 Evidence；`active_role_turn_request_id` 在存在 accepted/working Ticket 时返回其 request_id（此前从未计算，本环节补齐）。
- **测试辅助**：`admin:seedUnlockedEvidence`（直接写入解锁状态，生产解锁只能由服务器 Unlock Rule 计算，见 roleTurns.computeUnlocksInternal）。
- **canonicalJson 补齐数字支持**（`server/cases/idempotency.ts`）：原实现只覆盖 TB1 全字符串载荷；按 CONTRACTS 12 的 RFC 8785 要求补 number 分支（ES6 Number::toString 序列化，-0→"0"，非有限数字失败）。字符串/布尔/数组/对象行为不变，TB1 既有测试全部保持通过。

## 明确未完成

- TB2b（用户案件完整编译器）、TB10（P0 全链证明）未开始。
- `evidence.saveRecording` 属 P1-1，未实现（P0 恒不开放）。

## 修改文件

- `convex/evidence.ts` — 新增：getAll/updateBoard。
- `convex/sessions.ts` — getPublic 动态 allowed_actions + active_role_turn_request_id。
- `convex/admin.ts` — 新增 seedUnlockedEvidence 测试辅助。
- `server/cases/idempotency.ts` — canonicalJson 补齐 RFC 8785 数字序列化。
- `tests/tb8-evidence.test.ts` — 新增：7 项集成测试（Red→Green）。
- `tests/tb7-model.test.ts` — allowed_actions 断言对齐 CONTRACTS 7.1 动态门控（按 evidence:getAll 实际解锁数推导期望），并断言开场终态后无活动 Ticket。

## 权威文档更新

- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — TB8 → COMPLETE。除此之外无规范变更：canonicalJson 数字支持是实现向 CONTRACTS 12（RFC 8785）的既有要求对齐，非契约变更。

## 定向验证

- `bun test tests/tb8-evidence.test.ts` — 7 pass / 0 fail：AUTH_REQUIRED、安全空数组、投影与泄漏扫描（无 fidelity/visible_claim_ids/support_claim_ids）、UUID/lane/坐标/自连/重复 placement 拒绝、SESSION_NOT_FOUND/越权/阶段门控、CAS 版本冲突先于内容校验、未解锁/未放置 link 的 EVIDENCE_UNAVAILABLE、成功全量替换 rev0→1→2、board_updated 事件序列、动态 allowed_actions、幂等重放同 BoardState、同 ID 异载荷 IDEMPOTENCY_CONFLICT、active_role_turn_request_id。
- `bun test` 全套 — 96 pass / 0 fail / 4 skip（模型测试显式 opt-in）。
- `bun run typecheck` — 通过。

## 已知风险、阻塞与下一步

- CAS 与内容约束的检查顺序（先 revision 后证据）契约未钉死；本实现选择“基线过期时内容无关紧要”，已在测试中固化。
- `ask` 在活动 Ticket 期间仍出现在 allowed_actions（BUSY 由运行时返回）；契约只要求资源前置条件门控，不要求按锁状态隐藏。
- 下一步：TB2b（用户案件完整编译器）→ TB10（P0 全链证明 + 发布 Gate 完整套件与真实供应商 smoke）。

## 最小接手阅读顺序

1. 本记录
2. `docs/developer-a/CONTRACTS.md` 第 6 / 7.1 / 12 节
3. `convex/evidence.ts`、`convex/sessions.ts`
4. `tests/tb8-evidence.test.ts`
