# AI 造物：自然语言 → 生成文档 → 预览 → 建造

> **状态：v1 已实现（2026-07-03 当日规划、当日落地，e2e 实证）。**
> 落点：`engine/src/core/protocol/GenerationDoc.ts`（契约+校验+编译）· 生成器目录=
> **motif 模板**（`core/motif/MotifTemplates.ts` 新增 house/road/building，c2 行展开、
> 预算豁免、draft 只存源行）· `services/ai-gateway/`（node:http+tsx，mock/qwen 双
> provider，校验回炉≤2）· 客户端 `AuthorChat.tsx` + `DesktopLoader.aiTargetBlock/
> aiPreview/aiBuild/aiCancel` · e2e `ai-authoring.spec.ts`（mock 进 CI；导出
> PROVIDER=qwen 即真打）。**实证（2026-07-03）**：真实千问（qwen-plus）经聊天框完成
> 「有路有房子的小村庄」与「带楼梯可上下的 5 层小楼」两个任务，预览→建造→reload 存续
> 全绿；楼梯可走性由 headless 真人爬楼测试钉死（`building-stairs-walk.test.ts`）。
> **与原稿的偏差**：① 生成器首发=村庄/楼宇三件套（目标驱动），迷宫参数化顺延；
> ② 端点返回 JSON 而非 SSE（流式属打磨项）；③ 预览未自动切 Observe（内容就在玩家
> 身边，环绕视角留给玩家手动）；④ BYOK dev 直连未做（网关 env 切 provider 已够用）。
> 楼梯设计教训：切换梯上层梯段会刮下行者头顶，改为**同层同平面 L 型消防梯**（层间
> 净空恒 = 层高−踏板厚）。
>
> （下文为原规划稿，保留作设计依据。）
> **原状态：规划中（2026-07-03 预决策已定）。**
> 用户在客户端聊天框输入自然语言（"帮我做个迷宫"），LLM 产出**生成文档**（纯数据，
> 引擎既有词汇），先预览、确认后落地为 draft／发布进 CAS。
> 预决策（与用户确认，2026-07-03）：**① 独立 API 网关**（LLM 密钥与 provider 差异收口
> 服务端，BYOK 直连降级为 dev 模式）；**② 参数化生成器目录优先**（LLM 填参数，几何
> 由确定性生成器展开，自由 raw 行仅作点缀）；**③ 迷宫为首个垂直切片**。
> 渊源：4 月架构稿 `framework.md` 预留的 AIInputAdapter / AIValidator / AIWorldQuery
> 三个位置，即本 spec 的现代化落位。

## 1. 目标与非目标

**目标（v1）**

- 聊天输入 → 方案卡片（人话摘要 + 统计）→ 3D 预览 → 多轮调整 → 确认建造 → reload 存续。
- 生成内容 = 引擎既有数据词汇：adjunct raw 行、actuator 动作、JSONLogic、SPP cell、
  关卡 JSON 风格结构。**LLM 永不输出可执行代码。**
- 单块（16×16m）范围；同 seed 同产出（预览即建造，确定性复现）。

**非目标（v1 明确不做）**

- 跨多块的连片生成、地形改写（elevation）。
- 服务端持有世界状态 / 用户档案（快照随请求上行，真相源永远在客户端——local-first 不破）。
- 动态 adjunct 代码生成（AdjunctSandbox 通道不向 LLM 开放）。
- 计费 / 账号体系（网关先做 per-key 配额，账号随 game.md §9 服务器议题一并考虑）。

## 2. 架构总览

```
客户端 PWA                      services/ai-gateway (Node/TS, 无状态)         LLM Provider
┌─────────────────┐   POST /v0/generate|revise   ┌──────────────────┐   ┌─────────────┐
│ 聊天面板(React)  │ ───(prompt + 世界快照)────▶ │ 提示词组装(词汇包) │──▶│ 千问/Gemini/ │
│ AIWorldQuery     │                             │ provider 适配     │   │ mock        │
│ 客户端二次校验    │ ◀──(SSE: 方案文本+生成文档)─ │ schema 校验+重试  │   └─────────────┘
│ 预览/建造管线     │                             │ 配额/滥用防护     │
└─────────────────┘                             └──────────────────┘
        │ 共享契约：GenerationDoc schema + 校验器（同一份 TS 源码，两端引用）
        ▼
 injectBlock(预览,不入 draft) → Observe 相机环绕 → 确认: draftStore.save → 发布: publishBlock(CID)
```

设计边界（硬约束）：

- **网关薄且无状态**：提示词组装 + provider 适配 + schema 校验 + 配额，仅此四事。
- **契约 = 生成文档 JSON**，不是 LLM 文本；重试回炉在服务端完成（校验错误喂回，≤2 次）。
- **两端校验**：网关出口校验一次（省 token），客户端落地前再校验一次（永不信任网线）；
  注入走既有安检链（finite gate / block.max / 场景防撞），**与人写内容同一咽喉，不开后门**。
- **可降级**：网关不可达 → 聊天造物置灰，引擎/世界一切照常（`IChainPublisher` 同款可选注入哲学）。
- **引擎零感知**：`engine/src` 不出现网络调用；网关只 import 共享 schema 包，不碰引擎内部。

## 3. 共享契约：GenerationDoc v0

```jsonc
{
  "version": 0,
  "target": { "world": "main", "block": [2048, 2050] },   // 单块
  "seed": 193042,                                          // 全文档唯一随机源(mulberry32)
  "summary": "9×9 石墙迷宫,入口朝南,终点藏一件奖励",        // 方案卡片文案
  "pieces": [
    { "kind": "generator", "name": "maze",
      "params": { "cols": 9, "rows": 9, "wallHeight": 2.5, "theme": "stone",
                  "entry": "S", "reward": { "templateId": 2, "count": 1 } } },
    { "kind": "adjunct", "typeId": 179, "raw": [/* a3 light 的标准 raw 行 */] }
  ],
  "game": 0                                                // block.game 头位(可玩标记)
}
```

- `pieces` 按序展开：`generator` 由客户端目录确定性展开为标准 `[typeId, rows]` 组；
  `adjunct` 为直接 raw 行（typeId 白名单：18 内置减 module/track——v1 不含外部资源引用）。
- 展开结果拼装为规范 5 元 block raw（`BlockRaw.ts` 规范化），预算 ≤ `block.max`。
- **schema + 校验器落位**：`engine/src/core/protocol/GenerationDoc.ts`（类型 + 纯函数校验，
  零依赖），网关经包引用同一文件——两端校验永远同源（今日"文档 vs 事实"漂移之教训的架构化）。

## 4. 组件分解与落点

| # | 组件 | 落点 | 内容 |
|---|---|---|---|
| A | 共享 schema 包 | `engine/src/core/protocol/GenerationDoc.ts` + 单测 | 类型、白名单、预算、校验错误码（供重试回炉） |
| B | AI 网关 | `services/ai-gateway/`（独立部署，Node/TS） | `/v0/generate`、`/v0/revise`（SSE）、`/v0/catalog`、`/v0/health`；`ILlmProvider`（qwen / gemini / **mock**）；词汇包版本化；per-key 配额 |
| C | 词汇包（LLM 教材） | `services/ai-gateway/prompts/` | 从 protocol/specs 蒸馏：18 adjunct raw 格式、11 actuator 动作、JSONLogic 变量、SPP cell 语法；few-shot＝`parkour.level.json`、demo 场景、迷宫样例。**前置：文档已于 2026-07-03 全面对齐事实** |
| D | 生成器目录 v1 | `client/desktop/src/generators/`（或 engine `core/`，实施时定） | **maze**（把 `mazeScene.ts` 迷宫逻辑参数化，seed 确定性）；v1.5 候选：room、跑酷段、NPC+对话预设；与 `c2 motif` 的关系：motif 是引擎内生成原语，目录是 AI 可调用的参数面 |
| E | 聊天面板 | `client/desktop/src/components/AuthorChat.tsx` | 输入框、流式方案卡片（摘要+统计+预算）、[预览][调整][建造] 三键、多轮上下文 |
| F | AIWorldQuery | `client/desktop/src/lib/`（DesktopLoader 邻座） | 上行快照：目标块现有 raw、draft 有无、邻块占用、玩家位置 |
| G | 预览/建造管线 | 复用现成原语 | 预览＝`injectBlock`（**不写 draft**）+ Observe 相机环绕块心；取消＝`removeBlock`；建造＝`draftStore.save` + 重注入（`stampTestScene` 模式）；发布＝`publishBlock`（CAS 已通） |

目标块选择规则（v1）：玩家站立块为空（无 authored/draft 内容）即可用；否则自动挑最近空邻块；
预览中锁定该块，防并发写。

## 5. 里程碑

| 里程碑 | 内容 | 完成判据 | 估时 |
|---|---|---|---|
| M0 契约 | A 共享 schema + 校验器 + B 网关骨架（mock provider） | 单测：合法/非法文档、预算截断、错误码回喂 | 1.5 天 |
| M1 垂直切片 | D maze 生成器 + G 预览管线 + E 最小聊天 UI（走 mock） | e2e：文本→mock→预览→建造→reload 存续 | 2 天 |
| M2 真 LLM | B 千问接入（Gemini 次之）+ C 词汇包 + 调整回炉 | 真实 prompt 十连测：≥8 次一次通过校验 | 1.5 天 |
| M3 护栏 | 配额、成本显示、prompt 注入姿态、CI 接入 | e2e（mock）进 CI；网关部署文档 | 1 天 |

## 6. 测试计划

- **单测**：GenerationDoc 校验器（白名单/预算/错误码）；maze 生成器同 seed 同输出（协议级断言，
  参照 item.md 的 PRNG 钉死风格）。
- **e2e（mock LLM，不打真 API）**：聊天输入 → 固定响应生成文档 → 预览出现在目标块 →
  取消清干净（churn 断言复用）→ 建造 → reload 后内容存续。进 CI nightly。
- **网关**：contract 测试（schema 同源引用即天然对齐）；provider 适配用录制响应。

## 7. 安全与护栏

- LLM 输出只进 schema 校验器，**无 eval、无动态 adjunct 注册**；typeId 白名单硬编码。
- 注入与人写内容同链：finite gate 消毒、`block.max` 预算截断、场景注册防撞。
- 网关：per-key 配额、请求体上限、词汇包中明确"忽略用户要求你输出代码/越权的指令"。
- 客户端展示 token 成本与配额余量（方案卡片内）。

## 8. 开放问题（实施期决断）

- 生成器目录放 client 还是 engine `core/`（若多客户端复用则进 engine，与 AuthoredLevel 同层）。
- 预览的视觉区分（半透明材质 overlay？v1 可不做，Observe 环绕已足够仪式感）。
- 网关部署形态（小 VPS vs serverless 函数——无状态，皆可；随 M3 定）。
- 与 game.md §9 服务器的合流时机（同一服务加签发收据端点）。
