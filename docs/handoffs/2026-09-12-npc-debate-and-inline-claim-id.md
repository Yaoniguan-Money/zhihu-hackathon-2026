# NPC-DEBATE-AND-CLAIM-ID：NPC 互相辩论解锁 + 正文内联 claim 编号清洗 + 每局随机失真者

状态：`complete`
完成时间：`2026-09-12`
负责人：`agent（GLM-5.3-Flash）`

## 实际完成

> 本记录含三轮改动（同日）：第一轮解锁 NPC 互辩与 claim 编号清洗；第二轮（用户实测反馈后）增加每局随机失真者、表演/回应要求，并完成真实部署；第三轮（用户实测反馈"你不认可谁的观点回答不出来"）允许解释层分歧并强制点名表态。
- NPC 拒绝评价其他参与者的根因修复：role 生成 system prompt 原先把"每句话必须由可见事实直接支持、没有支持的事实就不要说"作为硬约束，且从未提及可以讨论其他参与者，模型因此把"评价他人观点"视为无事实支持而拒答。现已在 system prompt 增加互动要求：明确允许赞同、反驳、追问、质疑近期对话中其他参与者的观点，也可回应玩家要求其评价某人发言的要求；表态须以可见事实为依据、只针对观点不针对个人、不虚构他人未说内容。同时在 user prompt 的"近期对话"块后追加了同样的提醒。
- Validator 校准：validator system prompt 新增一条判定校准——对其他参与者发言的表态性内容本身不算新实体/新事实，只有表态背后的实质性断言超出可见事实时才标 `unsupported_spans`，避免互辩内容被误判为引入新事实而触发重写。
- 历史发言显示名化：审讯回合上下文中历史消息的说话人此前用内部 `role_id`（如 `role-2`）呈现，模型无法自然点名对方；现改为用案件公开角色表解析 `display_name`（找不到时回退 role_id），模型可直接点名互辩。
- `[CL-xxx]` 前端泄漏根因修复：user prompt 把 `cl-010: 命题` 清单喂给模型，模型偶发把编号抄进正文，发布链路此前无任何清洗。现于 `runGenerationAttempts` 候选解析后、送 validator 前调用新增的 `stripInlineClaimIds` 纯函数剥离正文中的内联编号（各种括号包裹 + 裸编号 + 遗留空括号/标点清理），保证 validator 看到的文本与最终发布的 `exact_text` 一致（`unsupported_spans` 偏移不漂移）。剥空（除编号外无实义）按语义失败带反馈重写，消耗 10 次候选上限，不新增加恢复类型。
- 该清洗位于引擎层单一路径，审讯回合、对质回合、开场陈述与篡改角色全部覆盖。
- 新增 3 个定向测试（纯函数剥离、候选含 `[CL-004]` 端到端剥离、仅编号候选触发反馈重写）。
- 【第二轮】每局随机失真者（用户 2026-09-12 决定"每次游玩篡改者都不是固定的"）：`compileCaseFromCandidates` 新增可选 `pickDistorterIndex`，生产调用方（`compileCaseWorker`）传入均匀随机下标；与编译器指定下标不同时交换两个位置的**人设**（display_name/public_bio/persona_key），篡改计划（可见集、获准方式、goal、答案、解锁规则、rubric）按位置原位保留，全部结构不变量不受影响；音色跟随人设原下标。测试不传该参数则保持编译器指定（确定性）。
- 【第二轮】表演要求（治"我的分析将严格依据给定事实，不妄加推断"这类出戏自我声明）：system prompt 禁止任何关于自身规则/指令/分析方法的说明与中途自我介绍。
- 【第二轮】回应要求（治答非所问）：system prompt 要求先对准玩家问题指向——问题问到谁就先引用近期对话中该参与者的具体说法再表态，禁止无视问题的通稿式陈述。
- 【第二轮】真实部署：发现运行中的独立 `convex-local-backend.exe`（PID 21952，2026-08-25 版）未含新代码——`npx convex dev --once` 拒绝在端口被占时推送，这就是用户截图里 `[cl-011]` 仍在出现的原因。按既有流程停掉旧后端 → `npx convex dev --once` 推送成功（后端升级至 precompiled-2026-09-11-157eb19，13:59:16 functions ready）→ 以既有 bash 流程同款参数从 `.convex/local/default/config.json` 读密钥重启独立后端（数据文件 `.convex/local/default/convex_local_backend.sqlite3` 未动）。已验证 3210 监听、`http://localhost:3000` 返回 200。
- 【第三轮】"你不认可谁的观点？"答不出的根因修复：原互动要求规定"反驳时指出对方哪一点与可见事实不符"，而场上忠实角色的发言本就与事实一致，被问"你不认可谁的观点"时模型找不到任何"与事实不符"的对象、又禁止虚构，只能空泛回避（或反复重写耗尽候选）。现拆成两条：(1) 分歧可以是解释层的——对方的话与事实冲突时指出冲突点，对方只是强调方式/取舍/程度与你的理解不同时，说出你基于可见事实的读法即可，不必证明对方"造假"，观点分歧本身不是新事实；(2) 玩家要求评价/比较/点名"你不认可谁的观点"时，必须从近期对话中点名一位参与者、先引用其具体说法再给基于可见事实的理由，不得空泛回避；没有明显不认可对象时选读法差异最大的一位并说明差异。原"只针对观点本身，不评价发言者个人"约束保留在解释层表态的语境中不再单列一行（并入第一条的"指出冲突点/说出读法"表述，仍针对观点不针对个人）。

## 明确未完成

- 无。注意：prompt 行为改动需真实对局验证效果（模型是否稳定参与互辩），见"已知风险"。

## 修改文件

- `server/model/schemas/role-turn.ts` — role system/user prompt 增加互辩互动要求、表演要求（禁自我声明/中途自我介绍）、回应要求（对准问题指向）与"编号不进正文"；validator system prompt 增加表态性内容校准。
- `server/turn-engine/run-turn.ts` — 新增导出纯函数 `stripInlineClaimIds` 与 `INLINE_ID_FEEDBACK`；候选解析后清洗 speech，剥空走语义重写。
- `server/cases/compile-case.ts` — `compileCaseFromCandidates` 新增可选 `pickDistorterIndex`：随机选中下标与编译器指定下标交换人设（音色跟随人设），越界抛 `CaseInvariantFailure`。
- `convex/roleTurns.ts` — `turnContextInternal` 历史消息说话人改用 `display_name`（提前解析 casePublic，抽 `roleDisplayName` 供历史与 displayName 复用）。
- `convex/cases.ts` — `compileCaseWorker` 传入 `pickDistorterIndex: Math.floor(Math.random()*roleCount)` 启用每局随机失真者。
- `tests/tb5-tb6-engine.test.ts` — 新增 "Public Projection 卫生：正文内联 claim 编号剥离" describe，3 个测试。
- `tests/tb2-compile.test.ts` — 新增随机失真者 2 个测试（固定随机源验证交换与不变量、越界失败）。
- `tests/p11-engine.test.ts` — 【第三轮】新增 "system prompt 要求点名回应表态类问题且允许解释层分歧" 定向断言。

## 权威文档更新

无规范变更。公开契约（contracts/ 运行时 schema）、错误语义与恢复策略均未改变：剥离属于"浏览器只接收 Public Projection"不变量的服务端执行，剥空走的是既有已批准的语义重写恢复（10 次候选）。

## 定向验证

- `bun test tests/tb5-tb6-engine.test.ts tests/p11-engine.test.ts` — 通过（24 pass / 0 fail，含新增 3 项）。
- `bun test tests/tb2-compile.test.ts tests/tb5-tb6-engine.test.ts tests/p11-engine.test.ts` — 通过（35 pass / 0 fail，含随机失真者 2 项）。
- `bun run typecheck` — 通过（tsc --noEmit 无错误，两轮各跑一次）。
- `npx convex dev --once` — 通过（"Convex functions ready!"，2026-09-11 版后端，13:59:16）。
- `Invoke-WebRequest http://localhost:3000` — 200；3210 由 convex-local-backend（PID 53920）监听。
- 【第三轮】`bun run typecheck` + `bun test tests/p11-engine.test.ts` — 通过（9 pass / 0 fail，含新增点名表态断言）；停旧后端（PID 53920）→ `npx convex dev --once` 推送成功（14:13:06 functions ready）→ 从 `.convex/local/default/config.json` 读密钥重启后端（precompiled-2026-09-11-157eb19，3210 监听）；`http://localhost:3000` 200。

## 已知风险、阻塞与下一步

- prompt 层的互辩意愿/表演/回应要求需真实对局 smoke 验证：开局后点名"你回答下某角色的看法"，预期 NPC 先引用对方具体说法再表态；问"你不认可谁的观点"预期点名一位参与者并给基于可见事实的理由，不再空泛回避；正文不应再出现任何 `cl-xxx` 字样或"我将严格依据给定事实"式自我声明。
- 随机失真者的目标是编译器为"原失真者"写的（distorted_goal 文案泛用）；换人后 goal 与新人设的贴合度可能略降，属私有文案，不影响公开表现。若后续要更贴合，可让编译器输出多条候选 goal 或在交换后由服务器模板化重写。
- 本地后端是独立进程：**每次修改 convex/ 或 server/ 代码后必须重新推送**（停后端 → `npx convex dev --once` → 重启后端），否则前端仍跑旧逻辑（本次 `[cl-011]` 复现即此原因）。
- 下一步可选项：开场陈述目前是自我介绍式（互相看不到对方发言），如需开场阶段也互相交锋，需把五条开场改为串行携带已有开场历史（本次未动）。

## 最小接手阅读顺序

1. 根目录 `CONTEXT.md`（领域词汇）
2. `server/model/schemas/role-turn.ts`（prompt 事实来源）
3. `server/turn-engine/run-turn.ts`（生成-校验-重写循环与清洗插入点）
4. 本记录
