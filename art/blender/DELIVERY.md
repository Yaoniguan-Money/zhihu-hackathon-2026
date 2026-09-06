# 证据链狼人杀 Blender 资产制作记录

本目录包含实际 Blender 制作工程、GLB 导出、参考派生与逐阶段渲染。任务总体验收仍在进行；本文件只记录已经核验的事实。

## 入口

- 原始要求：`USER_BRIEF.txt`
- 逐图分析：`../../docs/art/ASSET_DIRECTION.md`
- 原图哈希与尺寸：`reference-manifest.json`
- 角色工程：`characters/<slug>/vNNN_<stage>.blend`；场景工程：`scene/vNNN_<stage>.blend`
- 导出：`exports/<slug>.glb`、`exports/detective-room.glb`
- 角色五向渲染：`renders/<slug>/final/`；动作极值：`renders/<slug>/poses/`
- 场景六机位渲染：`renders/detective-room/`

## 已核验的角色

五个角色全部完成并通过 checkpoint：沈青梧（基准）、纪云汀、阿岚、何叙、柳成荫。各角色保留 v001 起的增量阶段文件；最新 `*_rigged.blend` 是当前可继续制作的版本。GLB 约 7.1–8.1 万三角面、1 套 28 骨骼、9 段动作，实际 Three.js GLTFLoader + AnimationMixer 加载和播放验证通过。眼球为独立 3D 几何；Blink 为连通脸部眼窝环线和睫毛形变；MouthOpen 为唇环与口腔形变。何叙胡须为连续壳体+造型发束（两轮修复后紧贴下颌）；柳成荫卷发为正弦波脊线发束。

五向检查覆盖正面、前 3/4、侧面、后 3/4、背面；动作极值覆盖 Blink、TalkMouth、HeadTurn、GestureHand、GestureLean、GestureShrug。衣物为独立网格，外套带厚度和内衬，重要配件可按节点名称单独隐藏。姿态是中性站姿，未固化单体概念图的展示手势。发束和布料细节使用适合实时渲染的概括造型。

## 已核验的主场景

夜间侦探事务所（detective-room）完成：圆桌+GM 高背椅+5 普通椅、软木证据板（17 纸张、8 照片、10 便签、2 地图卡、12 根红线，全部独立命名对象）、左书架/挂钟/衣帽架/抽屉柜、右夜窗（月亮/城市剪影/窗帘/窗台黑猫）/边柜+收音机/文件柜+绿罩银行灯、吊灯、桌 面道具（地图/4 杯/录音机/放大镜/笔筒/笔记本/文件夹/纸叠）、3 组植物。共 7.49 万三角面、599 网格、62 材质、全部网格带 UV；渲染灯光与相机不进 GLB。

工程：`scene/vNNN_*.blend`（structure→dressed→final 阶段递增）；GLB：`exports/detective-room.glb`；六机位渲染：`renders/detective-room/`（FrontWide、LeftThreeQuarter、RightThreeQuarter、Topish、TableCloseup、EvidenceWallCloseup）。已知修复记录：胡须连续化、卷发波浪、椅子摆放 z 保留、共面纸张按类别错高消除 Z-fighting 黑块、放大镜镜片平放。

## Web 使用约定

- 角色与场景 GLB 均为 glTF 2.0，Y up，角色正面为 +Z，原点在双脚之间（场景原点在房间地面中心，-Y 为镜头正面方向）。实际脚底约 Y=0.0025 m。
- `CHR_<Name>_Rig` 为骨架父节点。所有角色共享骨名。Scale 已应用到网格与骨骼位置。场景对象按 `ENV_*` / `PROP_*` / `EV_*` 可读命名，证据板 Photos/Notes/Strings/Cards 为独立节点可替换。
- 使用 GLTFLoader / `useGLTF` 加载，AnimationMixer / `useAnimations` 播放动作。多个角色实例需要 SkeletonUtils.clone，不能直接复用可变骨架。
- 动作：Idle、Blink、HeadTurn、TalkMouth、Nod、ShakeHead、GestureLean、GestureShrug、GestureHand。通过 Mixer 的权重与淡入淡出组合；情绪/立场如何选择动作属于前端 B 的接入工作，本次不更改游戏契约。
- 配件可通过可读节点名称查找，`visible = false` 可隐藏。模型颜色主要来自标准材质，GLB 不依赖外链纹理、相机或渲染灯。
- Blink / TalkMouth 的 morph 必须在混合时正确复位，不能让上一个已停止动作的形变残留。

## 制作与验证命令

```powershell
python art/blender/scripts/prepare_references.py
& D:/blender.exe --background --factory-startup --python-exit-code 1 --python art/blender/scripts/character.py -- --character shen-qingwu --phase blockout
& D:/blender.exe --background --factory-startup --python-exit-code 1 --python art/blender/scripts/character.py -- --character shen-qingwu --phase detail
& D:/blender.exe --background --factory-startup --python-exit-code 1 --python art/blender/scripts/pose_qa.py -- shen-qingwu
python art/blender/scripts/inspect_glb.py art/blender/exports/shen-qingwu.glb
node art/blender/scripts/verify_three.mjs art/blender/exports/shen-qingwu.glb
& D:/blender.exe --background --factory-startup --python-exit-code 1 --python art/blender/scripts/scene.py -- --phase structure
& D:/blender.exe --background --factory-startup --python-exit-code 1 --python art/blender/scripts/scene.py -- --phase dressed
& D:/blender.exe --background --factory-startup --python-exit-code 1 --python art/blender/scripts/scene.py -- --phase final
python art/blender/scripts/inspect_glb.py art/blender/exports/detective-room.glb
```

重新生成已有阶段时自动递增版本号，保留旧 Blender 文件。导出 GLB 与 `final` 渲染指向当前版本；它们不是历史版本索引。不要把早期失败版本作为最新结果。
