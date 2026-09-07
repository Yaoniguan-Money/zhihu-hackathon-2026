# 2026-09-08 · Round 1：判词玩家化 + 指控自动跳转揭底 + 首次全链路通关验证

- 状态：complete
- 完成时间：2026-09-08
- 负责人：AI 代理（持续迭代第 1 轮；桌面 `证据链狼人杀-迭代记录/01-第1轮-*.md`）

## 实际完成

1. **判词玩家化（P1）**：`app/game/reveal/page.tsx` 新增 `humanizeVerdict()`，渲染前把 `role-*`→角色名、`cl-xxx`→原文要点N、篡改枚举→中文名；判词与现实映射两处套用。只改展示文本不动数据。
2. **指控后自动进揭底（P2）**：`app/game/accusation/page.tsx` 在 phase==="revealed" 时 `router.replace("/game/reveal")`。
3. **第 4 局完整通关**：审讯→存证→指控成立（柳成荫+范围扩大+条件删除）→揭底→战绩卡（Lv.1·雾里看花）全链路验证通过，两处修复在真机生效。
4. **真实建案验证**：知乎“程序员失业”回答全文两次提交——markdown 版失败（SOURCE_SPAN_INVALID）、纯文本版成功（case-compilation-v1@2，约 7 分钟）。服务端验证 owner 可对自己案件 sessions:create 开局（briefing）。

## 规范变更

无（展示层替换与页面跳转，不触碰 contracts/服务端行为）。

## 验证

- `bun run typecheck` 通过。
- 浏览器端到端：揭底判词无内部 ID；提交指控后自动跳转揭底；战绩卡页正常生成。
- 未跑全量测试（按迭代指示）。

## 已知失败 / 风险 / 遗留（新发现，均未修）

- **P1 用户自编译案件无 UI 入口**：listPublic 仅出 system 案件；编译成功唯一入口是提交页自动跳转，错过即永久不可达。服务端 owner 开局已验证可用。→ 下轮在大厅加「我的案件」（additive 查询，不动 listPublic）。
- **P1 建案编译对 markdown 正文脆弱**：需入口净化文本或失败提示优化。
- **P1 评分极端化**：指控成立但证据分 0/审讯分 8（最小证据+单轮提问），rubric 待核对调平。
- P2：编译 ~7 分钟只有单行 spinner。

## 下一位 Agent 的最小阅读顺序

1. `app/game/reveal/page.tsx` 的 `humanizeVerdict`。
2. `app/game/accusation/page.tsx` 顶部 useEffect。
3. 桌面迭代记录 README 总账「P0 入口门屏盲等」与上面三条新 P1（下轮目标）。
