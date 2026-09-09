# UX-AUDIO-INPUT-01：首屏自由环视、SFX 增益与三首游戏音乐轮换

状态：`complete`
完成时间：`2026-09-09`
负责人：AI 代理

## 实际完成

- 首屏大厅使用 `free` 相机交互策略：上下环视范围扩展到避开球坐标奇点的近完整球面；玩家首次拖动后自动摇摆永久让出控制，不再在松手 2.5 秒后拉回固定轨道。
- 玩家在入场运镜期间开始拖动时，立即中止 GSAP 入场时间线；重复拖动会清理旧恢复计时器，避免程序运镜与手势竞争。
- 首屏 3D 包装层声明 `touch-action: none`，触屏拖动归 Canvas/OrbitControls 处理。
- UI/游戏 SFX 总增益由 `0.5` 提升到 `0.8`；角色语音模块、TTS `<audio>` 音量与振幅链路均未修改。
- 原程序化 BGM 替换为用户上传的三首 MP3，按清单顺序 `1 → 2 → 3 → 1` 轮换；运行时只维护一个 `HTMLAudioElement`，页面隐藏时暂停，恢复可见时续播，离开 `/game/*` 时停止并释放。
- BGM 即时跟随现有音效静音开关，但角色语音不订阅该静音总线。
- 根据源文件响度测量设置独立播放补偿：Morgan `0.24`、Leberch `0.72`、Atlas `0.4008`，使三首听感接近且保持在角色语音下方。
- 三个发布资产均记录 codec、时长、采样率、声道、码率和 SHA-256；发布副本与用户上传源文件哈希一致。

## 明确未完成

- 未修改或重新编码用户上传的三首源文件。
- 未改变 BGM 播放顺序为随机；当前按用户要求采用固定轮换。

## 修改文件

- `components/three/CameraRig.tsx` — 区分 guided/free 交互、手势接管与计时器清理。
- `components/three/InterrogationStage.tsx` — 首屏启用 free 策略并固定触屏手势归属。
- `components/three/camera-motion.ts` — 定义可测试的相机交互策略。
- `lib/sfx.ts` — 提高 SFX 总增益并提供非语音静音订阅。
- `lib/game-music.ts` — 三首音乐清单、轮换索引和逐曲响度补偿。
- `lib/bgm.ts` — 单播放器顺序轮换、静音、可见性和释放生命周期。
- `app/game/layout.tsx` — 在游戏区手势后启动 BGM，并在离开游戏时停止。
- `public/game-music/*.mp3` — 三首浏览器可访问的用户上传音乐副本。
- `public/game-music/manifest.json` — 发布资产媒体元数据与固定 SHA-256。
- `tests/camera-motion.test.ts` — 首屏近全向环视且不恢复程序运镜的回归测试。
- `tests/sfx.test.ts` — SFX 增益与非语音静音订阅测试。
- `tests/bgm.test.ts` — 三首资源、哈希、轮换和逐曲音量测试。
- `docs/handoffs/README.md` — 追加本环节索引。

## 权威文档更新

无规范变更。本次只调整前端相机输入与非语音音频表现，不改变 public contract、会话状态、TTS/ASR 或数据形状。

## 定向验证

- `bun test tests/camera-motion.test.ts tests/sfx.test.ts` — 修复前 2 fail：free 模式极角仍为 `0.449 rad` 且 SFX 总增益为 `0.5`；修复后通过。
- `bun test tests/bgm.test.ts tests/camera-motion.test.ts tests/sfx.test.ts` — 13 pass / 0 fail；校验三首文件存在、SHA-256、轮换、音量、相机与 SFX。
- `bun run typecheck` — 通过。
- 定向 ESLint（本环节 TS/TSX 文件）— 通过。
- `bun run build` — 通过；21 个页面完成生产构建与静态生成。
- `ffprobe` — 三首均为可解码立体声 MP3；时长约 222.144s、210.051s、124.029s。
- `ffmpeg -af volumedetect` — 源平均响度约 -11.3、-21.3、-15.7 dB，据此设置逐曲播放补偿。
- 本地 Next 静态资源 HEAD — 三个 URL 均返回 `200 audio/mpeg`、正确 Content-Length、支持 byte ranges。
- Headless Chromium 原生播放 — 三首均读取到正确 duration，调用播放后 `currentTime` 正常推进。
- Standards Review — 通过；相机控制权、播放器单实例、可见性、静音订阅和卸载清理均由明确 owner 管理，无调试代码或临时产物残留。
- Spec Review — 通过；首屏可近全向拖动、SFX 增益提高、三首 BGM 顺序轮换，且未修改角色语音文件与音量。

## 已知风险、阻塞与下一步

- 三首音乐的最终主观响度仍建议由用户在目标扬声器上试听；当前补偿基于源平均响度与峰值，未修改角色语音。
- free 相机允许玩家绕到桌面下方；这是“全方位滑动”的直接结果，若产品希望只看桌面上半球，应再收窄 `maxPolarAngle`。
- 用户上传源目录 `游戏音乐/` 原样保留；运行时只读取 `public/game-music/` 发布副本。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `components/three/CameraRig.tsx`
3. `lib/game-music.ts`
4. `lib/bgm.ts`
5. `public/game-music/manifest.json`
6. 本记录
