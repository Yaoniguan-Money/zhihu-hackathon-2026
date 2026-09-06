# ART-ENV-detective-room：夜间侦探事务所 Blender 场景资产

状态：`complete`
完成时间：`2026-09-07`
负责人：`Codex / 3D Environment Artist`

## 实际完成

- 新增 `art/blender/scripts/scene.py`，按 structure → dressed → final 三阶段在 Blender 5.2.1 LTS 中实际建模、布光、渲染、导出；阶段文件 `scene/v001…v015_*.blend` 递增保留（v007/v008/v009 为椅子摆放修复轮，v010/v011 为薄板倒角修复轮，v012/v013 为共面 Z-fighting 修复轮，v014/v015 为同类纸抖动轮）。
- 场景内容：7.4×5.8×3.3 m 房间（木拼地板、三层圆毯、三面墙+窗洞）、圆桌（r=1.5 m，桌面高 1.15 m，适配 2.4 m Q 版角色坐姿）、GM 高背拉扣皮椅+5 把绿垫木椅（半径 2.08 m 环形摆放、朝向圆心）、软木证据板（木框+17 纸张带文字条、8 照片带内芯、10 便签、2 地图卡、24 图钉、12 根红线，全部独立命名 `EV_*` 对象，可被前端逐项替换）、左墙书架（4 排书 60+ 册、纸盒、相框、地球仪、小台灯）、后墙挂钟、衣帽架（大衣+礼帽）、抽屉柜、右墙夜窗（窗框/中梃/夜幕/月亮/城市剪影/双波浪窗帘/铜杆）、窗台黑猫剪影、边柜+收音机+书叠、文件柜+绿罩银行灯、桌面吊灯（罩+内衬+灯泡+铜环+吊索）、桌面道具（大地图+区域块+折痕、4 马克杯、录音机、放大镜、笔筒+5 笔、3 笔记本、2 文件夹、纸叠、2 照片、铁盒）、3 组盆栽。集合结构 `ENVIRONMENT/{ENV_Room, ENV_Table, ENV_Chairs, ENV_EvidenceWall, ENV_Bookshelf, ENV_Window, ENV_Lighting, ENV_Props, ENV_Plants}`；渲染灯在 `RENDER_Lights_NotExported`（吊灯暖主光、月光冷辅光、银行灯绿光、书架灯暖光、正面填充、顶部环境），六机位在 `CAMERAS_NotExported`。
- GLB 实测 74,900 triangles、599 meshes、62 材质、全部网格带 UV（`inspect_glb.py` 强制项）；渲染灯与相机未导出；灯光关系为暖色桌面主光 + 冷蓝月光 + 绿罩灯/台灯点缀 + 低强度填充，中心桌为视觉焦点。
- 六机位渲染（FrontWide、LeftThreeQuarter、RightThreeQuarter、Topish、TableCloseup、EvidenceWallCloseup）与接触表 `renders/detective-room/`，逐张目检通过。
- `inspect_glb.py`（`detective-room` 分支：免骨骼/动画断言、强制 TEXCOORD、无外部资源、无相机/灯光/参考 Empty）与 `verify_three.mjs`（实际 GLTFLoader 解析、有限数值、包围盒）均通过；`exports/detective-room.validation.json`、`detective-room.three-validation.json`、`scene/metrics.json` 已落盘。

## 修复记录（对应阶段版本）

- 椅子各部件摆放时 z 被清零导致整体塌落 → 改为保留原 z 仅平移 x/y（v007）。
- 地图区域色块 4 mm 厚配 4 mm 倒角产生退化黑面 → 去倒角并随地图旋转对齐（v008）。
- 纸张 7 mm 薄板 4 mm 倒角边缘黑丝 → 倒角降为 2 mm（v010）。
- 证据板黑块根因定位：纸张/地图/照片/便签全部共面于 y=2.852，重叠区 Z-fighting 在 Cycles 中渲染为纯黑（从吊灯光源射线证实被相邻纸张自遮挡）→ 按类别错高（Paper 2.852 / Map 2.8495 / Photo 2.847 / Note 2.8445）+ 同类索引抖动，文字条/照片内芯/色块/图钉/红线相应前移（v012–v015）。
- 左右 3/4 机位最初在房间外被墙阻挡 → 移入室内角落（v011）。
- 放大镜镜片误直立如白蛋 → 平放为玻璃圆片（v008）；挂钟表盘被实心圆柱边框吞没 → 面盘前移露出（v004）。

## 明确未完成

- 场景未做 LOD/减面优化与绘制调用合并（599 网格对 R3F 可用但非最优）；未接入现有前端页面实测帧率。
- 证据板内容为无剧情装饰样式，未替换为任何案件真相数据（符合不变量）。
- 未做吊灯体积光/雨夜窗外动画等可选氛围效果。

## 修改文件

- `art/blender/scripts/scene.py` — 新增场景构建脚本（结构/陈设/灯光三阶段，含全部修复）。
- `art/blender/scene/` — 阶段工程与 `metrics.json`。
- `art/blender/exports/detective-room.*` — GLB 与双重验证结果。
- `art/blender/renders/detective-room/` — 六机位渲染与接触表。
- `art/blender/DELIVERY.md`、`docs/art/ASSET_DIRECTION.md` — 交付说明与制作状态更新。

## 权威文档更新

- `docs/art/ASSET_DIRECTION.md` 制作状态更新为五角色+场景全部完成验收。
- 无规范变更：CONTRACTS、ENGINEERING_SPEC、ADR、A 侧实施顺序和公开游戏数据未修改。

## 定向验证

- `python art/blender/scripts/inspect_glb.py art/blender/exports/detective-room.glb` — 通过：容器、内嵌资源、UV、无相机/灯光/REF_/CAM_/STUDIO_ 节点、三角面数据。
- `node art/blender/scripts/verify_three.mjs art/blender/exports/detective-room.glb` — 通过：GLTFLoader 解析、599 网格、有限数值、包围盒。
- 六机位渲染逐张目检：黑块、穿模、比例、灯光关系均已核验。
- Standards Review：可读命名、版本递增保留、原始参考未改、渲染灯/相机不进 GLB。
- Spec Review：对照 `docs/art/ASSET_DIRECTION.md` 场景清单逐项核对（圆桌/6 座/吊灯/证据板含红线/左书架挂钟衣帽架/右夜窗月亮窗帘绿罩灯文件柜/桌面道具/植物/模块化集合）。

## 已知风险、阻塞与下一步

- GLB 单文件约 4.4 MB，若前端加载偏慢可做 Draco 压缩或按集合拆分。
- 前端接入时角色与场景分别加载；角色朝向 +Z 需按座位朝向旋转。
- 后续可选：证据板内容按前端数据驱动的显隐/替换接口约定（属于前端 B 接入工作）。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `art/blender/USER_BRIEF.txt`
3. `docs/art/ASSET_DIRECTION.md`
4. `art/blender/DELIVERY.md`
5. `art/blender/scene/metrics.json`

## 追记（2026-09-07）：前端接入完成

- 新增 `components/three/characters/GlbCharacter.tsx`（与 CastCharacter 同 props 的 GLB 渲染器），`InterrogationStage` 与 `PortraitRow` 已切换为 GLB 角色；`public/models/` 为 GLB 分发目录；`app/dev-glb` 预览工作台。
- 关键实现：SkeletonUtils 克隆支持多实例；坐姿按"骨骼世界轴最短旋转"（ compensate bone roll，直接改 rotation.x 会锥形散开）驱动大腿/小腿并整体下沉至凳面；眨眼/口型逐帧驱动 Blink/MouthOpen morph；待机/手势走骨骼包络；舞台内角色用 Suspense 包裹，避免 useGLTF 挂起整块画布。
- 浏览器实测（localhost:3000 + IAB）：大厅五人围桌坐姿、档案页立绘排、dev-glb 单角色坐/立/口型全部正常；`bun run typecheck`、`npx eslint components/three app/dev-glb` 通过。
- 未替换 `app/dev-characters`（保留程序化角色作比对工作台）；情绪形变（皱眉/腮红/汗滴）待后续按需扩展。
