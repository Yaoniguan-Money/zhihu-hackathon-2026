# GC0 标注草案（DRAFT — 待 A/B 与用户确认后冻结）

状态：**草案**。本目录内所有文件均为提案，尚未冻结；确认通过后按“冻结流程”移出本目录并记录。

依据：`docs/developer-a/CONTRACTS.md` 第 3、4、6、10 节；`DEVELOPER_A_IMPLEMENTATION_PLAN.md` GC0 行；Canonical Source 为上级目录 `source.md`（sha256 `2b8556e8ac6e07e53b4695a35d1784be743904e89cc22be97b5339a4949516b4`，1,733 UTF-16 code units，33 段块）。

## 文件清单

| 文件 | 内容 |
|---|---|
| `build-and-verify.ts` | 构建+验证脚本：生成下列 JSON 并用 contracts zod schema、Span slice 校验、`assertPlayableCaseInvariants`、rubric 复算全部验证。 |
| `paragraphs.json` | 私有段落索引（33 块，均非 quote 段）。 |
| `case-public.json` | `CasePublic`：标题/摘要/theme 与五角色公开设定（开场固定顺序 = roles 数组顺序）。 |
| `case-private.json` | `CasePrivate`：Evidence Graph（23 claims / 22 relations）、5 条 Role Policy（4 faithful + 1 distorted）、golden answer、8 条 Evidence Catalog、8 条解锁规则。 |
| `rubric.json` | `evidence_score` 加权 criteria：40 + 35 + 25 = 100。 |
| `representative-fixtures.json` | 代表性 fixtures：两条开场（faithful entailed / distorted distorted）、忠实角色重写示例（attempt 0 被拒 → attempt 1 通过 + 批准信封）、Final Accusation、RevealResult（evidence_score 75 / questioning_score 62 / player_correct true）与 questioning_score 计分示例。 |

复验命令：`bun golden-case/case-demo-001/gc0-draft/build-and-verify.ts`

## 草案设计要点

- **Claim**：23 条，覆盖全部 33 段块中的 20 个（小节标题行、过渡句“我们必须清醒地认识到”与口号式短句未单独成 Claim，理由见下方待确认项）。每条 excerpt 在指定段块内唯一，Span 由脚本定位并通过 `text === slice` 校验。
- **篡改设计**：distorted 角色为 `role-skeptic`（柳成荫），答案类型 `scope_expand` + `condition_delete`，与允许集合相同（避免“允许但未使用”造成的判定歧义）。代表性开场同时呈现两处篡改，不引入任何原文之外的事实。
- **忠实重写示例**：工程师角色被追问“AI 会淘汰所有程序员吗”，第 0 次候选越界（scope_expand）被拒，第 1 次重写 entailed 并批准——覆盖 7.1 的重写路径（1 次即通过，未耗尽）。
- **Evidence**：8 条静态条目，均来自来源文本；`conflicts_with` 全部为空（来源为单篇立场文章，静态目录内无真实互斥对；对质类矛盾属 P1 动态 Recording Evidence，不在 GC0 静态目录内）。
- **解锁规则**：审讯 role-observer 解锁数据类证据；role-analyst / role-engineer / role-skeptic 的 approved 消息解锁第一波相关证据；role-engineer / role-professor 解锁失业性质与核心论断证据。
- **voice_id**：`voice-zh-01` 至 `voice-zh-05` 为稳定占位槽位名；真实音色在 P1-2 经 A/B 试听后映射，GC0 只冻结槽位。

## 确认清单（冻结前须逐项确认）

1. `source.md` 是否仍与知乎原页一致（冻结后再改需重算哈希并重建全部 Span）。
2. 23 条 Claim 的取舍与 proposition 措辞是否接受；未成 Claim 的 13 个段块（小节标题、过渡句等）是否需要补齐。
3. 22 条 Relation 的类型标注（尤其 `rel-015`“岗位清洗→后备军膨胀”与 `rel-016`“后备军膨胀→支付能力下跌”的 causal 划分）。
4. 五角色公开设定的命名、口吻；公开 bio 是否有暗示 Fidelity 之嫌。
5. `role-skeptic` 的可见 Claim 集合与允许/答案篡改类型。
6. Evidence Catalog 条目与解锁规则的“哪些角色可触发解锁”分配。
7. rubric 三项权重（40/35/25）与计分规则表述。
8. 代表性 fixtures 的台词文案（尤其 distorted 开场与重写示例）。
9. `voice_id` 占位槽位命名。

## 冻结流程（确认后执行）

1. 将五个 JSON 与脚本移出 `gc0-draft/` 至 `golden-case/case-demo-001/`（脚本路径同步更新）。
2. 重跑 `build-and-verify.ts` 确认全绿。
3. 更新 `DEVELOPER_A_IMPLEMENTATION_PLAN.md` GC0 → COMPLETE、本 README 状态、handoff 状态与索引。
