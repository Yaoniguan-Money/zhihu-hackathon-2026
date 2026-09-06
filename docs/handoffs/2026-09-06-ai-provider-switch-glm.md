# AI 供应商切换：DeepSeek → 智谱 GLM（glm-4.7-flash）

状态：`complete`（配置切换与两端验证完成；P1-3 全链重跑另见夜间中继）  
完成时间：`2026-09-06`  
负责人：`开发人员 A / ZCode`

## 用户明确决定

2026-09-06 夜间用户指示：AI 分析更换为用户提供的智谱 API（Key 本人不入库、不入文档），如需调用模型则使用 `glm-4.7-flash`。五个任务（claim/case/role/validator/reveal）统一配置该模型。

## 实际完成

- **本地配置**：gitignored `.env.local` 八项 `AI_*` 切换为 `AI_PROVIDER_NAME=zhipu`、`AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4`、五个 `AI_*_MODEL=glm-4.7-flash`；`AI_API_KEY` 为用户提供的智谱键（只存本地环境与 Convex env，不入仓库/文档/handoff）。
- **生产配置**：`CONVEX_DEPLOYMENT=prod:agile-turtle-860` 下八项 `AI_*` 全部 `convex env set --prod` 更新并回读验证（生产原为 DeepSeek 配置）。
- **真实供应商 smoke**：`bun scripts/model-smoke.ts` 通过——`generateObject` 结构化输出正常返回（provider=zhipu，task=claim，约 49.7s；该模型为 reasoning 模型，AI SDK 对 zhipu.chat 的 responseFormat 警告不影响 JSON 解析回退路径）。
- **生产数据面冒烟**：切换后 `auth:signIn`（anonymous）与 `cases:listPublic`（返回 case-demo-001）经 CLI 验证正常。
- **新发现（重要运维事实）**：`glm-4.7-flash` 免费档存在时段性过载——智谱错误码 `1305「该模型当前访问量过大」`会以约 0.25s 快速失败返回，或已接受请求在队列中挂起 10-15 分钟后失败。网关 `maxRetries: 0` 行为符合规范（显式 typed failure，无隐藏重试）；01:48 起探测恢复。使用方（REL1 验收、用户建案）需知晓此时段波动。

## 明确未完成

- P1-3 全链闭环在切换后尚未跑通（第一次重跑遇供应商过载时段；恢复后重跑结果见夜间中继记录）。
- `tests/p13-second-case.test.ts` 的观察窗预算按新供应商延迟特征重校准（编译等待 480s→1200s、五条开场 600s→1500s、单回合 240s→600s、文件预算 25min→90min）；**断言与产品行为零变化**（server 侧 compile lease 15min / turn lease 10min 未动）。

## 修改文件

- `.env.local` — 八项 `AI_*` 切换（gitignored，不入库）。
- `tests/p13-second-case.test.ts` — 仅测试观察窗预算重校准（见上）。
- 生产部署 `agile-turtle-860` 的 Convex env（非仓库文件）。

## 权威文档更新

- 无规范变更（Model Gateway 显式配置机制不变，仅配置值变更；模型输入/输出 schema 零变化）。

## 定向验证

- `bun scripts/model-smoke.ts` — 通过（结构化输出 verdict=pass）。
- `bunx convex env list --prod | grep ^AI_` — 八项全部为智谱配置。
- `bunx convex run auth:signIn '{"provider":"anonymous"}' --prod` — 成功签发 JWT。
- `bunx convex run cases:listPublic --prod` — 返回 case-demo-001。
- `bun test`（全套件）— 135 pass / 0 fail / 11 skip（Scripted 路径不受供应商影响）。
- `bun run typecheck` — 通过。

## 已知风险、阻塞与下一步

- 风险：免费档 `glm-4.7-flash` 时段性 1305 过载（快速失败或长挂起）；durable 票据 lease（compile 15min / turn 10min）在过载时段可能不够单次调用完成，过期即显式失败（符合「不自动重调」规范）。
- 下一步：①恢复期重跑 `RUN_MODEL_INTEGRATION=1 bun test tests/p13-second-case.test.ts` 收口 P1-3；②REL1 的本地完整对局验收（`tb9-model`、`p11-model` 口径）可在同一供应商配置下执行。

## 最小接手阅读顺序

1. 本记录
2. `server/model-gateway/config.ts`（八项显式配置机制）
3. `docs/handoffs/2026-09-05-ai-config-deepseek-smoke.md`（前次供应商基线）

## 追加（10:30）：过夜重试结论与新失败模式

- 探测门控循环 14 轮跑完未收口 P1-3。后 9 轮中 6 轮探测健康（13-76s），claim 调用可正常完成（141-428s），但编译转为稳定失败于 `SOURCE_SPAN_INVALID`——**glm-4.7-flash 的摘录是改写/压缩式编造而非逐字复制**（诊断：31/51 摘录连 4 字符前缀都无法在声称段块中命中；标题段块被编造正文；relations 下标 2/37 越界）。
- **claim-extraction prompt 升级 `v1@2 → v1@3`**（`server/model/schemas/claim-extraction.ts`，9.3 机制内 prompt 层修订）：「逐字符复制、禁止改写压缩归纳、宁可少抽、无法逐字就放弃、标题段块只摘标题、relations 下标越界禁止」。同diag复现：摘录失配 31/51 → 4/46（61%→8.7%），relations 越界归零。
- 但服务端 Span 校验为全有全无（任一摘录失配即整个编译显式失败，这是反编造的既定不变量，不放宽），按 0.913^46 推算单次编译通过率 ≈1.5%，3 次全新尝试仍不可行。**结论：glm-4.7-flash 不满足长文（3.5k 字/84 段）逐字抽取契约，属模型能力边界，非工程缺陷。**
- 影响面澄清：完整游玩链（开场/审讯/对质/指控/Reveal）使用预种金案件，**不经过 claim 抽取**，不受此阻塞影响（TB9 在 GLM 上的验证另行记录）。仅「用户建案编译」依赖抽取。
- 待用户决策的选项：① claim 任务单独配置更强模型（需用户改八项 AI_* 中的 AI_CLAIM_MODEL 决定）；② 保持 glm-4.7-flash 并接受 P1-3 建案链阻塞（游玩链不受影响）；③ 换回其他供应商。
