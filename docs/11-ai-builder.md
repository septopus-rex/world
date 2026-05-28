# AI Builder Agent — 构思文档

AI 作为 Septopus World 的建造者，能够理解自然语言指令，在虚拟世界中规划和建造结构。

## 1. 问题定义

Septopus World 有 100 个世界，每个世界 4096x4096 个 Block。靠人工逐个编辑 Block 和 Adjunct 来建造内容，效率极低。需要 AI Agent 来：

- 理解建造意图（"建一座中式庭院"、"在路口放一盏灯"）
- 规划建造方案（选址、布局、材料）
- 执行建造操作（批量生成空间结构、精细放置组件）
- 在链上持久化建造结果

## 2. 三层建造体系

Septopus World 的建造分为三个层次，从底层到顶层：

```
第三层: 粒子网格         AI 用粒子铺网格 → 批量建造空间
          ↑ 选用
第二层: 粒子（链上资产）  AI 用 Adjunct 组合定义粒子 → 注册上链 → 可复用
          ↑ 组合
第一层: Adjunct（原子组件） wall, light, trigger, module...
```

### 第一层：Adjunct — 原子组件

Adjunct 是引擎已有的附属物系统，是最基础的 3D 构件。

| 类型 | 用途 | 参数 |
|------|------|------|
| wall | 墙壁 | 位置、高度、朝向、纹理 |
| water | 水体 | 范围、深度 |
| box | 基础盒子 | 尺寸、位置、材质 |
| light | 灯光 | 位置、颜色、强度 |
| stop | 停留点 | 位置、交互 |
| trigger | 触发器 | 范围、事件、动作 |
| module | 模块 | 引用外部 3D 模型 |
| cone | 锥体 | 尺寸、位置 |
| ball | 球体 | 尺寸、位置 |

Adjunct 可以单独使用（放一盏路灯、加一个触发器），也可以组合成粒子的面配方。

### 第二层：SPP 粒子 — Adjunct 组合，链上可复用资产

SPP（String Particle Protocol，参考: [spp-protocol](https://github.com/ff13dfly/spp-protocol)）定义了粒子的数据结构。一个粒子是一个简单的立方体单元，有 6 个面，每面指定一个选项。

**一个粒子长什么样**（来自 spp-core.js 的 `createCell()`）:

```javascript
{
    position: [x, y, z],       // 网格坐标
    size: [1, 1, 1],           // 占 1 个网格单位
    faceStates: 0b111111,      // 6 个面全部激活
    faceOptions: [
        [...ALL_IDS],          // +X 面：所有选项（叠加态）
        [...ALL_IDS],          // -X 面
        [],                    // +Y 面（上，2D 场景不用）
        [],                    // -Y 面（下）
        [...ALL_IDS],          // +Z 面
        [...ALL_IDS],          // -Z 面
    ],
}
```

就这么简单。一个粒子 = 一个位置 + 6 个面的选项列表。

**面选项的两种来源**:

**固定选项**（SPP-Core 内置）:

| 类别 | ID | 名称 | 说明 |
|------|-----|------|------|
| 通道 | 0 | Empty | 空，可通行 |
| 通道 | 1 | Arch Door | 拱门 |
| 通道 | 2 | Rectangular Door | 方门 |
| 屏障 | 10 | Brick Wall | 砖墙 |
| 屏障 | 11 | Earth Wall | 土墙 |
| 屏障 | 12 | Half-height Wall | 半高墙 |
| 屏障 | 13 | Green Hedge | 绿篱 |
| 屏障 | 20 | Window | 窗户 |

**动态选项**（AI 用 Adjunct 组合创造，注册上链）:

面选项不限于固定注册表。AI 可以用 Adjunct 组合定义新的面配方，注册为链上资产：

```javascript
// AI 创造一种新的面选项："中式花窗"
{
    id: 101,                          // 链上注册的选项 ID
    name: "Chinese Lattice Window",
    type: "wall",                     // 屏障类，但有透光
    recipe: [                         // Adjunct 组合配方
        { adjunct: "wall", params: { height: 3, texture: "wood_dark" } },
        { adjunct: "module", params: { model: "lattice_pattern_01" } },
        { adjunct: "light", params: { color: "#FFF8DC", intensity: 0.3, pass_through: true } }
    ],
    creator: "AI_AGENT_WALLET_ADDRESS",
    created_at: 1234567890
}
```

**粒子上链后成为公共建材**: 任何 AI 或用户都可以在建造时引用这个面选项 ID。一个 AI 创造的"中式花窗"粒子面，可以被其他 AI 直接用在自己的建筑里。

```
AI-A 创造粒子面选项 → 上链注册（ID=101,"中式花窗"）
                              ↓
AI-B 建造时查询链上选项 → 发现 ID=101 → 直接用于自己的粒子网格
AI-C 同上
用户手工选用同上
```

**这形成了一个自增长的建材生态**: 越多 AI 创造粒子，链上的面选项越丰富，后续建造就越容易。

**生命周期**（以迷宫 demo 为例）:

```
1. 一个粒子（叠加态，每面持有全部可能选项）
       ↓ 展开成网格
2. N×M 个粒子（每个都是独立的立方体单元）
       ↓ 连接决策（哪对相邻面打通，哪对封闭）
3. 每面的选项被约束（打通的面 → OPEN_IDS，封闭的面 → WALL_IDS）
       ↓ 坍缩（每面从剩余选项中随机选一个）
4. 每面确定为一个具体选项（如 Brick Wall、Arch Door）
       ↓ 渲染
5. 引擎根据选项 ID 的配方（固定渲染规则或 Adjunct 组合）生成 3D 几何体
```

**坍缩函数** (`collapseCell`) 极其简单：

```javascript
// 对每个面，从选项列表中随机选一个
faceOptions: cell.faceOptions.map(opts => {
    if (opts.length === 0) return [];
    return [opts[Math.floor(Math.random() * opts.length)]];
})
```

### 第三层：粒子网格 — 批量空间建造

用粒子铺网格，通过相邻粒子的面连接关系定义空间结构。这是 AI 建造大空间的主要手段。

**适用场景**: 建筑群、城区布局、房间结构、迷宫、地下空间等。

### 三层如何协作

```
第一层 Adjunct            第二层 粒子              第三层 粒子网格
┌─────────────┐         ┌─────────────┐         ┌───┬───┬───┐
│ wall(木纹)   │   组合   │ 面选项 101  │   铺设   │   │   │   │
│ module(镂空) │ ──────→ │ "中式花窗"  │ ──────→ ├───┼───┼───┤
│ light(透光)  │   上链   │ (链上资产)  │   建造   │   │   │   │
└─────────────┘         └─────────────┘         └───┴───┴───┘
  原子组件                 可复用建材                空间结构
  (精细操作也可             (AI 创造                 (AI 批量
   单独使用)                其他 AI 复用)             建造空间)
```

**参与角色**:

| 角色 | 做什么 | 难度 | 产出 |
|------|--------|------|------|
| **造粒子的 AI** | 用 Adjunct 组合定义新面配方，注册上链 | 中等 | 链上面选项（建材） |
| **用粒子的 AI** | 从链上选现成粒子，铺网格建造空间 | 低 | 建筑/空间结构 |
| **人** | 审查、微调、手工打磨细节 | 低 | 更精确的空间 |

### 人机协作

三层体系中，人在每一层都可以自然参与：

**第三层（粒子网格）— 调整空间布局**:
- AI 铺好粒子网格后，人在编辑模式下点某个面，把 Brick Wall 换成 Arch Door — 多了一个入口
- 或者把某对相邻粒子的面从 Open 改成 Wall — 加了一道隔墙
- 操作粒度是"点一面，选一个选项"，跟 SPP 迷宫 demo 的 `cycleOption()` 一样简单

**第二层（粒子面配方）— 手工打磨建材**:
- 引擎编辑模式已经支持 Adjunct 的 add/set/del
- 人调好一面的视觉效果后，保存为面配方注册上链
- 相当于手作一块"建材样板"，之后 AI 可以批量引用

**第一层（Adjunct）— 精细组件调整**:
- 就是现有的编辑模式，逐个调整组件参数
- 在 AI 生成的空间中微调灯光颜色、触发器范围等

**典型的人机协作流程**:

```
AI 批量铺粒子网格（快速覆盖大面积）
  ↓
人 审查布局 → 微调几个面的选项（改入口位置、换墙体类型）
  ↓
AI 根据人的修改风格继续扩展相邻区域
  ↓
人 在关键位置手工放置 Adjunct（特殊灯光、定制模型）
  ↓
人 确认 → 提交链上
```

**高效的原因**: 人不需要从零建造，只在 AI 已生成的结构上做"点选修改"。改一面的选项是一次点击，不涉及坐标输入或参数调整。AI 处理 90% 的重复劳动，人处理 10% 的审美判断和关键决策。

### 典型工作流

完整的建造流程（AI + 人协作）:

1. **造粒子**: AI 根据风格需求，用 Adjunct 组合出新的面配方（如"中式花窗"），注册上链。人也可以手工打磨面配方后注册。
2. **铺网格**: AI 铺设粒子网格，每面选择链上已有的面选项（固定的或动态的）
3. **人审查**: 人在引擎中预览，点选修改不满意的面
4. **坍缩渲染**: 系统坍缩粒子，引擎根据面选项的配方渲染 3D 空间
5. **补充组件**: AI 用 Adjunct 批量放置灯光、触发器等；人微调关键组件
6. **确认上链**: 人预览最终效果，确认后提交链上

## 3. AI 的两类工作及难度分析

### 3.1 用粒子建造空间（选用已有面选项铺网格）

AI 的全部工作归结为：

1. **决定网格尺寸** — 一个数字（如 10×10）
2. **决定每对相邻粒子的面关系** — 二选一：通（OPEN）还是隔（WALL）
3. **选择具体面选项** — 从链上注册表里选一个 ID（固定的或动态的）

这是一个纯粹的**图邻接关系的分类问题**，LLM 天然擅长。

**具体示例：3×3 围墙庭院**

```
用户: "3×3 的围墙庭院，南面中间开个拱门"

AI 的决策过程（2D 俯视图，只看水平 4 面）:

    [0,2]───[1,2]───[2,2]
      │       │       │
    [0,1]───[1,1]───[2,1]      N(+Z)
      │       │       │         ↑
    [0,0]───[1,0]───[2,0]    W ← → E(+X)
                                ↓
                              S(-Z)

外围面（接触世界边界）→ WALL
内部相邻面 → OPEN（让庭院内部通行）
[1,0] 的 -Z 面 → 特指 Arch Door（这是南门）
```

AI 生成的 SPP 数据：

```json
{
  "cells": [
    {
      "position": [0, 0, 0], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[0], [10], [], [], [0], [10]]
    },
    {
      "position": [1, 0, 0], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[0], [0], [], [], [0], [1]]
    },
    {
      "position": [2, 0, 0], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[10], [0], [], [], [0], [10]]
    },
    {
      "position": [0, 0, 1], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[0], [10], [], [], [0], [0]]
    },
    {
      "position": [1, 0, 1], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[0], [0], [], [], [0], [0]]
    },
    {
      "position": [2, 0, 1], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[10], [0], [], [], [0], [0]]
    },
    {
      "position": [0, 0, 2], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[0], [10], [], [], [10], [0]]
    },
    {
      "position": [1, 0, 2], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[0], [0], [], [], [10], [0]]
    },
    {
      "position": [2, 0, 2], "size": [1, 1, 1], "faceStates": 51,
      "faceOptions": [[10], [0], [], [], [10], [0]]
    }
  ]
}
```

每个 cell 的 faceOptions: `[+X, -X, +Y, -Y, +Z, -Z]`
- `0` = Empty（通道），`1` = Arch Door，`10` = Brick Wall
- `[]` = 该面不激活（+Y/-Y 在 2D 场景中不用）

这就是 AI 需要输出的全部内容。**没有坐标计算，没有几何变换，没有碰撞检测**。

**难度**: 低。纯分类问题。

### 3.2 造粒子（用 Adjunct 组合定义新面选项）

当链上现有的面选项不够用时，AI 需要创造新的面配方。

**AI 需要做的事**:
1. 理解目标面的视觉效果（"中式花窗" = 木框 + 镂空图案 + 透光）
2. 选择合适的 Adjunct 类型及参数来实现这个效果
3. 确保多个 Adjunct 在同一面上的空间协调（不重叠、比例合理）
4. 输出 recipe 并注册上链

**具体示例：创造"中式花窗"面选项**

```
AI 的思考:
  "中式花窗"需要三个 Adjunct:
  1. wall — 木质框架，全高，深色木纹理
  2. module — 花窗镂空图案的 3D 模型
  3. light — 允许光线透过

输出:
{
    id: 101,
    name: "Chinese Lattice Window",
    type: "wall",
    recipe: [
        { adjunct: "wall", params: { height: 3, texture: "wood_dark" } },
        { adjunct: "module", params: { model: "lattice_pattern_01" } },
        { adjunct: "light", params: { color: "#FFF8DC", intensity: 0.3, pass_through: true } }
    ]
}
```

**难度**: 中等。AI 需要理解每种 Adjunct 的参数含义和视觉效果，以及组合后的空间关系。但这仍然是从有限选项中做选择和参数配置，不涉及几何计算。

**降低难度的方式**:
- 提供现有面配方作为参考（AI 在已有配方基础上修改，而非从零创造）
- 预览机制让 AI 看到渲染结果后迭代调整
- 链上已有配方越多，AI 需要从零创造的就越少

### 3.3 难度总结

| 任务 | 难度 | 说明 |
|------|------|------|
| **用粒子建造** | | |
| 铺网格选面选项 | 很低 | 从链上注册表选 ID，纯分类 |
| 小规模布局（≤10×10） | 低 | 图邻接分类，LLM 强项 |
| 中大规模布局 | 低~中 | 可分区域生成，拼接边界 |
| 语义化布局（庭院、房间） | 中 | 需要空间功能理解，但仍是分类 |
| **造粒子** | | |
| 修改现有面配方 | 低 | 调整参数，有参考 |
| 组合 Adjunct 定义新面配方 | 中 | 需要理解 Adjunct 参数和组合效果 |
| 创造全新风格的面配方 | 中~高 | 审美判断 + 参数搭配 |

**核心结论**:
- **用粒子建造空间几乎没有难度** — 纯分类问题，有了链上粒子库就是"选材铺地"
- **创造新粒子有一定难度但可控** — 本质是 Adjunct 参数配置 + 组合，AI 越造越多，后面越容易
- **生态效应**: 造粒子的 AI 丰富了链上建材库，用粒子的 AI 消费这些建材，形成正循环

## 4. 架构设计

### 4.1 整体分层

```
┌─────────────────────────────────────────────────┐
│              用户 / 开发者                        │
│     "在 [100,100] 区域建造 Rule Center"          │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│            AI Planner（规划层）                   │
│  - 理解自然语言意图                               │
│  - 查询目标区域现状                               │
│  - 生成 SPP 粒子网格（决定面连接关系）             │
│  - 生成 Adjunct 操作（组件细节）                   │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│            World API（操作层）                    │
│  ┌──────────────┐    ┌──────────────┐           │
│  │  SPP Engine   │    │ Adjunct API  │           │
│  │  坍缩+渲染映射 │    │ 组件CRUD     │           │
│  └──────┬───────┘    └──────┬───────┘           │
│         └────────┬──────────┘                    │
│                  ▼                               │
│         验证 → 预览 → 确认 → 链上提交              │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│         Septopus Engine + Solana Chain            │
│  Block 系统 │ Adjunct 系统 │ 渲染 │ 合约         │
└─────────────────────────────────────────────────┘
```

### 4.2 AI Planner — 规划层

AI 的核心职责：将自然语言转换为 SPP 粒子网格 + Adjunct 操作。

```
用户: "在 Block[100,100] 到 [109,109] 建造 Rule Center，
       中式风格，有围墙、正门、庭院、主殿"

AI 的工作:
1. 目标区域: 10×10 Block
2. 查询区域现状 → 确认空地
3. SPP 粒子网格:
   - 铺 10×10 的粒子
   - 外围粒子的边界面 → Brick Wall
   - 南面中央两个粒子的 -Z 面 → Arch Door（正门）
   - 内部粒子之间 → Empty（庭院通行）
   - 北部 3×4 区域的粒子间插入 Brick Wall（主殿隔墙）
   - 主殿入口面 → Rectangular Door
4. Adjunct 补充:
   - 庭院中央 Block: light（灯笼）
   - 门口 Block: module（石狮子模型）
   - 主殿内 Block: trigger + stop
5. 输出 BuildPlan
```

### 4.3 World API — 操作层

```typescript
interface WorldAPI {
  // ===== 查询 =====
  getBlock(world: number, x: number, y: number): Promise<BlockData>;
  getBlockRange(world: number, x1: number, y1: number,
                x2: number, y2: number): Promise<BlockData[]>;
  getAdjuncts(world: number, x: number, y: number): Promise<AdjunctData[]>;
  getAdjunctDefs(): Promise<AdjunctDefMap>;
  getResources(category: string): Promise<ResourceInfo[]>;
  getSPPOptions(): Promise<SPPOptionRegistry>;

  // ===== SPP 建造 =====

  /** 提交 SPP Chunk，引擎渲染映射到 Block */
  submitSPP(chunk: ParticleChunk, world: number,
            origin: [number, number]): Promise<SPPResult>;

  /** 预览 SPP 渲染结果（不提交链上） */
  previewSPP(chunk: ParticleChunk, world: number,
             origin: [number, number]): Promise<PreviewResult>;

  // ===== Adjunct 操作 =====

  /** 执行 Adjunct 操作列表 */
  modifyAdjuncts(steps: AdjunctStep[], world: number): Promise<ModifyResult>;

  // ===== 通用 =====

  /** 执行完整建造计划（SPP + Adjunct） */
  executePlan(plan: BuildPlan): Promise<BuildResult>;
  previewPlan(plan: BuildPlan): Promise<PreviewResult>;
  undoPlan(planId: string): Promise<BuildResult>;
}
```

### 4.4 BuildPlan 格式

```typescript
/** 完整建造计划 = SPP 空间结构 + Adjunct 组件 */
interface BuildPlan {
  id: string;
  name: string;                       // "Rule Center"
  description: string;                // AI 对计划的说明
  world: number;
  origin: [number, number];           // 区域起点 Block 坐标

  // === 第一层：SPP 空间结构 ===
  spp: {
    chunk: ParticleChunk;             // 粒子网格数据
    seed?: number;                    // 随机种子（用于叠加态粒子的坍缩）
  };

  // === 第二层：Adjunct 组件 ===
  adjuncts: AdjunctStep[];

  metadata: {
    created_by: string;
    created_at: number;
    style?: string;                   // 风格标签
    estimated_cost: number;           // 预估链上费用（SOL）
  };
}

/** Adjunct 操作步骤 */
interface AdjunctStep {
  block: [number, number];            // Block 坐标
  action: "add" | "set" | "del";
  adjunct: string;                    // Adjunct 类型名
  params: Record<string, any>;
  comment?: string;
}

/** 建造结果 */
interface BuildResult {
  plan_id: string;
  success: boolean;
  spp_result: {
    cells_count: number;
    blocks_affected: number;
  };
  adjunct_result: {
    steps_completed: number;
    steps_total: number;
  };
  errors: BuildError[];
  tx_signatures: string[];
}
```

### 4.5 SPP → Engine 的渲染映射

SPP 粒子只携带面选项 ID，不包含几何信息。渲染映射层负责将选项 ID 转换为 3D 对象。

**固定选项**（SPP-Core 内置，引擎硬编码渲染规则）:

```
faceOption ID  →  Engine 渲染
────────────────────────────────
 0  Empty          →  不渲染（通道）
 1  Arch Door      →  带拱形洞口的墙体模型
 2  Rect Door      →  带方形洞口的墙体模型
10  Brick Wall     →  实心墙体（砖纹理）
11  Earth Wall     →  实心墙体（土纹理）
12  Half Wall      →  半高墙体
13  Green Hedge    →  半高墙体（绿植纹理）
20  Window         →  带窗洞的墙体（半透明）
```

**动态选项**（链上注册，按 Adjunct recipe 渲染）:

```
faceOption ID  →  查链上注册表 → 获取 recipe → 逐个执行 Adjunct
────────────────────────────────────────────────────────────
101 "中式花窗"  →  recipe: [wall(木纹), module(镂空), light(透光)]
102 "铁栏杆"    →  recipe: [module(铁栏杆模型)]
103 "石板地面"  →  recipe: [box(石板纹理, 高度=0.1)]
```

渲染流程：
1. 读取面选项 ID
2. ID < 100: 走固定渲染规则
3. ID ≥ 100: 查链上注册表，获取 Adjunct recipe，依次执行

**相邻面去重**: 两个相邻粒子共享一个面，渲染时只画一次（迷宫 demo 用 `fi > OPPOSITE_FACE[fi]` 来决定由哪个粒子负责渲染）。

**地板**: 每个粒子自动渲染一个地板平面。

### 4.6 SPP 粒子与 Block 的映射

最简单的映射：**1 个 ParticleCell = 1 个 Block**。

```
SPP 粒子网格                Septopus Block 网格
┌───┬───┬───┐             ┌───┬───┬───┐
│0,2│1,2│2,2│      →      │100│101│102│  ,102
├───┼───┼───┤             ├───┼───┼───┤
│0,1│1,1│2,1│      →      │100│101│102│  ,101
├───┼───┼───┤             ├───┼───┼───┤
│0,0│1,0│2,0│      →      │100│101│102│  ,100
└───┴───┴───┘             └───┴───┴───┘
  粒子坐标                   Block 坐标 = origin + 粒子坐标
  origin = [100, 100]
```

如果需要更大尺度（1 个粒子覆盖多个 Block），可以通过 `size` 字段实现，但起步阶段 1:1 映射最简单。

### 4.7 SPP 作为 Adjunct 接入引擎

SPP 在引擎中注册为一种新的 adjunct 类型，与 wall、light、trigger 平级：

```
现有 adjunct: wall, water, box, light, stop, trigger, module, cone, ball
新增 adjunct: spp  ← 一种新的附属物类型
```

**好处**：
- **不需要改 Block 数据格式** — SPP 数据存在 Block 的 adjunct 列表里，Raw/STD/3D 转换流程全部复用
- **不需要改合约** — 合约只管存 Block 数据，不关心里面的 adjunct 是 wall 还是 spp
- **注册方式和现有 adjunct 一致** — hooks/transform/attribute/menu/task 接口直接复用

```javascript
// spp adjunct 注册，和 wall、light 同一套接口
const spp_adjunct = {
    hooks: {
        reg: () => ({
            name: "spp",
            category: "basic",
            desc: "SPP particle for space construction",
            version: "1.0.0",
        }),
        def: (data) => { /* 解析面选项定义 */ },
    },
    transform: {
        raw_std: (arr, cvt) => {
            /* Raw → STD: 解析 6 个面选项 ID */
        },
        std_3d: (stds, va) => {
            /* STD → 3D: 查链上注册表 → 获取 recipe → 生成几何体 */
            /* 固定选项(ID<100): 硬编码渲染规则 */
            /* 动态选项(ID≥100): 按 recipe 中的 Adjunct 组合渲染 */
        },
        std_raw: (arr, cvt) => {
            /* STD → Raw: 压回存储格式 */
        },
    },
    attribute: {
        add: (p, raw) => { /* 添加 spp 粒子到 Block */ },
        set: (p, raw, limit) => { /* 修改面选项 */ },
        remove: (p, raw) => { /* 移除 */ },
    },
};
```

**数据流完全走现有管线**:

```
链上(IPFS) → Raw（spp adjunct 数据: 6 个面选项 ID）
               → STD（解析为结构化面选项）
                 → 3D（查注册表，按 recipe 渲染几何体）
                   → Three.js 渲染
```

这意味着：
- Block 的 Raw 数据中，spp 和 wall、light 一样是 adjunct 的一条记录
- 引擎的缓存、加载、卸载逻辑全部复用
- 编辑模式中，spp 和其他 adjunct 一样可以 add/set/del
- 人点击粒子面切换选项，走的就是 adjunct 的 `attribute.set`

## 5. 接入方式

### 方案 A: MCP Server（开发阶段）

将 World API 包装为 MCP Server，Claude Code 直接调用。

```
septopus-mcp-server/
├── index.ts
├── tools/
│   ├── query.ts          # getBlock, getBlockRange, getSPPOptions
│   ├── spp.ts            # submitSPP, previewSPP
│   ├── adjunct.ts        # modifyAdjuncts
│   └── plan.ts           # executePlan, previewPlan
└── engine-bridge.ts
```

**使用场景**:
```
开发者: "在 [100,100] 到 [104,104] 建一个有围墙和庭院的院子"

Claude:
1. 调用 getBlockRange 查询区域 → 确认空地
2. 生成 5×5 的 SPP 粒子网格:
   - 外围面 → Brick Wall
   - 南面中间 → Arch Door
   - 内部面 → Empty
3. 调用 previewSPP → 用户在引擎中看到预览
4. 用户确认 → 调用 submitSPP
5. 调用 modifyAdjuncts 在庭院中添加灯光
```

### 方案 B: Claude API Agent（生产阶段）

独立的 AI Builder 服务，通过 Claude API + Tool Use 自主建造。

```typescript
const tools = [
  {
    name: "query_block_range",
    description: "查询指定区域的 Block 状态",
    input_schema: { /* ... */ }
  },
  {
    name: "submit_spp_chunk",
    description: "提交 SPP 粒子网格，定义区域的空间结构。每个粒子是一个立方体单元，6个面各指定一个选项（墙/门/窗/空）",
    input_schema: {
      type: "object",
      properties: {
        world: { type: "number" },
        origin: { type: "array", items: { type: "number" } },
        chunk: { $ref: "#/definitions/ParticleChunk" }
      },
      required: ["world", "origin", "chunk"]
    }
  },
  {
    name: "place_adjuncts",
    description: "在已有空间结构中放置组件（灯光、触发器、交互点等）",
    input_schema: {
      type: "object",
      properties: {
        world: { type: "number" },
        steps: { type: "array", items: { $ref: "#/definitions/AdjunctStep" } }
      },
      required: ["world", "steps"]
    }
  }
];
```

### 方案对比

| | MCP Server | Claude API Agent |
|---|---|---|
| 交互方式 | 人机对话，逐步确认 | 自主执行，完成后汇报 |
| 适用阶段 | 开发/测试 | 生产运行 |
| 建造规模 | 单个建筑/小区域 | 城区级批量建造 |
| Adjunct 使用 | 逐个调整 | 批量放置 |
| 与链的关系 | 开发者钱包签名 | Agent 钱包签名（需授权） |

## 6. 需要解决的问题

### 6.1 链上面选项注册表

面选项分两部分：

**固定选项**（ID 0-99，SPP-Core 内置 + Septopus 预定义）:
```
  0-2:   通道（Empty, Arch Door, Rect Door）
  10-13: 墙体（Brick, Earth, Half-height, Hedge）
  20:    窗户
  30-39: 地形类型（草地、石板、沙地、水面）
  40-49: 栏杆/围栏类型
  50-59: 屋顶类型
  60-69: 楼梯/坡道类型
```

**动态选项**（ID 100+，AI 创造并注册上链）:

```typescript
interface OnChainFaceOption {
    id: number;                     // 链上分配的 ID（≥100）
    name: string;                   // "Chinese Lattice Window"
    type: "open" | "wall";          // 通道还是屏障
    recipe: AdjunctStep[];          // Adjunct 组合配方
    tags: string[];                 // 风格标签 ["chinese", "window", "decorative"]
    creator: string;                // 创建者钱包地址
    usage_count: number;            // 被引用次数
}
```

链上注册表是一个**开放的建材市场**:
- 任何 AI 或用户都可以注册新的面选项
- 注册需要经过验证（recipe 中的 Adjunct 参数合法、渲染不报错）
- `usage_count` 反映面选项的受欢迎程度
- 通过 `tags` 可以按风格搜索（如搜索所有"chinese"标签的面选项）

### 6.2 坍缩策略

对于 AI 已确定的面（每面只有 1 个选项），不需要坍缩。对于 AI 留在叠加态的面（多个选项），系统需要选择坍缩方式：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| random | 随机选一个 | 不重要的面，增加多样性 |
| seed_based | 用链上区块哈希做种子 | 程序化生成，可复现 |

`seed_based` 与 Septopus 的"区块哈希随机"特性天然吻合 — 同一 SPP 数据在不同时间坍缩会产生不同但风格一致的结果。

AI 也可以选择完全确定性输出（每面直接指定 1 个选项，不留叠加态），此时不需要坍缩步骤。

### 6.3 权限与安全

**谁的地？谁签名？**
- Block Owner 授权 AI 在自己的 Block 上建造
- AI Agent 持有独立的 Solana 钱包
- 通过合约的 delegate 机制，Owner 授权 Agent 钱包操作特定 Block 范围

```
Block Owner → 授权 → AI Agent Wallet → 操作 → 特定 Block 范围
```

**操作限制**:
- 单次 BuildPlan 影响的最大 Block 数量
- 单日操作上限
- 费用上限（SOL 消耗阈值）
- 只能操作被授权的 Block 范围

### 6.4 预览与确认

```
BuildPlan → previewPlan() → 3D 预览渲染 → 用户确认 → executePlan()
```

预览模式参考迷宫 demo 的做法：
- 粒子网格先以半透明"幽灵"方块出现
- 逐个粒子渲染具体的墙/门/窗
- Adjunct 组件以半透明叠加显示
- 用户确认后才提交链上

### 6.5 SPP 逆向建模

SPP 协议包含逆向建模能力（参考 spp-protocol 的 SPP-Inverse-Modeling spec）。在 Septopus 中的应用：

```
用户上传建筑平面图 / 参考图片
      ↓
SPP Inverse Engine（AI 分析图片）
      ↓
生成 SPP 粒子网格
      ↓
在 Septopus World 中渲染
```

这让用户可以"上传一张图，AI 在虚拟世界中建出来"。

### 6.6 与 AI Center 合约的关系

```
AI Center（链上）
├── Agent 注册 — AI Agent 的身份和能力
├── 授权管理 — 谁授权了哪个 Agent 操作哪些 Block
├── 面选项注册表 — 动态面选项（Adjunct recipe）的链上注册和查询
├── 任务记录 — 建造任务的提交和完成记录
└── 费用结算 — Agent 操作的 Gas 费用来源

AI Builder Agent（链下）
├── 造粒子 — 用 Adjunct 组合创造新面配方，注册到链上
├── 用粒子 — 从链上选面选项，铺网格建造空间
├── Adjunct 补充 — 在 SPP 结构上添加功能组件
├── 状态上报 — 建造结果写回 AI Center
└── 能力声明 — 注册自己能做什么（造粒子/用粒子/两者皆可）
```

**链上粒子生态的闭环**:

```
AI-A 造粒子 → 注册面选项上链 → 链上注册表增长
                                    ↓
AI-B 查询链上注册表 → 选用面选项 → 铺网格建造 → 空间内容增长
                                    ↓
AI-C 看到 AI-B 的建造 → 受启发创造新面配方 → 注册上链 → ...
```

这是一个**自增长的建材生态**: AI 造的粒子越多，可用的建材越丰富，建造就越高效，又激发更多创造。

### 6.7 面选项的经济模型

面选项（粒子面配方）是链上资产，使用它需要付费给创造者。这个机制在 Solana 合约层面很容易实现。

**费用拆分**:

当 B 在 Block[x,y] 上使用 A 创造的面选项时，建造交易中自动拆分费用：

```
B 提交建造交易（包含使用面选项 ID=101）
      ↓
合约执行:
├── 查询 ID=101 的 creator = A
├── 计算费用拆分
│   ├── A（面选项创造者）: 创造者分成
│   ├── Block Owner:        土地分成
│   └── Septopus 国库:      系统分成
└── 在一笔交易中向三方转账
```

这与现有的 Block 销售分成机制（Owner 5 : 国库 5）是同一套模式，Solana 合约天然支持一笔交易向多个账户转账，不需要额外的结算系统。

**定价机制**:

| 项目 | 说明 |
|------|------|
| 固定选项（ID 0-99） | 免费，系统内置 |
| 动态选项（ID ≥ 100） | 创造者自定价格，或系统统一定价 |
| 使用计费 | 每次在 Block 上使用时收费（一次性） |
| 创造者收益 | 按使用次数累积，链上自动结算 |

**经济正循环**:

```
A 创造优质面配方 → 上链定价
      ↓
B, C, D... 使用 → 每次使用 A 获得分成
      ↓
A 获得收益 → 激励 A 创造更多面配方
      ↓
更丰富的建材 → 更多使用 → 更多创造 → ...
```

**面选项 usage_count 的双重作用**:
1. 质量信号 — 被多次使用说明质量好，方便其他 AI/用户发现优质建材
2. 收益凭证 — 使用次数直接对应创造者的累积收益

### 6.8 SPP 的链上存储优势

SPP 不只是 AI 友好，也是**链上经济友好**的 — 相比 Adjunct 方式，链上存储量（即上链费用）显著更低。

**同一面墙的数据量对比**:

```
Adjunct 方式（每面墙独立存储完整参数）:
{ adjunct: "wall", action: "add", param: {
    x: 3.0, y: 0, z: 0,        // 精确浮点坐标
    height: 3,                   // 高度
    face: "x",                   // 朝向字符串
    texture: "brick_01",         // 纹理字符串
    index: 0                     // 编号
}}
→ 7-8 个字段，含浮点数和字符串

SPP 方式:
faceOptions[0] = [10]            // +X 面 = Brick Wall
→ 1 个小整数
```

**10×10 区域的对比**:

| | Adjunct 方式 | SPP 方式 |
|---|---|---|
| 数据内容 | 每面墙/门/窗单独一条 Adjunct 记录 | 100 个粒子，每个 4-6 个面选项 ID |
| 单条数据大小 | 大（浮点数 8 字节 + 可变长字符串） | 极小（整数 1-2 字节） |
| 结构 | 每条独立，无固定格式 | 固定结构，高度规整 |

**动态面选项的复用 — 最大的节省**:

```
Adjunct 方式: 100 个 Block 都用"中式花窗"
→ 每个 Block 存完整的 Adjunct 参数（wall + module + light）
→ 100 份重复数据

SPP 方式: "中式花窗" recipe 注册上链一次（ID=101）
→ 100 个粒子面只存 [101]
→ 1 份 recipe + 100 个整数引用
```

**recipe 存 1 次，引用 N 次**。一个热门面选项被数千个 Block 使用时，存储节省是数量级的。

**链上存储架构 — 叠加态与坍缩态分离**:

SPP 数据在链上分两处存储，职责不同：

```
┌───────────────────────────────────────────────┐
│  SPP 粒子注册表（独立链上账户）                  │
│  存储：叠加态粒子 — 独立资产，与 Block 无关       │
│                                               │
│  ID=101 "中式花窗"                              │
│    creator: A_WALLET_ADDRESS                  │
│    type: wall                                 │
│    faceOptions: [10, 11, 20]  ← 叠加态(多选项)  │
│    recipe: [wall(...), module(...), light(...)]│
│    price: 0.001 SOL                           │
│    usage_count: 4523                          │
│                                               │
│  ID=102 "铁栏杆"                               │
│    creator: B_WALLET_ADDRESS                  │
│    ...                                        │
└───────────────────────────────────────────────┘
            ↓ 引用 ID
┌───────────────────────────────────────────────┐
│  Block 数据（每个 Block 的链上存储）              │
│  存储：坍缩态 — 每面确定为一个具体选项 ID          │
│                                               │
│  Block[100,100]:                              │
│    spp_faces: [101, 0, _, _, 10, 102]         │
│                                               │
│  Block[100,101]:                              │
│    spp_faces: [101, 101, _, _, 0, 10]         │
│                                               │
│  Block[101,100]:                              │
│    spp_faces: [0, 10, _, _, 101, 0]           │
└───────────────────────────────────────────────┘
```

**两处存储的分工**:

| | 叠加态粒子（注册表） | 坍缩态（Block 数据） |
|---|---|---|
| 存什么 | 粒子定义：多选项、recipe、价格、创造者 | 具体结果：每面 1 个确定的选项 ID |
| 绑定什么 | 独立资产，不绑定 Block | 绑定具体的 Block[x,y] |
| 数据量 | 每种粒子存 1 份 | 每个 Block 存 6 个整数 |
| 生命周期 | 长期存在，被引用 N 次 | 跟随 Block 内容变更 |
| 经济属性 | 有价格、有创造者分成 | 是 Block 内容的一部分 |

**这样设计的好处**:
- 叠加态粒子是**独立商品** — 有自己的生命周期和经济属性，不占 Block 存储
- Block 只存坍缩结果（6 个整数 ID） — 极致紧凑
- 同一个粒子被 1000 个 Block 使用 — 粒子数据只有 1 份，Block 各存 6 个整数
- 渲染时：Block 的面 ID → 查注册表获取 recipe → 按 recipe 渲染

**总结**:

| 维度 | Adjunct | SPP |
|------|---------|-----|
| 单面数据 | 7-8 字段（浮点 + 字符串） | 1 个小整数 |
| 重复内容 | 每处完整存储 | 粒子定义存 1 次，Block 只存引用 ID |
| **链上存储费用** | **高** | **显著更低** |

## 7. 实施路径

### Phase 1: SPP 集成到引擎

将 spp-lib 引入 Septopus Engine，实现 SPP 粒子网格到 3D 渲染的映射。

**产出**: `engine/src/septopus/spp/` 目录
**要点**:
- 引入 `spp-core.js`（createCell, createChunk, collapseCell）
- 实现渲染映射：面选项 ID → 3D 几何体（参考迷宫 demo 的 renderer-3d.js）
- 实现相邻面去重
- 定义粒子坐标与 Block 坐标的映射（起步用 1:1）

### Phase 2: World API 封装

在引擎之上封装统一的操作接口，同时支持 SPP 和 Adjunct。

**产出**: `engine/src/septopus/api/world-api.js`
**要点**:
- SPP 接口：submitSPP, previewSPP
- Adjunct 接口：modifyAdjuncts（复用已有的 World.modify）
- 查询接口：getBlock, getBlockRange, getAdjuncts, getSPPOptions

### Phase 3: BuildPlan 格式定义

确定 BuildPlan 的完整 JSON Schema。

**产出**: `docs/11-ai-builder-schema.json`
**要点**:
- SPP 部分：ParticleChunk schema
- Adjunct 部分：所有 Adjunct 类型的参数规范
- 约束条件：坐标范围、选项合法性

### Phase 4: MCP Server

实现 MCP Server，接入 Claude Code。

**产出**: `mcp/septopus-world/` 目录
**要点**:
- 查询工具（低风险，先实现）
- SPP 工具（生成 + 预览）
- Adjunct 工具（组件 CRUD）
- 计划工具（executePlan, previewPlan）

### Phase 5: 预览机制

在引擎中实现建造预览渲染。

**产出**: 引擎新增 preview 模式
**要点**:
- 参考迷宫 demo 的渲染流程（幽灵方块 → 具体结构）
- Adjunct 半透明预览
- 确认/取消交互

### Phase 6: 链上面选项注册表

实现动态面选项的链上注册、查询和渲染。

**产出**: 合约扩展 + 引擎动态渲染支持
**要点**:
- 合约：面选项注册（存储 recipe）、查询、usage_count 统计
- 引擎：ID ≥ 100 走链上查询 → 获取 recipe → 按 Adjunct 组合渲染
- 预定义一批固定选项（30-69: 地形、栏杆、屋顶、楼梯等）

### Phase 7: AI 造粒子能力

让 AI 能够用 Adjunct 组合创造新面配方并注册上链。

**产出**: 造粒子的 API + 工具
**要点**:
- World API 新增：createFaceOption(recipe) → 注册上链
- MCP/Tool Use 新增：create_face_option 工具
- 验证机制：recipe 中的 Adjunct 参数合法性检查
- 预览机制：AI 可以预览面配方的渲染效果后再注册

### Phase 8: Claude API Agent

独立的 AI Builder 服务，支持造粒子和用粒子两种能力。

**产出**: `agent/` 目录
**要点**:
- Claude API + Tool Use 集成
- 造粒子 Agent：分析风格需求 → Adjunct 组合 → 注册上链
- 用粒子 Agent：查询链上面选项 → 铺网格 → 建造空间
- 逆向建模支持（图片 → SPP → World）
- 大规模建造的任务队列

### Phase 9: AI Center 集成

与链上 AI Center 合约对接，形成粒子生态闭环。

**产出**: Agent 注册、授权、结算、面选项市场的链上集成
**要点**:
- AI Center 合约开发（chain/ Rust）
- Agent 钱包管理和授权
- 面选项的链上市场（按 tags 搜索、按 usage_count 排序）
- 建造任务的链上记录

## 8. 开放问题

1. **面配方的参数 schema** — Adjunct recipe 中的参数范围如何约束？需要一个参数 schema，AI 才能合法创造面配方。这个 schema 从引擎代码提取还是手动定义？
2. **面配方的质量控制** — 开放注册如何过滤垃圾/恶意内容？自动验证（recipe 能渲染）+ usage_count 自然淘汰够不够？还是需要 King 审核？
3. **经济模型的参数** — 创造者/Block Owner/国库的分成比例；面选项定价方式（自由定价 vs 统一定价）；是否收注册费防垃圾。

### 已确认的设计决策

在本文档讨论过程中确认的关键决策，供后续实现参考：

| 决策 | 结论 | 说明 |
|------|------|------|
| 粒子尺寸与布局 | 以米为单位，最大 16m（= 1 Block 边长） | 创造者定义粒子 size（如 1m、2m、4m、16m）。Block 是 16m×16m 的画布，粒子自由摆放：不需要铺满（可留空白），同一 Block 内可混用不同 SPP 粒子，空白区域可用 Adjunct 单独处理。AI 根据 size 选择精细程度 |
| Block 数据格式 | SPP 作为 adjunct | 不改格式、不改合约，复用现有 Raw→STD→3D 管线 |
| 链上存储架构 | 叠加态与坍缩态分离 | 叠加态粒子在独立注册表（可复用资产），坍缩态存在 Block 的 adjunct 数据中 |
| 面选项不可变性 | 注册后不可更新 | Block 所有者付费购买的是确定效果，创造者不能单方面修改。需要改则降级为 Adjunct — 删除 SPP 引用，将 recipe 内容直接作为 Adjunct 写入 Block，失去复用性但获得完全控制 |
| AI 生成 SPP 难度 | 低（用粒子）/ 中（造粒子） | 用粒子是纯分类问题；造粒子需要理解 Adjunct 参数组合 |
| 经济模型 | 使用付费，创造者分成 | 复用 Block 销售的分成机制，合约内一笔交易多方转账 |
| 多 Agent 边界 | Block 所有者决定 | 相邻 Block 共享面的选项由各自 Block 所有者决定，不预设一致性约束 |
| 逆向建模 | 暂不考虑 | 图片→SPP 的还原使用先忽略，后续按需引入 |
