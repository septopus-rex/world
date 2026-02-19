# AI 驱动的 3D 游戏开发

## 概述

Septopus World 的**协议驱动 + 弦粒子**架构天然适合 AI 驱动的 3D 内容创作。AI 不需要理解 Three.js 渲染细节或处理像素级坐标对齐，只需生成符合协议的语义化 JSON 数据，引擎自动完成验证、转换和二进制编码上链。

### AI 为什么能开发 3D 游戏

| 传统 3D 开发 | AI 的困难 | Septopus 的解法 |
|-------------|----------|----------------|
| 在编辑器中摆放物体 | AI 无空间感知 | 弦粒子：离散网格坐标 |
| 逐个调整 3D 坐标和旋转 | 精度错误、穿模 | 格栅对齐 + 构型预设 |
| 视觉反馈驱动的调整 | AI 无法"看到"结果 | 联通性逻辑可验证 |
| 编写渲染/物理代码 | 3D 编程复杂 | 协议描述，引擎执行 |
| 设计材质和光照 | 美术感知困难 | 主题系统预设 |

### 核心降维

```
传统 3D：  连续空间（无限精度坐标）+ 过程式代码
                                                    AI 极难
Septopus：离散选择（整数网格 + 有限构型 + 声明式事件）
                                                    AI 擅长
```

---

## AI 可生成的完整数据栈

```
┌─────────────────────────────────────────────────┐
│                 AI 生成层                        │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌───────────┐ │
│  │ 空间结构   │  │ 场景装饰   │  │ 游戏逻辑     │ │
│  │           │  │           │  │           │ │
│  │ 弦粒子    │  │ Adjunct   │  │ Trigger   │ │
│  │ JSON      │  │ 材质/纹理  │  │ gameSetting│ │
│  └────┬────┘  └────┬────┘  └─────┬─────┘ │
│       │            │              │          │
├───────┼────────────┼──────────────┼────────┤
│  ┌───────────────────────────────────────┐ │
│  │ 视觉资产层（构型插槽）                       │ │
│  │                                       │ │
│  │  基础件组合     或     导入 3D 模型        │ │
│  │  (Box/Wall/…)        (glb/gltf)         │ │
│  │                       ↑                  │ │
│  │              AI 3D Gen (Meshy/Tripo…)    │ │
│  │              或 人工制作的精美模型          │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         ▼              ▼               ▼
┌─────────────────────────────────────────────────┐
│              引擎执行层（不需要 AI 介入）          │
│                                                 │
│  Validate → STD → BinaryEncode → 链上存储        │
│  链上读取 → BinaryDecode → STD → RenderSystem    │
└─────────────────────────────────────────────────┘
```

### 层级一：空间结构（弦粒子）

AI 生成弦粒子 JSON，定义空间的几何结构和联通关系：

```json
{
    "type": "string_particle",
    "theme": 1,
    "cells": [
        { "pos": [0,0,0], "level": 0, "rotation": [0,0,0], "bitmask": 51, "variants": [0,0,0,0,0,0] },
        { "pos": [1,0,0], "level": 0, "rotation": [0,0,0], "bitmask": 48, "variants": [0,0,0,1,0,0], "trigger": "enter_zone" },
        { "pos": [4,0,0], "level": 1, "rotation": [0,0,0], "bitmask": 35, "variants": [0,0,2,0,0,0] }
    ]
}
```

AI 的决策空间：
- **填哪些格子** → 整数坐标 `[gx, gy, gz]`
- **精细度** → level (0=4m, 1=2m, 2=1m, 3=0.5m)，8 个 level-1 可替代 1 个 level-0
- **旋转角度** → rotation [rx, ry, rz]，每轴 0-23（15° 步长）
- **哪些面通/堵** → 6-bit bitmask
- **每面什么样** → 构型插槽索引（可是基础件组合或导入的 3D 模型）
- **是否有交互** → 单元内置 trigger

### 层级二：场景装饰（Adjunct）

AI 生成标准附属物数据，添加家具、灯光、装饰等：

```json
{
    "type": "adjunct_batch",
    "items": [
        {
            "adjunct": "box",
            "action": "add",
            "param": {
                "x": 1.0, "y": 0.5, "z": 1.2,
                "ox": 3.0, "oy": 4.0, "oz": 0.6,
                "rx": 0, "ry": 0, "rz": 0,
                "material": { "texture": 105, "repeat": [1, 1] }
            }
        },
        {
            "adjunct": "light",
            "action": "add",
            "param": {
                "ox": 2.0, "oy": 2.0, "oz": 2.8,
                "color": 16770229,
                "intensity": 0.8,
                "range": 5.0
            }
        }
    ]
}
```

### 层级三：游戏逻辑（Trigger + gameSetting）

AI 生成触发器和游戏规则，定义交互行为：

```json
{
    "type": "game_logic",
    "triggers": [
        {
            "size": [1.5, 0.2, 0.5],
            "position": [2.0, 3.0, 0.0],
            "rotation": [0, 0, 0],
            "event": "in",
            "actions": [
                { "target": ["wall", 0, 2, 1], "method": "hide" },
                { "target": ["player", "position", "z"], "method": "add", "value": 3.0 }
            ],
            "onetime": false
        }
    ],
    "gameSetting": {
        "name": "地牢探索",
        "rules": {
            "deathHeight": -10,
            "timeLimit": 300
        }
    }
}
```

---

## AI 友好协议设计要求

> [!IMPORTANT]
> 以下是为了最大化 AI 可用性，现有系统设计需要做的改动。

### 改动一：统一 JSON Schema 描述协议

**问题**：当前 Raw 数据是紧凑数组编码（如 `[[1.5, 0.2, 0.5], [1, 0.3, 0], ...]`），AI 生成时容易搞错索引位置。

**改动**：增加一层**语义化JSON 输入格式**（AI Input Format），引擎负责将其转换为二进制 Raw 上链：

```typescript
/**
 * AI 输入格式转换
 * AI JSON → STD → Binary Raw（上链）
 * Binary Raw（读链）→ STD → AI JSON
 */
interface AIInputAdapter {
    /**
     * AI 语义 JSON → 二进制 Raw（上链）
     */
    toBinary(input: AIInput): BlockRawBinary;
    
    /**
     * 二进制 Raw → AI 可读的语义化 JSON
     */
    fromBinary(raw: BlockRawBinary): AIInput;
    
    /**
     * 获取 AI 输入的 JSON Schema
     */
    getSchema(): JSONSchema;
}
```

**AI 输入格式示例**（语义化，AI 友好）：

```json
{
    "block": {
        "elevation": 1.5,
        "status": 1
    },
    "adjuncts": {
        "box": [
            {
                "size": { "x": 1.0, "y": 0.5, "z": 1.2 },
                "position": { "x": 3.0, "y": 4.0, "z": 0.6 },
                "rotation": { "x": 0, "y": 0, "z": 0 },
                "material": { "texture": 105, "repeat": [1, 1] }
            }
        ],
        "wall": [],
        "string_particle": {
            "cellSize": { "x": 4, "y": 4, "z": 3 },
            "theme": "dungeon",
            "cells": []
        }
    }
}
```

**等效的链上二进制** (约 30 bytes)：

```
01 05DC 01 02 00 0000          Block Header (8 bytes)
01 00 0001                     Box Chunk Header: typeId=1, raw, count=1
03E8 01F4 04B0                 size: 1000, 500, 1200
0BB8 0FA0 0258                 position: 3000, 4000, 600
00 00 00                       rotation: 0, 0, 0
0069 01 01                     texture: 105, repeat: 1×1
00                             flags: stop=0
```

### 改动二：构型注册中心增加描述元数据

**问题**：AI 需要知道有哪些构型可选、每种构型的效果是什么。

**改动**：每个构型增加**自然语言描述**和**标签**，供 AI 查询：

```typescript
interface FaceVariant {
    // ... 现有字段
    
    // ===== AI 友好增强 =====
    
    /** 自然语言描述（AI 用于理解该构型的效果） */
    description: string;
    
    /** 语义标签（AI 用于搜索匹配） */
    tags: string[];
    
    /** 适用场景建议 */
    useCases: string[];
}

// 示例
const archDoorVariant: FaceVariant = {
    id: 'o1',
    name: '拱门',
    description: '一个圆弧形顶部的通道门，适合中世纪或哥特风格的场景',
    tags: ['medieval', 'gothic', 'arch', 'passage', 'elegant'],
    useCases: ['地牢入口', '大厅连接', '教堂过道'],
    // ...
};
```

### 改动三：主题系统增加 Prompt 模板

**问题**：AI 需要在正确的上下文中选择主题和构型。

**改动**：每个主题附带**System Prompt 片段**，可注入 AI 对话：

```typescript
interface ParticleTheme {
    // ... 现有字段
    
    // ===== AI 集成 =====
    
    /** AI System Prompt 片段 */
    aiPrompt: string;
    
    /** 该主题的约束规则（AI 生成时的校验规则） */
    constraints: ThemeConstraint[];
}

// 示例
const dungeonTheme: ParticleTheme = {
    id: 1,
    name: '地牢',
    aiPrompt: `你正在设计一个地牢关卡。单元尺寸 4m×4m×3m。
可用的阻断构型：实墙(0)、带窗墙(1)、半墙(2)、栅栏(3)、带门墙(4)。
可用的联通构型：全开(0)、拱门(1)、门框(2)。
规则：
- 每层至少有一个入口和一个出口
- 走廊宽度至少 1 个单元
- 楼梯间必须上下联通`,
    constraints: [
        { rule: 'min_exits_per_floor', value: 2 },
        { rule: 'max_dead_ends', value: 3 },
    ],
    // ...
};
```

### 改动四：增加验证层

**问题**：AI 生成的数据可能有逻辑错误（死路、不可达区域、穿模）。

**改动**：在 Pipeline 中增加**验证阶段**：

```typescript
/**
 * AI 数据验证器
 */
interface AIValidator {
    /**
     * 结构验证：JSON 格式是否正确
     */
    validateSchema(input: AIInput): ValidationResult;
    
    /**
     * 空间验证：联通性是否合理
     */
    validateConnectivity(cells: ParticleCell[]): ValidationResult;
    
    /**
     * 碰撞验证：是否有穿模或不可达区域
     */
    validatePhysics(adjuncts: STDData): ValidationResult;
    
    /**
     * 逻辑验证：触发器引用是否有效
     */
    validateTriggers(triggers: TriggerData[], adjuncts: STDData): ValidationResult;
}

interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    suggestions: string[];      // AI 可用的修正建议
}
```

### 改动五：增加查询 API

**问题**：AI 需要了解当前世界状态才能生成合理内容。

**改动**：提供只读查询接口，让 AI "看到" 现有场景：

```typescript
/**
 * AI 查询接口 - 获取当前世界状态的结构化描述
 */
interface AIWorldQuery {
    /**
     * 获取 Block 的当前状态描述
     */
    describeBlock(coord: BlockCoord): BlockDescription;
    
    /**
     * 获取指定范围内的空间布局概要
     */
    describeRegion(from: BlockCoord, to: BlockCoord): RegionDescription;
    
    /**
     * 获取可用资源列表（纹理、模型等）
     */
    listResources(type: ResourceType): ResourceCatalog[];
    
    /**
     * 获取可用的构型和主题
     */
    listVariants(theme?: number): VariantCatalog;
    
    /**
     * 获取完整的 JSON Schema
     */
    getInputSchema(): JSONSchema;
}

interface BlockDescription {
    coord: BlockCoord;
    elevation: number;
    adjuncts: {
        type: string;
        count: number;
        summary: string;    // 自然语言描述
    }[];
    particles?: {
        cellCount: number;
        openFaces: number;
        closedFaces: number;
    };
}
```

---

## AI 开发工作流

### 完整流程

```
1. AI 查询阶段
   │
   ├── AI 请求 getInputSchema()       → 获取数据规范
   ├── AI 请求 listVariants()          → 获取可用构型
   ├── AI 请求 describeRegion()        → 了解周围环境
   │
2. AI 生成阶段
   │
   ├── AI 生成语义化 JSON（弦粒子 + 附属物 + 触发器）
   │
3. 验证阶段
   │
   ├── validateSchema()                → 格式校验
   ├── validateConnectivity()          → 联通性检查
   ├── validatePhysics()               → 碰撞检查
   ├── validateTriggers()              → 逻辑校验
   │   │
   │   ├── 通过 → 继续
   │   └── 失败 → 返回错误 + 建议 → AI 修正 → 重新验证
   │
4. 转换 + 编码阶段
   │
   ├── AIInputAdapter.toBinary()       → 语义 JSON → 二进制 Raw
   ├── 上链存储（Solana）
   │
5. 渲染阶段（读取时）
   │
   ├── BinaryDecodeStage              → 二进制 → JSON Raw
   ├── RawToSTDStage                  → JSON Raw → STD
   ├── STDToRenderStage               → STD → RenderData
   └── 引擎渲染
```

### 对话示例

```
用户：生成一个 5 层地牢，每层 3 个房间用走廊连接

AI → Engine:
  1. getInputSchema()           // 获取输入规范
  2. listVariants(theme=1)      // 获取地牢主题构型
  3. 生成 JSON:
     {
       "string_particle": {
         "theme": "dungeon",
         "cells": [
           // 第 1 层：3 个房间(3×3) + 走廊
           [0,0,0, 0b000001, ...], [1,0,0, 0b110001, ...], ...
           // 第 2 层：...
           // 楼梯间：Top/Bottom 联通
         ]
       },
       "adjuncts": { "light": [...], "box": [...] },
       "triggers": [...]
     }
  4. validateConnectivity()     // 验证每层可达
  5. AIInputAdapter.toRaw()     // 转换
  6. Pipeline 渲染
```

---

## 系统改动总览

为支持 AI 驱动开发，需要在以下模块中新增功能：

| 改动位置 | 新增内容 | 影响文档 |
|---------|---------|---------|
| Pipeline | `BinaryDecodeStage` / `BinaryEncodeStage`（二进制↔JSON Raw） | `02-framework.md` |
| Pipeline | `AIInputAdapter`（AI语义JSON↔Binary） | `02-framework.md` |
| Pipeline | `AIValidator`（验证阶段） | `02-framework.md` |
| Registry | `ComponentMeta` 增加 `typeId`/`binarySize` | `01-types.md` |
| Registry | 每个组件注册 `BinaryCodec` | `01-types.md` |
| 弦粒子 | 二进制 Cell 编码（11 bytes/cell + RLE） | `03-string-particle.md` |
| 弦粒子 | 构型增加 `description`/`tags`/`useCases` | `03-string-particle.md` |
| 弦粒子 | 主题增加 `aiPrompt`/`constraints` | `03-string-particle.md` |
| Engine | `AIWorldQuery`（查询接口） | `02-framework.md` |
| Types | `BlockRawBinary`/`BinaryCodec`/AI 类型 | `01-types.md` |
| Overview | AI 集成作为核心设计目标 | `00-overview.md` |

---

## 相关文档

- [架构概述](./00-overview.md) - 系统总体架构
- [类型定义](./01-types.md) - TypeScript 类型定义
- [框架核心](./02-framework.md) - Pipeline 和验证层
- [弦粒子系统](./03-string-particle.md) - 空间构建基础
- [时间维度](./05-time-dimension.md) - 区块链时间驱动的世界演化
