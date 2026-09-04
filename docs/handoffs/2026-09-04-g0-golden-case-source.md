# G0：Golden Case 源输入

状态：`complete`  
完成时间：`2026-09-04`  
负责人：`开发人员 A / ZCode`

## 实际完成

- 用户在会话中提供 G0 输入：真实知乎 URL `https://zhuanlan.zhihu.com/p/2020194970120790951`（标题：互联网裁员潮拉开了“AI吃人”的帷幕，红歌会网专栏，作者子午），并指示继续任务。
- 完整正文获取路径（如实记录）：先读项目级 `zhihu` SKILL.md；CLI `version`/`capabilities` 无副作用检查确认 0.5.0 能力清单不含“按 URL 读取文章全文”命令，官方开放平台 HTTP API 亦无文章内容端点（搜索接口只返回摘要，按规则不可用作正文）。随后对用户提供的精确 URL 做渲染抓取，取得发布正文。
- 完整性核验通过：标题与页面 description 开头逐字一致；正文含全部四个编号小节，以结论句收束；共 33 个非空段块、1,733 个 UTF-16 code units（远低于 30,000 上限）。
- 冻结 Golden Case 源输入：
  - `golden-case/case-demo-001/source.md` — Canonical Source 冻结文本（content_sha256 = `sha256:2b8556e8ac6e07e53b4695a35d1784be743904e89cc22be97b5339a4949516b4`，对文件 UTF-8 字节计算）。
  - `golden-case/case-demo-001/source-metadata.json` — 来源 URL、标题、作者、发布时间、获取方式、哈希、两处最小规范化说明（移除图片嵌入行与加粗渲染标记字符；其余逐字保留）。
- 本机已配置的知乎 Access Secret 未被消耗：本轮未调用任何业务接口（无搜索/直答调用）；`auth status --verify` 与 `me contents` 最小验收继续顺延至首次真实业务调用。
- OFFICIAL_RESOURCES.md 使用约束补充 CLI/HTTP API 无文章全文端点的事实，避免后续 Agent 重走弯路。

## 明确未完成

- GC0 标注未开始（现 READY）：claims、relations、roles、policies、Evidence Catalog、truth、评分 rubric、代表性候选与全部 fixture 待 A/B 共同冻结。
- 建议用户对照知乎原页抽查 `source.md`；GC0 冻结前如需修正，将替换文件并重算哈希（尚未产生任何 span，替换零成本）。
- G1 第二案件输入仍 BLOCKED。

## 修改文件

- `golden-case/case-demo-001/source.md` — 新增，冻结正文。
- `golden-case/case-demo-001/source-metadata.json` — 新增，来源与哈希元数据。
- `DEVELOPER_A_IMPLEMENTATION_PLAN.md` — G0 COMPLETE、GC0 READY（第 2、5 节），现场事实段同步。
- `docs/developer-a/OFFICIAL_RESOURCES.md` — 使用约束补充文章全文获取路径事实。
- `docs/handoffs/README.md` — 索引新增本记录。
- 本记录。

## 权威文档更新

- `docs/developer-a/OFFICIAL_RESOURCES.md` — 第 4 节新增一条可验证资源事实；无契约/接口变更。

## 定向验证

- `zhihu-cli capabilities` — 0.5.0，无文章全文命令（决定获取路径的依据）。
- 渲染抓取返回正文与用户提供的标题、专栏名一致；og:description 与正文开头逐字一致。
- `sha256sum golden-case/case-demo-001/source.md` — `2b8556e8ac6e07e53b4695a35d1784be743904e89cc22be97b5339a4949516b4`。
- Node 读回统计 — `utf16_code_units=1733`、`paragraph_blocks=33`、结尾为结论句且文件以单换行结束。

## 已知风险、阻塞与下一步

- 抓取文本与知乎页面如存在细微差异（如全/半角、表情、编辑更新），在 GC0 冻结前修正成本为零；冻结后修正需重算哈希并重建 span。
- 下一步：GC0 标注（A 起草 claims/relations/roles/policies/catalog/truth/rubric/fixture 草案 → B/用户共同确认冻结）；PF1（契约入口、runtime schema、Auth、模型 Seam）与其并行推进。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `docs/developer-a/CONTRACTS.md` 第 3 节（Canonical Source 与 Span 规则）
3. `golden-case/case-demo-001/source-metadata.json`
4. 本记录
