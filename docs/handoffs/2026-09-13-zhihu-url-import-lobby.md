# ZHIHU-URL-IMPORT-LOBBY：大厅「读取正文」接线

状态：`complete`  
完成时间：`2026-09-13`  
负责人：`agent`

## 实际完成

- 远程 PR #1 将 `feat/zhihu-url-import` 合入 `main`（merge commit `f76d17d`）：新增 `server/source/zhihu-import.ts`、`POST /api/zhihu/import`、importer 单测。
- 本地 fast-forward 到该 `main` 后接线大厅 `CustomCaseForm`：URL 旁「读取正文」只把公开知乎页填进可编辑 textarea，玩家核对后仍走既有 `cases.createFromSource({ source_url, source_text, invite_code })`。
- importer 私有失败码映射到已有公开错误码，不扩契约：`INVALID_ZHIHU_URL` → `INVALID_ARGUMENT`；`ZHIHU_FETCH_FAILED` → `SERVICE_UNAVAILABLE`；`ZHIHU_CONTENT_*` → `SOURCE_INVALID`；`ZHIHU_RESPONSE_TOO_LARGE` → `SOURCE_TOO_LONG`。空结果不当成功。
- 读取失败显式报错，手贴路径保留；编译门控不变（仍须 HTTPS URL + 非空正文 + 邀请码）。

## 明确未完成

- 未做真实知乎页 live fetch 验收（单测用 scripted fetcher）。
- `bun run typecheck` 仍有 main 既有失败：`server/model-gateway/openai-compatible-gateway.ts` 的 `tool({ schema })` 与当前 `ai` SDK 类型不匹配；本环节未改网关。

## 修改文件

- `app/page.tsx` — 大厅「读取正文」按钮、填入核对提示、失败不关手贴。
- `app/api/zhihu/import/route.ts` — 失败体改为公开错误码。
- `server/source/zhihu-import.ts` — `toPublicZhihuImportError`。
- `tests/zhihu-import.test.ts` — 公开码映射；fetcher 转型。
- `lib/convex-errors.ts` — `SOURCE_INVALID` / `SOURCE_TOO_LONG` / `INVALID_ARGUMENT` 提示；`SERVICE_UNAVAILABLE` 覆盖读取失败。
- `README.md`、`AGENTS.md` — 澄清编译不抓取、大厅助手可填表。
- `docs/handoffs/README.md`、本记录。

## 权威文档更新

- `AGENTS.md` — 不变量补一句：大厅「读取正文」只填表，不能 URL-only 建案。
- `README.md` — 同上口径。

无规范变更：`contracts/` 公开 schema / 错误枚举未改；ADR 0002 仍约束 `createFromSource` 必须同时收到 URL 与完整正文。

## 定向验证

- `bun test tests/zhihu-import.test.ts` — 9 pass / 0 fail。
- `bun run typecheck` — 仅余既有 `openai-compatible-gateway.ts:141`；importer / 大厅改动无新错误。

## 已知风险、阻塞与下一步

- 知乎 401/403/429 时 importer 会走 `r.jina.ai`；该路径失败必须显式报错，不得当成功。
- 热榜/搜索仍只 `prefill_url`，不会自动读取；玩家需点「读取正文」或手贴。
- 下一步：浏览器打开大厅，贴专栏/回答 URL 点读取，核对 textarea 后再编译。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `docs/adr/0002-source-submission-requires-complete-text.md`
3. 本记录
4. `app/page.tsx` 中 `CustomCaseForm`
5. `server/source/zhihu-import.ts`
