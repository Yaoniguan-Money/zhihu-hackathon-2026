# ART-CHR-liu-chengyin：LiuChengyin Blender 角色资产

状态：`complete`  
完成时间：`2026-09-06`  
负责人：`Codex / 3D Character Artist`

## 实际完成

- Reference Setup、Blockout、Face、Hair、Clothing、Accessories、Rig 均有实际 Blender 阶段文件。
- 当前工程：`art/blender/characters/liu-chengyin/v012_rigged.blend`；GLB：`art/blender/exports/liu-chengyin.glb`。
- 实测 78176 triangles、137 个独立网格、28 骨骼、9 段动作。
- 五向渲染及六种动作极值渲染已解码核验。视觉观察：五向与参考同角色：葡萄紫波浪卷发（发束脊线正弦波修复后读作卷发）、棕色斜戴贝雷帽带帽梗、芥末黄风衣、深棕内搭长裤、棕金格围巾带流苏、褐色挎包、金圆耳环、左手笔记本钢笔；卷发体积为五人最宽，轮廓辨识度良好；动作极值六项均有效。

## 明确未完成

- 未替换现有游戏页面中的程序化人物；前端 B 可消费本次 GLB。
- 未进行移动真机帧率压测；不声称已经完成全项目发布验收。

## 修改文件

- `art/blender/characters/liu-chengyin/` — 阶段工程、指标与检查记录。
- `art/blender/exports/liu-chengyin.*` — GLB 与实际结构/Three.js 检查结果。
- `art/blender/renders/liu-chengyin/` — 四向 Blockout、五向成品、六个动作极值。
- `art/blender/scripts/` — 共享实际 Blender 制作、绑定、导出与定向检查工具。
- `art/blender/DELIVERY.md` — 资产使用和制作说明。

## 权威文档更新

- `docs/art/ASSET_DIRECTION.md` 与 `art/blender/DELIVERY.md` 为本次艺术制作依据和交付说明。
- 无规范变更：CONTRACTS、ENGINEERING_SPEC、ADR、A 侧实施顺序和公开游戏数据未修改。

## 定向验证

- `python art/blender/scripts/inspect_glb.py art/blender/exports/liu-chengyin.glb` — 通过：GLB 容器、内嵌资源、UV、骨骼、动画/morph 通道、三角面预算。
- `node art/blender/scripts/verify_three.mjs art/blender/exports/liu-chengyin.glb` — 通过：实际 GLTFLoader 解析、AnimationMixer 播放、有限数值、归一化权重、口型/眨眼与头部动作。
- `pose_qa.py` — 实际 Blender 动作极值渲染，结果见 review.json。
- `bun run typecheck` — 共享制作阶段运行通过，未改 TS 调用方。
- Standards Review：可读命名、版本保留、原始参考未改；制作与游戏业务隔离。
- Spec Review：独立眼球、衣装、关键配件、统一骨骼和指定视角落实；发丝与织物采用实时卡通概括。

## 已知风险、阻塞与下一步

- GLB 使用骨骼与 morph 混合，前端停止动作时需复位权重；多实例用 SkeletonUtils.clone。
- 接入前端前按公开角色映射选择资产，不把模型节点或装饰内容当作案件数据。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `art/blender/USER_BRIEF.txt`
3. `docs/art/ASSET_DIRECTION.md`
4. `art/blender/DELIVERY.md`
5. `art/blender/characters/liu-chengyin/review.json`
