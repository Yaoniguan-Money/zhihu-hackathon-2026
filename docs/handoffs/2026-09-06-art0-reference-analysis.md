# ART0：Blender 参考资产读取与制作基准

状态：`complete`  
完成时间：`2026-09-06`  
负责人：`Codex / 3D Character + Environment Artist`

## 实际完成

- 完整读取用户 Blender 制作要求，逐张查看 5 单体、5 四视图和 1 场景图；在资产方向文档中记录每张图的比例、发型、服装、材质、配件及场景布局。
- 原图哈希与解码检查，20 张派生四向参考裁切，原图未改。
- 确认 `D:/blender.exe` 为 Blender 5.2.1 LTS，实际背景启动并保存带 Image Empty 的 Blender 工程。

## 明确未完成

- 本环节仅涵盖参考分析与环境确认，不代表任何角色或场景最终验收。

## 修改文件

- `docs/art/ASSET_DIRECTION.md` — 参考分析与资产制作依据。
- `art/blender/USER_BRIEF.txt` — 本次用户完整制作要求存档。
- `art/blender/reference-manifest.json` — 11 原始参考的 SHA256、尺寸与可解码结果。
- `art/blender/references/` — 从四视图派生的 Front/ThreeQuarter/Side/Back。
- `art/blender/scripts/prepare_references.py` — 可重现参考派生与校验。

## 权威文档更新

- 新增 `docs/art/ASSET_DIRECTION.md`，记录本次用户指定艺术资产范围。
- 无规范变更：游戏公开契约、领域语言、A 侧工程规格与 ADR 未改变。

## 定向验证

- `python art/blender/scripts/prepare_references.py` — 通过：11 张图片成功解码并计算哈希。
- `D:/blender.exe --background --factory-startup ...` — 通过：Blender 5.2.1 LTS 实际执行 `bpy` 并保存工程。
- `bun run typecheck` — 通过。
- Standards Review：路径在项目 art 目录内，原图未改，未触碰原有前端与公开契约。
- Spec Review：参考读取先于建模；保留用户要求和逐图分析，无遗漏参考。

## 已知风险、阻塞与下一步

- AI 四视图并非严格正交，按用户指定优先级合理化。
- 继续依照沈→纪→阿岚→何→柳→场景顺序制作，角色视觉和动作验收分别记录。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `art/blender/USER_BRIEF.txt`
3. `docs/art/ASSET_DIRECTION.md`
4. 本记录
