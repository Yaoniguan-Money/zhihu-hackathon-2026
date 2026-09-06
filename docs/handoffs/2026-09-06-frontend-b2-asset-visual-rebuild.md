# FE-B2：按官方资产素材重构前端视觉（3D 人物建模 + 场景 + 2D 立绘落位）

状态：`complete`  
完成时间：`2026-09-06`  
负责人：`ZCode（开发人员 B 视角）`

## 实际完成

- 官方素材入库：`zhihu_hackathon_assets_20260906` 的 5 张单体立绘、5 张四视图、1 张场景图复制到 `public/assets/cast/`（ASCII 文件名：`shen-qingwu/ji-yunting/a-lan/he-xu/liu-chengyin.png` + `four-views/` + `scenes/detective-room.png`）。
- 3D 人物模型全面重写（`components/three/characters/`）：
  - 头型由纯球体改为 **LatheGeometry 样条剖面**（颅顶→颊最宽→下颌收窄→圆下巴），解决“脸型不流畅”；
  - 眼睛重构为“巩膜椭圆 + 虹膜/limbal 环/瞳孔/双高光叠层 + 厚上睫毛带 + 下睫细线”，虹膜占眼宽约 91%（旧版白球占眼宽 23% 且竖直拉长，是“眼睛过大”的根源），双色高光统一光源方向；
  - 五套发型逐一对照官方立绘（沈青梧波波头/纪云汀碎短发/阿岚蓬乱刺头/何叙银灰背头+络腮胡+八字胡/柳成荫紫卷+贝雷帽），帽冠后倾抬高发际线，眉上完全开放；
  - 服装系统 4 版型（trench/suit/hoodie/professor）+ 腿/鞋（平底鞋/高跟/运动鞋）+ 配件（记者证、挂绳工牌、领结、围巾、格纹围巾、书、笔记本、电脑、挎包、手表、项链、耳饰、背包带），固定道具（教授双手捧书 `holdFront` 手臂摆幅收小）；
  - 表情/手势动画系统原样保留并重定向（emotion/stance/speaking/pressure/gestureSeed 全部来自公开契约字段），眨眼改为眼睑压合+眼球压缩。
- 审讯室场景重做（`InterrogationRoom.tsx`）：程序化木纹地板、地毯金边、黄铜吊灯（聚光暖影）、月夜窗（月亮光晕/星星/城市剪影/窗帘）、书架、软木板证据墙（照片+红线）、右侧柜+绿罩台灯、双绿植、挂钟、尘埃粒子；材质从 toon 色带改为 `meshStandardMaterial` 软渲染以贴合官方盲盒渲染质感。
- 灯光系统：舞台加“暖色正面补光 + 窗侧冷色轮廓光 + drei `Environment`+`Lightformer` 程序化环境反射（零网络依赖）”；PortraitRow 用柔光三灯；照相机位适配新体格（坐姿≈1.99 高、站姿≈2.06 高）。
- 2D 页面落位官方素材：简报页 Case File 顶部加场景图横幅（渐变融入纸卡）、角色卡加立绘圆形头像；Reveal 页真凶卡用官方立绘（非精选 persona 回退字母圆徽）；大厅/审讯/指控继续消费重制后的 3D 舞台。
- `app/dev-characters`（仅本地开发）升级为“3D vs 官方立绘”比对工作台：审讯桌全景 + 正面立绘排 + 官方单体立绘/四视图并排，附 emotion/stance/speaking/手势控制。
- 技术选型调研（用户要求）：GitHub 检索结论——无匹配本套定制盲盒人设的现成人物生成库；`pixiv/three-vrm` 依赖 .vrm 等身模型且无法还原官方立绘的服装/发型；`wass08/r3f-ultimate-character-configurator` 等依赖预制 GLB；`CharacterGen` 需 GPU 推理。故在现有技术栈（three 0.170 + @react-three/fiber 9 + @react-three/drei 10）内程序化重建，未引入旧式技术栈，未引用被舍弃的未提交版本。

## 明确未完成

- 三维模型的皮肤次表面散射、发丝级 groom、 BlendShape 级口型：超出盲盒风格必要细节，未做。
- 审讯页对局内实机截图验证未做（受 GLM 免费档间歇故障阻塞，避免烧后端；舞台本身已在 dev-characters 全景+正面双视图验证）。
- 全量 lint 中 5 个 error 为 FE-B1 基线遗留（`app/page.tsx`、`app/game/evidence`、`app/game/interrogation`、`components/ui/RecordButton.tsx`、`components/ui/Typewriter.tsx` 的 set-state-in-effect / no-this-alias），本次未处理。

## 修改文件

- `public/assets/cast/**`、`public/assets/scenes/detective-room.png` — 新增官方素材（ASCII 路径）。
- `components/three/characters/personas.ts` — 外观 schema 重构（skin/blush/hair/hairDark/eye/hairStyle/outfitStyle/outfit/outfitAccent/trousers/shoes/shoeStyle/glasses/hat/props/beard/holdFront），精选 5 人对齐立绘取色。
- `components/three/characters/castArt.ts` — 新增：persona_key → 立绘/四视图资产映射。
- `components/three/characters/canvasTextures.ts` — 新增：程序化虹膜/木纹/格纹 CanvasTexture（模块缓存）。
- `components/three/characters/face.tsx` — 新增：lathe 头型、Face 比例常数（FACE）、Eye/Brow/Mouth/HeadBase。
- `components/three/characters/hair.tsx` — 新增：5 套发型 + Beard/Beret/Glasses。
- `components/three/characters/outfits.tsx` — 新增：lathe 躯干 4 版型 + Arm/Leg/Shoe + 配件与手持道具。
- `components/three/characters/CastCharacter.tsx` — 新增：角色装配 + 契约驱动动画（替代并删除 `ChibiCharacter.tsx`）。
- `components/three/InterrogationStage.tsx` — CastCharacter 接入、灯光/环境重制、座位半径 2.6→2.35、气泡高度 2.0→2.35。
- `components/three/PortraitRow.tsx` — CastCharacter 接入、相机 lookAt 居中、柔光三灯。
- `components/three/CameraRig.tsx` — 默认机位/焦点高度适配新体格。
- `components/three/scene/InterrogationRoom.tsx` — 场景全面重做。
- `app/dev-characters/page.tsx` — 比对工作台（正面视图 + 官方资产基准区）。
- `app/game/briefing/page.tsx` — 场景图横幅 + 立绘头像。
- `app/game/reveal/page.tsx` — 真凶卡官方立绘。

## 权威文档更新

无规范变更（CONTRACTS/ENGINEERING_SPEC/根计划/ADR 零改动；本环节为 B 侧视觉实现，公开契约消费方式与 `docs/developer-a/CONTRACTS.md` 完全一致，RolePublic→personaForRole 的映射签名未变）。

## 定向验证

- `bun run typecheck` — 通过。
- `npx eslint components/three app/dev-characters app/game/briefing app/game/reveal` — 0 error 0 warning（全仓剩余 error 均为 FE-B1 基线遗留，见上）。
- `bun test` — 135 pass / 11 skip / 0 fail（146 tests）。
- 浏览器实机自查（多轮截图）：`/dev-characters` 正面视图对照官方立绘逐一校形（眼睛占比、发际线、贝雷帽、围巾、手持物）；`/` 大厅与 `/game/briefing` 简报页确认场景氛围与素材落位。迭代中共修复：发壳盖脸（帽冠前缘低于眉线）、虹膜/巩膜占比、嘴部埋入下巴曲面（mouthZ 0.303→0.376）、八字胡/记者证/衬衫衬条/纽扣穿模、阿岚发型“熊耳化”、灯光过曝与面部阴影过重。

## 已知风险、阻塞与下一步

- 移动端/低端机性能未做专项压测；场景网格数增加约一倍，必要时可减 `Sparkles` 数量或降低 `dpr` 上限。
- 非精选 persona（用户自建案件关键词/哈希命中）只有 1 套兜底外观 + 5 套预设复用，造型多样性可后续扩充。
- 下一位 Agent 可立即执行的起点：在 `dev-characters` 工作台对照四视图继续微调发型/服装细节（`hair.tsx`/`outfits.tsx` 全部为带注释的参数化 Lock 片段，可直接调数值）；或在 `personas.ts` 为关键词命中增加更多预设。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `docs/developer-a/CONTRACTS.md`（RolePublic/emotion/stance 契约消费）
3. `docs/handoffs/2026-09-06-frontend-b-aesthetic-live-data.md`（FE-B1 前置）
4. 本记录
