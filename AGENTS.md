# AGENTS.md

本文件继承上级 `../AGENTS.md`，只补充“证据链狼人杀”的项目级约束。实现、评审或修改契约前必须遵守两者；发生冲突时，采用约束更严格且更接近当前用户明确决定的一项。

## 事实来源与必读顺序

1. 先读根目录 `CONTEXT.md`，使用其中的领域词汇。
2. 实施冲突的优先级为：当前用户的明确决定 → `docs/adr/` 中已接受的 ADR。
3. 跨端数据形状、运行时校验和错误语义以 `contracts/` 目录下的运行时 schema（zod）为唯一事实来源；修改形状先改 schema 与 fixture，再改调用方。
4. 实施顺序以根目录 `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 为准。
5. 涉及官方 skill、CLI 或知乎接口时，实际调用知乎能力前必须读取项目级 `.codex/skills/zhihu/SKILL.md`。

> 2026-09-09 用户决定：原《证据链狼人杀_产品技术分工开发流程与数据接口_v2.0.md》与 `docs/developer-a/`（CONTRACTS、ENGINEERING_SPEC、IMPLEMENTATION_PLAN、OFFICIAL_RESOURCES、README）已归档到仓库外并从仓库删除，不再作为参考；其仍有效的约束已由 `docs/adr/` 与本文件承接。

如果较低优先级文档与较高优先级文档冲突，停止实现并先修正文档；禁止在代码里自行猜测一个“兼容”行为。

## 所有权

- 开发人员 A 负责 Article Parser、Claim Extractor、Case Compiler、Faithful Generator、Distortion Engine、Validator、GM / Reveal、Convex 数据与 actions、本地语音后端适配。
- 开发人员 B 负责产品页面、XState、输入与录音 UI、打字机展示、播放器、拼图交互和动效。
- `public contracts`、Golden Case、`DistortionType` 与发布验收为共同所有；修改公开契约必须由 B 评审。
- A 可以建立共享的 Bun / Next.js / Convex / contracts / quality 最小骨架，但不得顺带实现 B 的页面或状态机。

## 工作方法

- 契约先于实现。先更新运行时 schema、fixture 和对应文档，再修改调用方与实现。
- 大任务按根目录 `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 的 tracer bullet 沿依赖前沿推进；一个 ticket 必须形成可演示、可验证的纵向路径。
- 在约定的最高层 Interface 上做 Red → Green；测试观察公开行为，不越过 Seam 检查私有实现。
- Model Gateway 是真实外部 Seam；生产使用显式配置的 OpenAI-compatible Adapter，测试可使用 Scripted Adapter。Scripted Adapter、Golden fixture 和 mock 不得进入生产路径。
- Convex 直接作为远端权威数据 Seam；不要为了假设性的替换创建只有一个 Adapter 的通用 Repository。
- 不运行会重写文件的 formatter 或 auto-fix，除非当前任务明确要求；失败必须原样暴露。

## 阶段记录与 Agent 交接

- 一个“环节”是已经完成的 tracer bullet、独立资源或环境阶段、契约变更，或可以由另一位 Agent 独立接手的修复。
- 每个完成环节必须同时留下对应的开发文档更新和交接记录；缺少其中任一项时，不得标记完成、不得在最终交付或 PR 中声称完成。
- 交接记录存放于 `docs/handoffs/<ticket-or-stage-id>.md`，索引、命名规则和固定模板见 `docs/handoffs/README.md`。
- 记录必须写明：环节 ID、状态、完成时间、负责人；实际完成和明确未完成内容；修改文件及用途；更新过的权威文档；运行的定向验证与结果；已知失败、风险、外部阻塞和下一步；下一位 Agent 的最小阅读顺序与可执行起点。
- 接口、行为、术语、资源、架构或实施顺序发生变化时，必须先更新相应权威开发文档，再在交接记录中链接该变更。没有规范事实变化时，记录必须明确写“无规范变更”，不得复制文档内容充数。
- 交接记录是工作事实和接手入口，不是新的契约来源；`contracts/` 运行时 schema、`docs/adr/` 与根目录 `DEVELOPER_A_IMPLEMENTATION_PLAN.md` 的优先级保持不变。
- 记录不得包含 Secret、Access Secret、API Key、完整私有 Prompt、私有候选、Fidelity、GM 真相、未解锁 Claim 或其他只能存在服务端的数据。
- 记录可以因事实修正而更新，但必须保留当前真实状态；阻塞、失败和未完成项不得改写成完成。

## 不变量与失败策略

- 完整正文是建案必需输入；URL 只记录来源，不抓取正文，不以搜索摘要、示例文章或旧缓存补齐。
- 浏览器只接收 Public Projection。`fidelity`、私有 Claim 可见范围、篡改策略、Validator 记录、GM 真相与模型原始输出只能存在服务端。
- 模型输出只是候选。服务端完成 schema、引用、权限、事实和 Public Projection 校验后才能发布；原始 token 永不发送到浏览器。
- 缺配置、协议错误、模型失败、非法引用、并发冲突和不变量失败均返回明确的 typed failure；禁止默认值、静默重试、JSON 猜测修复、模型或供应商切换、catch-and-default、部分成功和伪造成功。
- 只有三种已批准的恢复：角色候选（忠实或篡改）语义失败后带反馈语义重写，共 10 次候选（首试 + 9 次重写；2026-09-11 经用户批准纳入篡改角色并由"两次"上调至 10 次；模型输出无法解析计入重写次数，非法引用与引入新事实仍立即终止）；ASR/TTS 失败时展示错误并保留人工文字路径或已批准文字；模型调用网络类瞬时错误（连接断开 / 5xx / 429 / 408）做传输层自动重试（一般调用最多 2 次，Reveal 揭晓调用最多 10 次且失败后对局退回审讯中可重新提交、不整局作废；均为 2026-09-11 用户批准；协议与配置错误不重试）。除此之外不得增加兜底。
- 功能只有“按契约完成”或“明确阻塞/失败”，不存在降级完成。未完成项不得用 TODO、占位实现或说明性文字冒充交付。

## 验证与完成

- 只运行与当前风险直接对应的测试，不追求任意覆盖率，不建立无意义的跨模型矩阵。
- 每个 ticket 至少运行其 targeted test 和 typecheck；发布前再运行相关完整套件与一次真实模型供应商 smoke。
- 涉及素材或 skill 时校验路径安全、固定哈希和媒体可解码；不得修改官方 skill 文件。
- 完成前分别进行 Standards Review 与 Spec Review。前者检查仓库规范和代码异味，后者逐项核对原始需求、契约、缺失行为与 scope creep。
- Golden Case 未获得用户提供的 URL 与完整正文时，所有依赖它的 ticket 必须标记 `BLOCKED`，不得替换输入后继续。
