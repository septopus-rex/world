# AI 造物 v2 实验：直出 adjunct + 服务端空间碰撞校验(ai-builder)

> **状态：规划中（2026-07-13 预决策）。尚未写代码。**
> 与 `docs/plan/specs/ai-authoring.md`（v1，已实现）的关系：**不是替代，是独立试验**。
> v1 的护栏是"生成器目录优先 + 12 类型直出白名单 + 软性提示词叮嘱留缝"；本提案测试另一种
> 护栏——**放宽直出的语义面（LLM 更自由地摆放具体 adjunct），把"别叠一起"从提示词软约束
> 升级成服务端硬校验（真实包围盒碰撞 + 冲突回炉重生成）**。两者共享同一份
> `GenerationDoc.ts` 契约与客户端预览/建造管线（`AiAuthoring.ts` 零改动），只是服务端生成
> 策略不同——因此拆成独立进程 `services/ai-builder/`（新端口 `7791`），可以单独测试、单独
> 打开关，不影响已上线的 `services/ai-gateway`。

## 0. 结论先行：这不是新契约，是新的服务端策略

读完 v1 实现后发现，用户要的六步流程其实**完全落在 `GenerationDoc.ts` 既有的 `GenPieceAdjunct`
piece 类型上**（`{kind:'adjunct', typeId, raw}`——直接一行标准 raw，不经生成器展开）。v1 已经
支持这种 piece，只是把可直出的 typeId 收在 `GEN_ADJUNCT_WHITELIST`（12 型）里，且**从不做
布局层面的空间校验**——`validateGenerationDoc` 只查 schema/范围/预算，place 位是否互相穿模，
现状唯一防线是 `prompts.ts` 里一句提示词软叮嘱（"物体之间留 ≥1.5 米可走通道"）。

所以本提案的增量其实只有两块：

1. **扩大直出语义面**：允许 AI 更自由地组合"点缀级"直出 adjunct（仍是 whitelist，只是这个
   whitelist 是把关重点，见 §3），而不是主要靠 house/road/building 三个生成器兜底。
2. **服务端空间碰撞校验（全新，v1 没有）**：真正计算包围盒重叠，冲突则把冲突详情喂回 LLM
   重生成，直到通过或到达重试上限。

客户端 `AiAuthoring.ts`（`aiPreview`/`aiBuild`/`aiCancel`）完全不用改——它消费的是
`GenerationDoc` → `compileGenerationDoc` → block raw，这条链路不关心 raw 是网关 A 生成的还是
网关 B 生成的。**唯一的前端改动**是 `AuthorChat.tsx` 把请求打到哪个 URL（v1 网关 vs 本服务），
甚至可以做成一个下拉切换,两个策略并排 A/B。

## 1. 目标与非目标

**目标**

- 独立进程 `services/ai-builder/`，端口 `7791`，`node:http` + `tsx`，无状态（世界快照随
  请求上行，不持久化）——架构约束与 v1 完全一致（薄网关四事：提示词组装 + provider 适配 +
  校验 + 配额）。
- 六步执行序（用户原话，逐条对应到实现）：

  | # | 用户描述 | 落地 |
  |---|---|---|
  | 1 | 前端传原话 | `POST /v0/generate {prompt, target, existing?}` |
  | 2 | 服务端缓存 adjuncts + block 定义 | `catalog.ts`：全量类型描述表(§2) + block raw схема描述文本 |
  | 3 | 拼装提示词送指定大模型,要求返回 adjuncts 数据 | 复用 `services/ai-gateway/prompts.ts` 的坐标系/布局规则文风,扩展直出目录；复用 `providers.ts` 的 `makeProvider()` |
  | 4 | 服务端空间碰撞检测 | `collision.ts`：`detectCollisions(doc, existing)`（§4，全新） |
  | 5 | 碰撞则回炉重生成 | 复用 v1 `generate()` 的重试循环，碰撞错误与 schema 错误走同一条 `validationErrors` 回喂通道 |
  | 6 | 通过则回给前端 | `{plan, doc, warnings?}` — `doc` 仍是标准 `GenerationDoc`，客户端零改动可用 |

- 允许生成器 piece（house/road/building/…）与直出 adjunct piece 混用——碰撞检测把生成器
  piece **先展开成真实盒子**再一起查（§4.2），否则"房子盖路上"这种典型错误反而漏检。

**非目标**

- 不做多轮修订端点（v1 有 `/v0/revise`；本服务的"回炉"是**服务端内部**重试，不向前端暴露
  多轮——如果用户想要"改一改"的多轮体验，走 v1 网关或后续再加）。
- 不扩大到跨块 / 地形改写——与 v1 同样的单块（16×16m）范围。
- 不做真正的物理仿真碰撞（走 `MovementCollider` 那条路）——本服务只做**摆放期**的包围盒
  重叠检测，是"内容合不合理"的静态校验，不是运行时物理。
- 不替换 v1、不改 v1 代码——完全独立部署，`deploy/dev.sh` 里作为新增一行,可以单独开关。

## 2. adjunct 目录缓存（第 2 步）

服务启动时一次性构建两张表（内存缓存，非持久化）：

**A. adjunct 类型描述表**——覆盖 `AdjunctType.ts` 全部内置类型（而不只是白名单 12 个），
每条含：`{typeId, name, oneLiner, rawShape, collidable, emittable}`。

- `oneLiner`/`rawShape` 供 prompt 里给 AI 讲清楚"块里已经有什么"（比如已有一个 module/track,
  AI 至少要知道那是个不可移动的实体、得绕开），也供碰撞检测解析已有内容的包围盒。
- `collidable`：是否参与空间碰撞检测（§4.1 分类表）。
- `emittable`：是否允许 AI **新生成**这个类型——**默认仍是 v1 的 `GEN_ADJUNCT_WHITELIST`
  12 型**，不因为"服务端现在有碰撞校验兜底"就放开全部 21 型。理由：碰撞校验解决的是
  "东西摆哪儿"的问题，不解决"这行 raw 数据本身是否合法几何"的问题（比如 SPP b6 的
  cell/face 语法、track 的控制点样条）——那类高自由度 raw 格式本来就是 `spp-recursive-
  refinement.md` 里明确写过的"LLM 高门槛"，不该因为加了碰撞校验就重新引入。**如果实测中
  发现某个白名单外类型确实值得开放，走一次显式扩表，不是本次默认行为。**

**B. block schema 描述文本**——block raw 五元组 `[elevation,status,adjuncts,animations,game]`
+ 局部坐标约定（西南角为原点、X 东 Y 北 Z 上、旋转是 engine-frame Euler XYZ、yaw 在
rotation[1]）——文案基本照抄 v1 `prompts.ts` 的坐标系段落,保持两份网关对 AI 讲同一套话述,
不允许出现两份口径不一致的坐标解释。

## 3. 请求/响应契约

复用 `GenerationDoc` 类型本身，请求/响应包一层：

```jsonc
// POST /v0/generate
{
  "prompt": "河边种几棵树,岸上摆盏灯",
  "target": { "block": [2000, 1001] },
  // 目标块【已有】内容的碰撞相关行(collidable 类型)——网关无状态,由客户端每次带上来,
  // 与 v1 snapshot.targetBlock 同一套"世界真相在客户端"哲学。省略 = 视为空块。
  "existing": [ [161 /*Wall*/, [[[5,0.4,3],[8,11,1.5],[0,0,0],0,[1,1],0,1]]] ]
}
```

```jsonc
// 200 响应
{
  "plan": "人话摘要",
  "doc": { /* 标准 GenerationDoc,可直接喂 AiAuthoring.aiPreview(doc) */ },
  "attempts": 2,
  // 到达重试上限仍有未解决冲突时才出现——不是硬失败,把决定权交回人/前端
  "warnings": [ { "a": "pieces[3]", "b": "existing[0]", "overlap": [0.4, 0, 1.2] } ]
}

// 422：validation_failed（schema 或碰撞连续 MAX_RETRIES+1 轮都没过,且未触发 warnings 兜底
// 的极端情况——例如模型压根没输出合法 JSON）
{ "error": "validation_failed", "errors": [...], "raw": "..." }
```

`doc` 字段的合法性仍由 `validateGenerationDoc`（原样引用 `engine/src/core/protocol/
GenerationDoc.ts`，零拷贝零漂移）把关；碰撞校验是**在 schema 校验通过之后**追加的第二道关卡。

## 4. 空间碰撞检测（第 4/5 步，全新）

### 4.1 collidable 分类

只在"占地几何"之间查重叠，忽略点位/逻辑类：

| 参与检测 | 不参与检测 |
|---|---|
| Wall(a1) Box(a2) Cone(a6) Ball(a7) Stop(b4) 生成器展开出的盒子(c2→内部即 a2 Box) | Light(a3) Water(a5) Item(b5) Trigger(b8) Spawner(b9) Npc(ba) Link(e1) 等 |

右列这些要么本来就该允许与地面/其它物体共享空间（灯光/水面/触发体积），要么体积可忽略、
移动中（NPC）——加入检测只会制造假阳性。

### 4.2 生成器 piece 先展开再查

`kind:'generator'` 的 piece（house/road/building…）不能只看 `origin`，必须用同一份
`core/motif/MotifTemplates.ts`（纯函数、无 Three.js、无网络，`getMotifTemplate(name).
build(rng, params)` 即可拿到真实 `MotifBox[]`）按 `doc.seed`/`piece.seed` 展开出实际盒子
列表——这样"AI 把一栋房子的 origin 定在已有道路正中间"才会被真正的重叠检测抓到，而不是
放过（house 的四面墙、road 的路面都是独立盒子，origin 层面不重叠不代表几何不重叠）。

### 4.3 AABB 重叠判定

每个 collidable 单位（直出 adjunct 行 or 展开出的 MotifBox）取 `{size,pos,rot}` 中的
`size`+`pos`，按**忽略旋转的保守 AABB**（`[pos - size/2, pos + size/2]`）——与
`MovementCollider.SHAPE_BOX` 现有的"旋转不参与碰撞"简化保持一致，不引入新的不一致口径。
三轴（X/Y/Z）全部相交才判定重叠；留一个小容差（如 0.05m 穿透以内不算，允许墙体拼接共边）
避免生成器输出的正常邻接（比如两面墙严丝合缝）被误判。

检测集合 = (本次新生成的 collidable 单位) × [(彼此之间) ∪ (§3 `existing` 里的 collidable
行)]，两两配对。

### 4.4 回炉重试

冲突列表格式与 `GenError` 同形（`{code:'collision', path, msg}`），与 schema 校验错误一起
塞进 v1 `generate()` 循环已有的 `validationErrors` 回喂通道——对现有重试循环而言，碰撞检测
只是又一种"校验失败原因"，不需要另开一条状态机。重试上限沿用 `MAX_RETRIES`（建议从 2 提到
3——碰撞是新增的失败轴，给 AI 多一次机会），到顶仍有冲突则**不硬失败**：把最后一版 `doc`
连同 `warnings` 一起返回，前端/人决定接受、手动挪一下，还是丢弃重来（与 v1 §2"可降级"的
哲学一致：宁可交出一个带瑕疵的可用结果,也不要卡死用户）。

## 5. 组件分解与落点

| 组件 | 落点 | 内容 |
|---|---|---|
| 服务入口 | `services/ai-builder/server.ts` | `node:http`；路由 `/v0/health` `/v0/catalog` `/v0/generate`；结构照抄 `services/ai-gateway/server.ts` 的 `generate()` 重试循环骨架 |
| provider 复用 | `services/ai-builder/server.ts` → `import { makeProvider } from '../ai-gateway/providers'` | 不重复造轮子；`PROVIDER=mock\|qwen\|gemini` 环境变量同款 |
| 类型/schema 目录 | `services/ai-builder/catalog.ts` | §2 的 A/B 两张表；`GET /v0/catalog` 直接吐出 |
| 提示词 | `services/ai-builder/prompts.ts` | 复用 v1 `prompts.ts` 的坐标系/few-shot 文风，扩展直出目录段落 |
| 碰撞检测 | `services/ai-builder/collision.ts` | `detectCollisions(candidateBoxes, existingBoxes): GenError[]`；`expandGeneratorPiece(piece, seed)` 复用 `core/motif/MotifTemplates.ts` |
| 契约（零改动） | `engine/src/core/protocol/GenerationDoc.ts` | 原样引用，两个网关继续同源 |
| 前端接线 | `client/desktop/src/components/AuthorChat.tsx` | 新增一个网关地址选项（v1 / ai-builder），或先留 env 切换,视需要再做 UI |
| dev.sh | `deploy/dev.sh` | `FE_SERVICES` 新增一行 `AI-Build |services/ai-builder|7791|npm start` |

## 6. 测试计划

- **单测**：`collision.ts` 的 AABB 重叠判定（含边界相切不算重叠、容差、旋转忽略是否与
  `MovementCollider` 口径一致）；生成器展开+碰撞联合场景（house 蹲在 road 中间必须被抓到）。
- **网关 contract 测试**：mock provider 录制"第一次故意重叠、第二次修正"的两轮响应，断言
  `attempts:2` 且最终 `doc` 无冲突；重试耗尽场景断言返回 `warnings` 而非硬失败。
- **e2e（mock，不打真 API）**：走 `AuthorChat.tsx`（如果做了网关切换 UI）或直接打
  `/v0/generate`，预览注入目标块，人工/断言确认预览中的盒子确实不重叠。

## 7. 开放问题（实施期决断）

- `existing` 由客户端整块 raw 直接带上来，还是只挑 collidable 行精简体积？（后者省 token,
  前者实现更简单——先做简单版，token 超预算再精简。）
- 是否需要 `/v0/revise` 多轮修订？取决于用户体验反馈——先看 v1 是否已经够用。
- v1/v2 两个网关长期是否收敛成一个（策略作为请求参数而非两个进程）？先独立测试满一段时间
  再决定，不提前合并（避免过早抽象）。
- 直出白名单是否需要按碰撞检测的存在而扩表？留到实测积累几个具体案例后再定，不是本次预判。

## 8. 与 v1 的对照速览

| | v1 `ai-gateway`（已实现） | v2 `ai-builder`（本提案） |
|---|---|---|
| 端口 | 7788 | 7791 |
| 主要生成手段 | 生成器目录（house/road/building）为主，直出 adjunct 为点缀 | 直出 adjunct 为主，生成器目录仍可混用 |
| 布局防撞 | 提示词软叮嘱（"留 ≥1.5m 通道"），无服务端校验 | 服务端硬校验：真实包围盒碰撞 + 冲突回炉 |
| 契约 | `GenerationDoc` | 同一份 `GenerationDoc`，零改动 |
| 客户端接线 | `AuthorChat.tsx` → `/v0/generate\|revise` | `AuthorChat.tsx` → 新地址 `/v0/generate`（本服务无 revise） |
| 定位 | 已上线的主线 | 独立试验，验证"直出+碰撞校验"策略是否比"生成器优先"更好用/更可靠 |
