# 阶段记录与 Agent 交接

`docs/handoffs/` 记录已经发生的工作事实，并让下一位 Agent 能在最小阅读量下安全接手。这里不是契约、架构或产品行为的事实来源；涉及这些内容时，记录必须链接到相应的权威文档。

## 何时创建

为每个已完成的 tracer bullet、独立资源/环境阶段、契约变更或可单独交接的修复创建一份记录。环节缺少记录时不得标记完成。

文件名使用稳定的阶段或 ticket ID：

```text
docs/handoffs/<ticket-or-stage-id>.md
```

例如：`PF0-shared-seams.md`、`TB3-faithful-role-turn.md`、`2026-09-04-foundation-resources-and-docs.md`。

## 记录规则

- 记录当前真实状态：`complete`、`blocked` 或 `failed`。不要把计划、部分完成或降级写成完成。
- 先更新被改变的权威开发文档，再链接它；没有规范事实变化时明确写“无规范变更”。
- 每份记录只描述当前环节，避免复制整个规格或契约。
- 不记录 Secret、Access Secret、API Key、完整私有 Prompt、私有候选、Fidelity、GM 真相或未解锁 Claim。
- 后续更正可以修改同一记录，但必须保留当前真实状态、补充验证与下一步。

## 模板

```md
# <环节 ID>：<简短名称>

状态：`complete | blocked | failed`  
完成时间：`YYYY-MM-DD`  
负责人：`<agent / role>`

## 实际完成

- <可验证的完成事实>

## 明确未完成

- <未完成内容；没有则写“无”>

## 修改文件

- `relative/path` — <为什么变更>

## 权威文档更新

- `relative/path` — <变更摘要>

若没有规范事实变化：无规范变更。

## 定向验证

- `<命令或检查>` — <通过 / 失败及关键结果>

## 已知风险、阻塞与下一步

- <风险或外部依赖>
- <下一位 Agent 可以立即执行的起点>

## 最小接手阅读顺序

1. `relative/path/to/CONTEXT.md`
2. <本环节相关的权威文档>
3. <本记录>
```

## 记录索引

| 环节 | 状态 | 记录 |
|---|---|---|
| ART0 Blender 参考资产读取与制作基准 | complete | [2026-09-06-art0-reference-analysis](./2026-09-06-art0-reference-analysis.md) |
| 基础资源与工程文档 | complete | [2026-09-04-foundation-resources-and-docs](./2026-09-04-foundation-resources-and-docs.md) |
| 开发人员 A 根计划迁移 | complete | [2026-09-04-developer-a-plan-migration](./2026-09-04-developer-a-plan-migration.md) |
| 知乎 Access Secret 配置（含 CLI 重装） | complete | [2026-09-04-zhihu-access-secret-configured](./2026-09-04-zhihu-access-secret-configured.md) |
| VCS0 版本基线 | complete | [2026-09-04-vcs0-version-baseline](./2026-09-04-vcs0-version-baseline.md) |
| PF0 工具链骨架 | complete | [2026-09-04-pf0-toolchain-skeleton](./2026-09-04-pf0-toolchain-skeleton.md) |
| D0 契约修复包（A 侧） | complete | [2026-09-04-d0-contract-repair-a-side](./2026-09-04-d0-contract-repair-a-side.md) |
| D0 签署记录 | complete | [2026-09-04-d0-signoff](./2026-09-04-d0-signoff.md) |
| G0 Golden Case 源输入 | complete | [2026-09-04-g0-golden-case-source](./2026-09-04-g0-golden-case-source.md) |
| PF1 契约入口与模型 Seam | complete | [2026-09-04-pf1-schema-auth-model-seam](./2026-09-04-pf1-schema-auth-model-seam.md) |
| 工作区 ASCII 路径迁移与 Convex 本地后端验证 | complete | [2026-09-05-workspace-ascii-path](./2026-09-05-workspace-ascii-path.md) |
| 官方 zhihu Skill 升级至 0.5.3-beta | complete | [2026-09-05-zhihu-skill-upgrade](./2026-09-05-zhihu-skill-upgrade.md) |
| GC0 标注（已冻结） | complete | [2026-09-05-gc0-annotation-draft](./2026-09-05-gc0-annotation-draft.md) |
| AI_* 显式配置与真实供应商 smoke | complete | [2026-09-05-ai-config-deepseek-smoke](./2026-09-05-ai-config-deepseek-smoke.md) |
| TB1 Source 与 Durable 建案 | complete | [2026-09-05-tb1-source-durable-creation](./2026-09-05-tb1-source-durable-creation.md) |
| TB2a Golden 系统案件种子与公开查询 | complete | [2026-09-05-tb2a-golden-seed-public-queries](./2026-09-05-tb2a-golden-seed-public-queries.md) |
| TB3 Session Authority 与公开查询 | complete | [2026-09-05-tb3-session-authority](./2026-09-05-tb3-session-authority.md) |
| TB4 Faithful 成功回合 | complete | [2026-09-05-tb4-faithful-role-turn](./2026-09-05-tb4-faithful-role-turn.md) |
| 2026-09-05 夜间开发中继 | complete | [2026-09-05-night-relay](./2026-09-05-night-relay.md) |
| TB5+TB6+TB7 重写/Distorted/五条开场 | complete | [2026-09-05-tb5-tb6-tb7-rewrite-distorted-openings](./2026-09-05-tb5-tb6-tb7-rewrite-distorted-openings.md) |
| TB9 Final Accusation 与 Reveal | complete | [2026-09-05-tb9-accuse-reveal](./2026-09-05-tb9-accuse-reveal.md) |
| TB8 Evidence 与 Board | complete | [2026-09-05-tb8-evidence-board](./2026-09-05-tb8-evidence-board.md) |
| TB2b 用户案件完整编译器 | complete | [2026-09-05-tb2b-user-case-compiler](./2026-09-05-tb2b-user-case-compiler.md) |
| TB10 P0 全链证明 | complete | [2026-09-05-tb10-full-chain](./2026-09-05-tb10-full-chain.md) |
| REL0 P0 公网部署 | complete | [2026-09-05-rel0-convex-cloud](./2026-09-05-rel0-convex-cloud.md) |
| P1-1 Recording 与对质 | complete | [2026-09-05-p11-1-recording-confrontation](./2026-09-05-p11-1-recording-confrontation.md) |
| P1-2a 本地 Voice 基建 | complete | [2026-09-05-p12-2a-local-voice-infra](./2026-09-05-p12-2a-local-voice-infra.md) |
| P1-3 / G1 第二案件 | blocked（外部：DeepSeek 余额） | [2026-09-05-p13-g1-second-case](./2026-09-05-p13-g1-second-case.md) |
| developer-b 分支合并可行性研究 | complete | [2026-09-06-developer-b-merge-feasibility](./2026-09-06-developer-b-merge-feasibility.md) |
| AI 供应商切换：智谱 GLM | complete | [2026-09-06-ai-provider-switch-glm](./2026-09-06-ai-provider-switch-glm.md) |
| 2026-09-06 夜间开发中继 | complete | [2026-09-06-night-relay](./2026-09-06-night-relay.md) |
| FE-B1 前端审美重制 + 真实数据重接 | complete | [2026-09-06-frontend-b-aesthetic-live-data](./2026-09-06-frontend-b-aesthetic-live-data.md) |
| FE-B2 按官方资产重构前端视觉（3D 人物/场景/立绘落位） | complete | [2026-09-06-frontend-b2-asset-visual-rebuild](./2026-09-06-frontend-b2-asset-visual-rebuild.md) |

| ART-CHR-a-lan Blender 角色 | complete | [2026-09-06-art-chr-a-lan](./2026-09-06-art-chr-a-lan.md) |
| ART-CHR-he-xu Blender 角色 | complete | [2026-09-06-art-chr-he-xu](./2026-09-06-art-chr-he-xu.md) |
| ART-CHR-liu-chengyin Blender 角色 | complete | [2026-09-06-art-chr-liu-chengyin](./2026-09-06-art-chr-liu-chengyin.md) |
| ART-CHR-shen-qingwu Blender 角色 | complete | [2026-09-06-art-chr-shen-qingwu](./2026-09-06-art-chr-shen-qingwu.md) |
| ART-CHR-ji-yunting Blender 角色 | complete | [2026-09-06-art-chr-ji-yunting](./2026-09-06-art-chr-ji-yunting.md) |
| ART-ENV-detective-room Blender 场景 | complete | [2026-09-07-art-env-detective-room](./2026-09-07-art-env-detective-room.md) |
| MERGE-REPAIR-home-flow 合并损伤修复+大厅动线重整 | complete | [2026-09-08-merge-repair-home-flow](./2026-09-08-merge-repair-home-flow.md) |
| 开庭体验诊断：首句极慢/无法交互/动画卡死/语音不朗读（只记录未修复） | complete（诊断） | [2026-09-08-opening-freeze-and-voice-silent-diagnosis](./2026-09-08-opening-freeze-and-voice-silent-diagnosis.md) |
| 开庭体验与语音链路修复（401/自动朗读/提速/进度反馈） | complete | [2026-09-08-opening-voice-fixes](./2026-09-08-opening-voice-fixes.md) |
| 语音分段流水线（首声 2~4 秒）+ 跳过朗读按钮 | complete | [2026-09-08-voice-segmented-pipeline](./2026-09-08-voice-segmented-pipeline.md) |
| 开场五条并行生成 + 跳过即切下一条 + Validator 瘦身 | complete | [2026-09-08-openings-parallel-and-advance](./2026-09-08-openings-parallel-and-advance.md) |
| 50 轮资产/体验升级启动：环境修复与基线走查 | complete | [2026-09-09-asset-50-rounds](./2026-09-09-asset-50-rounds.md) |
| CAM-ROT-01 开场 3D 相机摇摆失控修复 | complete | [2026-09-09-camera-sway-rotation-fix](./2026-09-09-camera-sway-rotation-fix.md) |
| UX-AUDIO-INPUT-01 首屏自由环视、SFX 增益与三首游戏音乐轮换 | complete | [2026-09-09-lobby-input-sfx-and-game-music](./2026-09-09-lobby-input-sfx-and-game-music.md) |
