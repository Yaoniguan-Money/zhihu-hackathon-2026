# 证据链狼人杀领域语言

本术语表定义“证据链狼人杀”的统一领域语言。它只解释领域概念，不记录实现方式。

## 来源与事实

**Source Snapshot（来源快照）**：
用户为一次建案同时提交的来源地址与完整正文，代表该案件的输入证据。
_Avoid_: 链接案件、抓取结果、搜索摘要

**Canonical Source（规范正文）**：
由 Source Snapshot 确定、供该案件引用的唯一正文版本。
_Avoid_: 清洗稿、模型正文、备用正文

**Source Span（来源片段）**：
Canonical Source 中一段连续且可精确回溯的文字，是 Claim 的原始证据位置。
_Avoid_: 摘要片段、大意、引用描述

**Claim（原子事实）**：
从 Canonical Source 提取的最小可验证命题；一个 Claim 应能独立判断是否得到来源支持。
_Avoid_: 观点块、整段摘要、知识点

**Claim Relation（事实关系）**：
两个 Claim 之间由来源支持的语义联系，例如支持、限定、矛盾、时间先后或因果关系。
_Avoid_: 连线、模型关系、故事关系

**Evidence Graph（证据图谱）**：
当前案件全部 Claim 与 Claim Relation 构成的事实网络，是角色发言和真相判定的内容基础。
_Avoid_: 知识图谱、剧情图、Prompt 上下文

**Golden Case（黄金案件）**：
由真实 Source Snapshot、人工确认的 Evidence Graph、角色政策、标准答案及代表性结果共同组成的基准案件。
_Avoid_: Demo 数据、样例回退、Mock 案件

## 角色与陈述

**Persona（角色人格）**：
角色公开的身份、表达风格与声音特征；Persona 不决定角色对原意是否忠实。
_Avoid_: 身份阵营、真假标签

**Fidelity（忠实属性）**：
角色陈述与 Canonical Source 原意之间的隐藏关系，取值为 faithful 或 distorted。
_Avoid_: 好人坏人、真假人格

**Faithful Role（忠实角色）**：
只能发布由其可见 Claim 支持、且不改变原意的陈述的角色。
_Avoid_: 真话角色、好人

**Distorted Role（篡改角色）**：
只能使用已有来源材料、但会按获准方式改变事实关系或语义范围的角色。
_Avoid_: 撒谎角色、幻觉角色、坏人

**Distortion Type（篡改类型）**：
对原文含义进行可分类改变的方式，例如范围扩大、条件删除或因果偷换。
_Avoid_: 谎言类型、错误标签、风格标签

**Role Policy（角色政策）**：
一名角色的 Fidelity、可见 Claim、目标及获准 Distortion Type 的私有集合。
_Avoid_: 角色 Prompt、人物设定

**Role Turn（角色回合）**：
由一次玩家提问、录音投递或系统事件触发，并最终产生一条已批准角色消息或明确失败的处理过程。
_Avoid_: 一次模型调用、流式回答

**Approved Role Message（已批准角色消息）**：
通过案件政策和 Validator 检查、允许向玩家公开的完整角色陈述。
_Avoid_: 模型回复、候选文本、原始输出

## 游戏证据与裁决

**Evidence Fragment（证据片段）**：
玩家已经解锁、可用于分析或指控的来源文字、角色引语、时间关系或冲突记录。
_Avoid_: 私有 Claim、任意截图、模型提示

**Recording Evidence（录音证据）**：
从一条 Approved Role Message 保存的可回放引语证据，可被投递给其他角色进行对质。
_Avoid_: 上传录音、自由编辑的台词

**Evidence Board（证据板）**：
玩家对已解锁 Evidence Fragment 进行摆放和关联所得的分析成果。
_Avoid_: 真相图谱、GM 答案

**Session（对局）**：
一名玩家针对一个案件进行调查、保存证据、提交指控并查看揭晓的连续游戏记录。
_Avoid_: 聊天、房间、案件

**Final Accusation（最终指控）**：
玩家提交的篡改角色、Distortion Type 与支撑 Evidence Fragment 的组合判断。
_Avoid_: 投票、猜人、答案文本

**Reveal（真相揭晓）**：
最终指控完成后公开的标准角色、篡改方式、事实链、被改变关系和评分结果。
_Avoid_: Validator 结果、调试答案

**GM（主持裁决者）**：
掌握案件完整私有真相并负责评估 Final Accusation、生成 Reveal 的隐藏角色。
_Avoid_: 普通角色、聊天机器人、管理员

