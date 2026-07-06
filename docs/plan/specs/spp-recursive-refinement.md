# SPP 递归细化 + 面继承 + motif 叶子填充（设计文档 / 过程规范）

> **过程文档(非规范)**。本文提出一套"**粗格布局 → 递归细化 → 叶子填充**"的分层内容生成
> 设计,并把 AI 造物按层解耦到"低门槛"的语义层。落地后,其中的**确定性契约**部分
> （细分/继承/所有权/钉点）须抽取进 `protocol/`（弦粒子 SPP 规范,双语）——本文只做设计
> 与路线。相关:`docs/plan/specs/spp-integration.md`(SPP M1/M2)、`ai-authoring.md`(AI 造物 v1)、
> `combat-damage.md`/`dialogue-quests.md`(玩法逻辑)。参考实现锚点见文内 file:line。

## 0. 一句话

**SPP 管分空间(粗 cell + 面 open/close = 区域接口),motif 管填内容(叶子 cell 内的参数化盒子),
AI 只在"粗 cell + 接口 + 语义标签"这层作业。** 细化 = 更细的 cell 继承父面作为边界条件;
LOD 决定展开到多细;逻辑件(trigger/npc/item)仍由 AI 在白名单内放置。三者组合,不重叠。

## 1. 出发点:SPP 与 motif 是两套正交的文法(先分清)

| | SPP(b6 弦粒子) | motif(c2 生成式) |
|---|---|---|
| 本质 | **空间格文法**:cell 占用 + 6 个面的 open/close | **参数化物件**:`(rng, params) → boxes` |
| 细分 | `cellSize(level)=4×0.5^level` → **4/2/1/0.5m**(`ParticleCell.ts` SubdivisionLevel 0-3 已定义) | 无;一个模版直接吐盒子 |
| 接口 | **面 open/close**(`FaceState` Closed=生结构 / Open=通行) | 无面概念 |
| 现有模版 | `basic`(墙/门洞/窗)、`coaster`(cell→c1 track) | `house`/`road`/`building`(`MotifTemplates.ts`) |
| AI 现状 | **不在 AI 造物环里**(`GenerationDoc.ts:53` b6/c2 排除在直出外) | AI 走的正是它(`GenerationDoc.ts:22` 生成器目录) |

**心智模型:SPP=分空间,motif=拼物件。** 本设计让二者**分层组合**:SPP 出**空间骨架 + 接口**,
motif 出**叶子内部内容**。"用 4m 模版布局、2m/1m 细化、接口 open/close 从上继承"——这套机制
**属于 SPP**(细分/面),不是给 motif 加功能。

## 2. 现状与缺口(代码级)

现有 `expandParticle([origin, cells, theme])`(`engine/src/core/spp/Expander.ts:89`)是**纯函数、单层、
一次性**:

- ✅ cell 自带 `level`,`cellSize(level)=4×0.5^level`(`Expander.ts:49`)——**多分辨率数据结构已在**。
- ✅ 面模型:`faces: Array<[state, variant]>`,缺省 `[Closed,0]`(实体);`basic` 主题
  closed=solid/doorway/window、open=empty(`Variants.ts` BASIC_THEME)。
- ✅ 同层 adjacency 消除:负向面若同层有邻居则跳过(正向面拥有共享平面,`Expander.ts:114-121`)。
- ✅ 展开物 = 标准 adjunct(a1 墙 + b8 触发器),derived、**不入持久化、不占行数预算**。
- ❌ **无父子层级**:cell 是扁平列表,不同 level 只是共存,**没有"从上继承"**。
- ❌ **adjacency 只同层**(`Expander.ts:14`, 注释明写)——跨层贴合会**双墙/z-fighting**。
- ❌ **无递归驱动**:`expandCell` 返回 rows,不是 sub-cells;不能"cell→子 cell→再展开"。
- ❌ **无 cell rotation**(`Expander.ts:13`;`ParticleCell.ts` L1 协议已留 `rotation[0-23]` 15°步,未实现)。
- ❌ **无 LOD 门控展开**:`BlockLODSystem`(`world.performance.lodNear`)现在只隐藏远块网格,不控展开深度。

本设计补齐前四项(父子/跨层/递归/LOD),rotation 作为正交轨另议。

## 3. 数据模型:隐式父子 + 面继承

### 3.1 隐式父子(不加指针)

父子关系**由网格包含隐式确定**,不存显式指针(利于确定性 + 压缩):

```
父(childPos, childLevel) = [⌊px/2⌋, ⌊py/2⌋, ⌊pz/2⌋]  at (childLevel-1)
```

推导:level-L cell 跨 `[g·s, (g+1)·s]`(s=4×0.5^L);level-(L+1) cell 跨 `[g'·s/2,(g'+1)·s/2]`,
落在父 `g=⌊g'/2⌋`。每个父恰有 **2×2×2=8 个子**。子在某轴的 `g' ∈ {2g, 2g+1}`,故每个子**恰好贴到父的 3 个面**(每轴近侧一个),另 3 个面朝向兄弟=内部。

### 3.2 面继承(接口"从上继承"的确定性规则)

对子 cell 的每个面 F:

- **边界面**(F 朝向父的某个面):`child.faces[F]` **缺省继承** `parent.faces[F]`(state + variantId 原样)。
  四个共享父面 F 的子按象限 `(u:g'%2, v:g'%2)` 平铺,**均匀继承同一 state**。
- **内部面**(F 朝向兄弟,不在父边界):缺省 **Open**(区域内部默认连通)。
- 子可**显式覆盖**任一面(写入 `faces[F]` 即压过继承)。

这就是"接口从上继承":**子自动穿上父的对外接口,只需决定内部。** 用户要的核心——父北面
Open(通道),则北边界所有子继承 Open(通道保留);父北面 Closed,则是结构。**接口只在粗层决策一次。**

> v1 只继承 **state**(open/close);父面的 variant 开口(如门洞)被细分后是否逐象限保形,
> 属 v2("开口保形细分",见 §8)。v1 先按整面 state 均匀继承,variant 原样下传。

### 3.3 所有权:细者赢(消跨层双墙)

任一空间点,**几何由"存在的最细层"拥有**:

- **被细分的 cell 不出自己的面**——几何全权委托给它的叶子子孙(父变"空壳")。
- **跨"粗/细边界"的共享平面归细的一侧**:粗 cell 朝向"已被细分的邻居"的那个面**抑制**;
  细子出它继承来的边界面。→ 每个平面恰好一层出几何,无双墙。

这把现有"正向面拥有共享平面"(同层)扩展为"细者拥有共享平面"(跨层),规则闭合、确定。

## 4. 递归展开 + LOD 门控 + 实体预算

### 4.1 展开签名(仍是纯函数)

```
expandParticleTree(raw, maxLevel, budget) → ExpandedRow[]
```

- **输入源不变**:扁平多层 cell 列表 + theme(§3 的父子/继承在展开时解析,源不冗余存)。
- **maxLevel**(LOD 传入):只展开到该细分层;更细的子**跳过**,其父(粗)边界按继承 state 出面
  → 天然成为合法 LOD(§3.3 保证父面接口正确)。
- **budget**:每块 derived 实体上限;逼近则停止下降,叶子回退到父层渲染,并 **`log()` 截断**
  (不静默——遵循"no silent caps")。
- 无 rng、无墙钟:`expand(cells, theme, maxLevel, budget)` 对固定入参逐字节确定。

### 4.2 LOD 与 CID 的关系(关键钉点)

**maxLevel 只影响运行时展开深度/渲染,不影响 canonical 源与其 CID。** 即:
- 持久化/寻址的是**同一份多层 cell 源**(b6 行),`canonicalBlockBytes` 不含 maxLevel;
- `maxLevel=1` 与 `maxLevel=3` 是同一纯函数的两次调用,产不同运行时实体、**同一块 CID**。

这与 `BlockLODSystem` 隐藏远块网格是同构的:LOD 是**渲染层策略**,不是内容层事实。

### 4.3 接入点

- 展开:扩 `Expander.ts` 为递归(或加 `expandParticleTree` 并保留 `expandParticle` 为 maxLevel=∞ 特例)。
- 门控:`BlockLODSystem` 按块距给出 `maxLevel`(近块深、远块浅);块重展开走现有 b6→BlockSystem 通道
  (`BlockSystem` 已有 SOURCE_EXPANDERS 分派 + derived 实体生命周期)。
- 预算:读 `world.performance`,新增 `sppMaxEntitiesPerBlock`。

## 5. 叶子填充:motif 进 SPP(内容一致性外包给模版)

叶子 cell(最细、不再细分)可带**填充指令**:

```jsonc
// 叶子 cell 追加可选字段
{ "position": [..], "level": 2, "faces": [...],
  "fill": { "template": "shop", "params": { ... } } }   // ← motif 模版,在 cell 局部系展开
```

- cell 的**面仍出外壳**(墙/开口);`fill` 用**现有 c2/motif 机制**(`MotifExpander`)在 cell 原点展开
  内部内容(家具/细节),clip/anchor 到 cell 包围盒。
- **确定性**:motif seed 由 `hash(blockCid, cellPos, level)` 钉死(mulberry32),同源同物。
- 这就是"叶子用 motif 填":**SPP 保证空间与接口一致,motif 保证内部内容一致**——各干最擅长的。

## 6. AI 分层造物(把门槛压到语义层)

**为什么裸 cell 对 AI 是高门槛**:LLM 弱于 3D 空间一致性,逐面产 1m cell(跨层象限对齐、门通向门、
不留封死房间)极易错。本设计让 AI **只在粗层 + 接口 + 语义**作业,几何一致性下沉给继承规则与模版。

三层职责:

| 层 | AI 产出 | 维度 | 一致性由谁保证 |
|---|---|---|---|
| **粗布局** | level-0 cell 网格(一块 16m = 4×4 个)+ 每 cell 语义标签 | 低(几十 cell) | 作者/AI |
| **接口** | 每 cell 6 面 open/close(=连通拓扑:哪面是门/通道) | 低(拓扑图) | 面继承(子自动穿父接口) |
| **细化+填充** | 需要细节的 cell 标 `refine` + 叶子 `fill:{template}` | 低(语义:"这间='shop'") | motif 模版(内部几何) |
| **逻辑** | 白名单直出 trigger/npc/item/spawner(`GenerationDoc` 已支持) | 中 | 引擎系统 |

AI **从不吐裸细几何**;它吐:粗 cell + 面拓扑 + 语义 fill + 逻辑放置。全是低维、语义、可校验的。

**接入 AI 造物**:`GenerationDoc` 现在把 b6/c2 排除在直出外、只留 motif 生成器目录
(`GenerationDoc.ts:53-55`)。本设计新增一类生成器 piece:`{kind:'spp-region', cells:[粗cell...], fills:{...}}`
→ 编译为一行 b6(多层 cell)。这样 AI 既能出 SPP 区域,又走同一条校验/预算/派生通道,与既有
motif/直出 adjunct 同安检链。

## 7. 确定性钉点(落地时抽进 protocol/ 的规范核心)

1. **细分尺寸**:`cellSize(level)=4×0.5^level`(已定,`ParticleCell.ts`)。
2. **父包含**:`parent=⌊pos/2⌋ @ level-1`;每父 8 子;子边界面判定 `g'∈{2g,2g+1}`。
3. **面继承**:边界面缺省继承父 (state,variant) 均匀下传;内部面缺省 Open;显式写入覆盖。
4. **平面所有权**:细者拥有跨层共享平面;同层正向面拥有(既有规则)。
5. **叶子 motif seed**:`hash(blockCid, cellPos, level)` → mulberry32。
6. **展开顺序**:cell 按 (level 升, position 字典序) 规范排序 → 行字节稳定 → 稳定 CID。
7. **LOD 不入源**:maxLevel/budget 只改运行时展开,`canonicalBlockBytes` 与 CID 无关。

## 8. 非目标 / 待议(YAGNI,别一次吃下)

- **开口保形细分**(父门洞被细分后逐象限保留开口)——v1 只继承整面 state,variant 原样;保形是 v2。
- **规则式 L-system**(cell 按产生式**自动**生成子图案)——v1 是"作者/AI 提供子 cell",非规则生成。
- **cell rotation**(`ParticleCell` L1 已留 15°步 rotation)——正交轨,与递归独立推进。
- **跨块细化**(细化跨越 block 边界)——v1 限块内。
- **动态细化**(运行时按玩家距离增删叶子)——v1 是 LOD 静态门控;流式增删属后续。

## 9. 路线(增量,每阶段可独立验收)

- **R1 父子 + 面继承 + 细者所有权** ✅ **已实现(2026-07-06,`spp-protocol-full.md` Workstream D)**。
  落点采协议 §3.2.5 的**显式嵌套** `refinement`(非本文原设想的扁平隐式 `⌊pos/2⌋`,嵌套更直接):
  `Expander.ts` `expandChunk` 递归 + `resolveFaces` 面继承(边界继承父/内部默认 Open/子 null 逐面继承/
  显式覆盖)+ `FACE_DIR` 细者拥有跨层平面(消双墙)+ `maxLevel`/`budget` LOD。测试
  `spp-refinement.test.ts`(8)+ e2e `spp-refine.spec.ts`。验收达成:两层嵌套无双墙;父面 Open→子边界
  继承 Open;显式覆盖生效。
- **R2 LOD 门控 maxLevel + 实体预算**。接 `BlockLODSystem`;`log()` 截断。
  验收:远块只出 level-0、近块出到 level-2,重展开 CID 不变。
- **R3 叶子 motif 填充**。c2 每叶子调用,seed 钉死。验收:同源逐字节同物。
- **R4 AI 分层造物**。`GenerationDoc` 加 `spp-region` 生成器 + fills;走同安检/预算。
  验收:e2e——自然语言 → AI 出一栋多房间小楼(粗布局+接口+叶子填充+一个可跑通 trigger),
  预览不入 draft、建造走 draftStore、重载存续(对齐 `ai-authoring.spec.ts` 模式)。
- **规范抽取**:R1–R3 稳定后,§7 钉点写进 `protocol/cn|en`(SPP 细分/继承/所有权/确定性),双语同步。

## 10. 收益与风险

**收益**:一行 b6 源 → 可流式、可细化、AI 低门槛(语义层)、确定性(跨端同展开)的世界骨架;
SPP 与 motif 各司其职不重叠;LOD 天然叠加。

**风险(须在设计内消解,非事后补)**:
1. **运行时实体爆炸**——derived 是真实体(碰撞/网格/触发器/LOD)。靠 §4 LOD 门控 + 预算封顶 +
   叶子细节**合批网格**(而非一子 cell 一实体)化解。
2. **"生成几何 ≠ 造游戏"**——本设计只解决场景/接口/内容;玩法回路(任务/平衡/节奏)仍在逻辑层
   另写(trigger/actuator/flag/dialogue/game-zone)。别把"能生成细城堡"误当"做出了游戏"。
3. **两套生成系统重叠**——靠 §1 的"SPP 分空间 / motif 拼物件"边界钉死:递归归 SPP,叶子内容归 motif。
