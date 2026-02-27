# 弦粒子系统（String Particle System）

## 概述

弦粒子系统是 Septopus World 的**空间内容快速构建方案**。它包含两个层次：

1. **空间骨架**：通过六面联通/阻断状态（bitmask）定义空间的可通行关系
2. **面内容**：每个面从多种可选构型中选择，构型可包含任意 Adjunct（简单几何体、精细模型、触发器等）

两者结合后，弦粒子是一个**从空间骨架到具体内容的一体化构建系统**。

> [!NOTE]
> 弦粒子的链上二进制格式（数据结构、编码规则、约束）已独立为 [弦粒子协议规范](../features/spp-protocol.md)。本文档聚焦于引擎侧的构型定义、展开算法、主题系统和构建流程。

### 核心思想

```
传统方式：  逐个放置墙壁 → 手动对齐 → 检查联通 → 反复调整
弦粒子方式：填充空间格子 → 选择各面联通/阻断 → 选择每面的构型样式 → 自动生成
```

> [!IMPORTANT]
> 弦粒子的产出物是标准的 Adjunct 数据（Box、Wall、Stop、Trigger、导入模型等），完全兼容现有引擎管线。Adjunct 既可以集成在弦粒子的构型内，也可以在弦粒子之外独立放置。单元内部同样可以携带 Trigger。

---

## 基本概念

### 弦粒子单元（Particle Cell）

弦粒子的基础单元是一个 **[4, 4, 4] 米**（4000mm）的等大 BOX 空间，以 **0.5 的倍数**进行细分：

```
基础单元 [4,4,4]m
┌────────────────┐         细分等级（level）：
│                │          0 → [4,4,4]m  基础
│   4m × 4m × 4m │          1 → [2,2,2]m  精细
│                │          2 → [1,1,1]m  高精
│                │          3 → [0.5,0.5,0.5]m 超精
└────────────────┘
```

一个 level-0 单元可以被 **8 个 level-1 单元**替代，实现更精细的空间控制：

```
level-0: 1 个 [4,4,4]         level-1: 8 个 [2,2,2]
┌────────────────┐            ┌────────┬────────┐
│                │            │        │        │
│  4 × 4 × 4    │    ──→     ├────────┼────────┤ × 2层
│                │            │        │        │
└────────────────┘            └────────┴────────┘
```

每个单元有 **6 个面**，每个面有两种状态：

| 状态 | 含义 | 效果 |
|------|------|------|
| **联通（Open）** | 此面可通行 | 玩家可从该方向进出此单元 |
| **阻断（Closed）** | 此面被封闭 | 生成墙壁/地板/天花板，阻拦玩家 |

每个单元**内部可以携带 Trigger**，用于实现事件交互。

### 非直角场景

弦粒子不仅限于横平竖直的世界，有两种方式构建复杂场景：

**方式一：斜向构型（不旋转 cell）**

通过设计斜向的构型样式，在标准网格内实现非直角效果：

```
斜向走廊构型：在标准 cell 内放置斜墙
┌────────────────┐
│ ╱              │     Front 面使用 "斜墙" 构型
│   ╱            │     → 内部的 Box/Wall 按 45° 旋转放置
│     ╱          │     cell 本身未旋转，但视觉上是斜的
│       ╱        │
└────────────────┘
```

**方式二：单元旋转（更直观）**

给单元设置旋转角度，整个 cell 旋转后其所有面和构型一起旋转：

```
螺旋塔楼：每层递增旋转
层 0:  ┌──┐         层 1:  ╱╲
      │  │               ╱  ╲
      └──┘               ╲  ╱
                          ╲╱
→ 堆叠旋转 = 螺旋楼梯、弧形大厅、Y字形分叉等
```

旋转角度限制为 **15° 的整数倍**（24 个方向），平衡表现力和算法复杂度。

### 六面定义

```typescript
/**
 * 弦粒子的六个面
 * 与 Septopus 坐标系对应
 */
enum ParticleFace {
    Top    = 0,    // Z+ 上面（天花板/开口）
    Bottom = 1,    // Z- 下面（地板/开口）
    Front  = 2,    // Y- 前面（南墙/通道）
    Back   = 3,    // Y+ 后面（北墙/通道）
    Left   = 4,    // X- 左面（西墙/通道）
    Right  = 5,    // X+ 右面（东墙/通道）
}
```

---

## 面构型（Face Variant）

每种面状态（联通/阻断）有**多种构型**可选——Open 状态有 N 种选择，Closed 状态有 M 种选择。构型是一个**插槽（Slot）**，可以填入：

1. **基础件组合**：用引擎内置的 Box/Wall/Stop/Trigger 拼装（快速、轻量）
2. **导入模型**：引用外部 3D 模型文件（glb/gltf），实现任意复杂的视觉效果

构型本身就可以包含 Adjunct（Box、Wall、Trigger 等），因此弦粒子是一个从空间骨架到具体内容的完整系统，不仅仅是空间联通性的定义。

> [!TIP]
> 构型是插槽而非限制——简单场景用基础件快速搭建，高品质场景可导入曲面屋顶、雕花门框、玻璃幕墙等精美模型。未来 AI 3D 生成工具产出的模型也可直接填入插槽。

### 阻断构型示例（Closed Variants）

```
类型 C0 - 实墙           类型 C1 - 带窗墙          类型 C2 - 半墙
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│██████████████│       │██████████████│       │              │
│██████████████│       │███┌────┐████│       │              │
│██████████████│       │███│    │████│       │──────────────│
│██████████████│       │███└────┘████│       │██████████████│
│██████████████│       │██████████████│       │██████████████│
└──────────────┘       └──────────────┘       └──────────────┘

类型 C3 - 栅栏           类型 C4 - 带门墙
┌──────────────┐       ┌──────────────┐
│█ █ █ █ █ █ █│       │██████████████│
│█ █ █ █ █ █ █│       │████┌──┐█████│
│█ █ █ █ █ █ █│       │████│  │█████│
│█ █ █ █ █ █ █│       │████│  │█████│
│██████████████│       │████└──┘█████│
└──────────────┘       └──────────────┘
```

### 联通构型示例（Open Variants）

```
类型 O0 - 全开           类型 O1 - 拱门            类型 O2 - 门框
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│              │       │███┌────┐████│       │██████████████│
│              │       │██│      │███│       │█│          │█│
│              │       │█│        │██│       │█│          │█│
│              │       ││          │█│       │█│          │█│
│              │       ││          ││       │█│          │█│
└──────────────┘       └──────────────┘       └──────────────┘
```

### 构型定义

```typescript
/**
 * 面状态
 */
enum FaceState {
    Open = 0,      // 联通
    Closed = 1,    // 阻断
}

/**
 * 面构型定义 - 一个插槽，可填入基础件组合或导入模型
 */
interface FaceVariant {
    id: string;                     // 构型唯一标识
    state: FaceState;               // 联通 or 阻断
    face: ParticleFace;             // 适用的面方向
    name: string;                   // 构型名称
    desc: string;                   // 构型描述
    preview?: string;               // 预览图资源 ID
    
    /**
     * 构型内容来源（二选一）：
     * - 'primitives': 基础件组合（Box/Wall/Stop/Trigger 拼装）
     * - 'model':      导入的 3D 模型（glb/gltf等资源）
     * - 'texture':    纯贴图平面（用于 2D 环境或广告牌贴花）
     */
    source: 'primitives' | 'model' | 'texture';
    
    /** source='primitives' 时：基础件列表 */
    adjuncts?: FaceAdjunctDef[];    
    
    /** source='model' 或 'texture' 时：资源引用 */
    resource?: ResourceRef;
    
    // ===== AI 友好增强 =====
    description: string;            // 自然语言描述（AI 理解用途）
    tags: string[];                 // 语义标签（AI 搜索匹配）
    useCases: string[];             // 适用场景建议
}

/**
 * 统一资源引用 - 引用一个外部 3D 模型或 2D 贴图作为构型内容
 */
interface ResourceRef {
    /** 资源 ID（支持 IPFS CID、链上 Resource ID 或 URL） 
     *  例如: 'ipfs://Qm...', 'onchain://[ProgramID]/[ResourceID]', 'https://...'
     */
    asset: string;
    /** 资源缩放比例（适配单元尺寸） */
    scale?: [number, number, number];
    /** 资源偏移（相对于面中心） */
    offset?: [number, number, number];
    /** 资源旋转 */
    rotation?: [number, number, number];
    /** 是否生成碰撞体（默认 true） */
    collider?: boolean;
}

/**
 * 构型中的单个基础件定义（source='primitives' 时使用）
 * 位置和尺寸使用相对于面的归一化坐标 [0, 1]
 */
interface FaceAdjunctDef {
    type: 'box' | 'wall' | 'stop' | 'trigger';
    size: [number, number, number];       // 相对于单元尺寸的比例
    offset: [number, number, number];     // 相对于面中心的偏移比例
    rotation: [number, number, number];   // 旋转
    material?: MaterialConfig;            // 材质覆盖
    stop?: boolean;                       // 是否生成碰撞体
    audio?: AdjunctAudio;                 // 可选音效（见 01-types.md）
    event?: Record<string, EventDefinition>;  // 触发器事件
}
```

### 构型示例

**基础件构型**（轻量快速）：

```typescript
const solidWall: FaceVariant = {
    id: 'c0', state: FaceState.Closed, face: ParticleFace.Front,
    name: '实墙', source: 'primitives',
    adjuncts: [
        { type: 'wall', size: [1, 0.02, 1], offset: [0, 0, 0], rotation: [0, 0, 0], stop: true }
    ],
    description: '完全封闭的实体墙壁',
    tags: ['solid', 'basic'], useCases: ['普通房间', '地牢'],
    // ...
};
```

**导入模型构型**（高品质）：

```typescript
const gothicVaultRoof: FaceVariant = {
    id: 'c5', state: FaceState.Closed, face: ParticleFace.Top,
    name: '哥特拱顶', source: 'model',
    resource: {
        // 可以是 IPFS 链接，也可以是链上资源 ID（类似旧版 engine 中的 RESOURCE_ID_ON_CHAIN）
        asset: 'onchain://resource/19',  // 引擎解析到 ID=19，自动加载链上登记的 glb/fbx
        scale: [1, 1, 1],
        collider: true,
    },
    description: '哥特式十字拱顶，带肋枱细节',
    tags: ['gothic', 'cathedral', 'vault', 'ornate'],
    useCases: ['教堂', '城堡大厅', '中世纪地牢'],
    // ...
};
```

---

## 弦粒子数据格式

### 单元数据

```typescript
/**
 * 细分等级
 * 尺寸 = 4m × 0.5^level
 *   level 0 → 4m    level 1 → 2m
 *   level 2 → 1m    level 3 → 0.5m
 */
export type SubdivisionLevel = 0 | 1 | 2 | 3;

/**
 * 弦粒子单元数据
 */
interface ParticleCell {
    /** 单元在网格中的坐标（相对于 Block 原点） */
    position: [number, number, number];   // [gx, gy, gz]
    
    /** 细分等级（0=4m, 1=2m, 2=1m, 3=0.5m） */
    level: SubdivisionLevel;
    
    /** 单元旋转（15° 整数倍，每轴 0-23 → 0°-345°） */
    rotation: [number, number, number];  // [rx, ry, rz]
    
    /** 六面状态和构型选择 */
    faces: ParticleFaceConfig[];          // 长度固定为 6
    
    /** 内置 Trigger（可选） */
    trigger?: CellTrigger;
}

/**
 * 单面配置
 */
interface ParticleFaceConfig {
    face: ParticleFace;
    state: FaceState;
    variant: number;        // 构型索引
}

/**
 * 单元内置触发器
 * 触发器占据整个单元内部空间
 */
interface CellTrigger {
    event: string;              // 事件类型：'in' | 'out' | 'hold' | 'touch'
    actions: TriggerAction[];   // 触发后执行的动作
    onetime: boolean;           // 是否一次性触发
}

interface TriggerAction {
    target: string[];           // 目标路径: [adjunct_type, block_x, block_y, index]
    method: string;             // 动作: 'hide' | 'show' | 'crash' | ...
    value?: any;                // 附加参数
}
```

### 链上存储格式（二进制）

弦粒子作为一种 Adjunct 类型，使用二进制 Chunk 存储在 Block Raw 中。

```
弦粒子 Chunk 布局：
┌──────────────────────────────────────────────────┐
│ Particle Header                       4 bytes    │
│   theme:     u8                                   │  1 byte
│   cellCount: u16                                  │  2 bytes
│   encoding:  u8              (0=raw, 1=rle)       │  1 byte
├──────────────────────────────────────────────────┤
│ Cell ×N (每个 11 bytes)                            │
│   gx:        u8              (网格X，0-255)        │  1 byte
│   gy:        u8              (网格Y，0-255)        │  1 byte
│   gz:        u8              (网格Z，0-255)        │  1 byte
│   meta:      u8                                   │  1 byte
│     bit7-6:  level  (0-3，细分等级)                │
│     bit5-0:  bitmask (6 bits，六面联通状态)          │
│   rx:        u8  (0-23 → 0°-345°，步长 15°)      │  1 byte
│   ry:        u8                                   │  1 byte
│   rz:        u8                                   │  1 byte
│   variants:  [u4×6]                                │  3 bytes
│   trigger:   u8              (0=无, >0=触发器ID)   │  1 byte
└──────────────────────────────────────────────────┘

单元尺寸由 level 决定：size = 4000mm × 0.5^level
网格坐标的步长也随 level 变化：
  level=0→ gx步长 4m, level=1→ gx步长 2m, ...
```
```

```typescript
/**
 * 弦粒子二进制编解码器
 */
const ParticleCodec: BinaryCodec = {
    itemSize: 11,

    encode(cell: ParticleCell, buf: Uint8Array, offset: number): void {
        buf[offset + 0] = cell.position[0];
        buf[offset + 1] = cell.position[1];
        buf[offset + 2] = cell.position[2];

        // meta: level(2 bits) + bitmask(6 bits)
        let bitmask = 0;
        for (let i = 0; i < 6; i++) {
            if (cell.faces[i].state === FaceState.Open) bitmask |= (1 << i);
        }
        buf[offset + 3] = ((cell.level & 0x03) << 6) | (bitmask & 0x3F);

        // rotation: 0-23 per axis
        buf[offset + 4] = cell.rotation[0];
        buf[offset + 5] = cell.rotation[1];
        buf[offset + 6] = cell.rotation[2];

        // variants: 6 × 4-bit
        buf[offset + 7] = (cell.faces[0].variant << 4) | cell.faces[1].variant;
        buf[offset + 8] = (cell.faces[2].variant << 4) | cell.faces[3].variant;
        buf[offset + 9] = (cell.faces[4].variant << 4) | cell.faces[5].variant;

        buf[offset + 10] = cell.trigger ? cell.trigger.templateId : 0;
    },

    decode(buf: Uint8Array, offset: number): ParticleCell {
        const meta = buf[offset + 3];
        const level = (meta >> 6) & 0x03;
        const bitmask = meta & 0x3F;

        const faces: ParticleFaceConfig[] = [];
        const vb = [buf[offset + 7], buf[offset + 8], buf[offset + 9]];
        for (let i = 0; i < 6; i++) {
            const variant = i % 2 === 0
                ? (vb[Math.floor(i / 2)] >> 4) & 0x0F
                : vb[Math.floor(i / 2)] & 0x0F;
            faces.push({
                face: i as ParticleFace,
                state: (bitmask >> i) & 1 ? FaceState.Open : FaceState.Closed,
                variant,
            });
        }

        const triggerId = buf[offset + 10];
        return {
            position: [buf[offset], buf[offset + 1], buf[offset + 2]],
            level: level as SubdivisionLevel,
            rotation: [buf[offset + 4], buf[offset + 5], buf[offset + 6]],
            faces,
            trigger: triggerId > 0 ? getTriggerTemplate(triggerId) : undefined,
        };
    },
};
```

### Bitmask 编码示例

```
bitmask = 0b00110011 = 51

bit5 bit4 bit3 bit2 bit1 bit0
 1    1    0    0    1    1
 R    L    Bk   Fr   Bt   Tp

含义：Top开、Bottom开、Front关、Back关、Left开、Right开
→ 上下和左右可通行，前后有墙壁
```

### RLE 压缩（走廊/大厅优化）

对于连续重复的 cell（如长走廊），使用 RLE 压缩：

```
RLE Header (1 byte):
  bit7-6: direction (0=X, 1=Y, 2=Z)
  bit5-0: length    (1-63 连续重复)

走廊示例：5 个 X 方向相同 cell
  Raw:  11 × 5 = 55 bytes
  RLE:  1 + 11 = 12 bytes (header + 1个cell数据)
  压缩比: 4.6x
```

### 存储空间对比

| 场景 | JSON 数组 | 二进制 Raw | 二进制 + RLE | 节省 |
|------|----------|-----------|-------------|------|
| 10 个 cell | ~500 bytes | 84 bytes | 84 bytes | 83% |
| 100 个 cell | ~5000 bytes | 804 bytes | ~300 bytes | 94% |
| 1000 个 cell | ~50KB | 8004 bytes | ~2.5KB | 95% |

---

## 转换管线

弦粒子沿用引擎标准管线，在 Raw → STD 阶段**展开**为基础件：

```
弦粒子 Raw ──→ 展开 ──→ 基础件集合（Box/Wall/Stop/Trigger STD）──→ 标准 3D 管线
```

### Raw → STD 展开

```typescript
/**
 * 弦粒子 Raw → STD 转换
 * 将每个单元的面配置展开为具体的基础件 STD 数据
 */
function particleRawToStd(raw: ParticleRawData, accuracy: number): STDData {
    const [origin, cells, theme] = raw;
    const variants = getVariantsByTheme(theme);
    
    const result: STDData = {
        block: [],
        box: [],
        wall: [],
        stop: [],
        trigger: [],
    };
    
    for (const cell of cells) {
        const { position, level, rotation, faces, trigger } = cell;
        const [gx, gy, gz] = position;
        
        // 根据 level 计算单元尺寸：4m × 0.5^level
        const unitSize = 4000 * Math.pow(0.5, level);  // mm
        
        // 计算单元的世界空间位置
        const worldPos: Vector3 = {
            x: origin[0] + gx * unitSize,
            y: origin[1] + gy * unitSize,
            z: origin[2] + gz * unitSize,
        };
        
        // 计算单元旋转（15° 步长）
        const cellRotation: Vector3 = {
            x: rotation[0] * 15,
            y: rotation[1] * 15,
            z: rotation[2] * 15,
        };
        
        // 遍历 6 个面
        for (const faceConfig of faces) {
            const { face, state, variant: variantId } = faceConfig;
            
            // 检查相邻单元：如果相邻单元存在且该面也是同状态，跳过
            if (hasAdjacentCell(cells, gx, gy, gz, face, level)) continue;
            
            // 获取构型
            const variant = variants[face][state][variantId];
            if (!variant) continue;
            
            // 展开构型中的每个基础件（应用单元旋转）
            for (const adjDef of variant.adjuncts) {
                const std = expandAdjunct(adjDef, worldPos, unitSize, face, cellRotation, accuracy);
                result[adjDef.type].push(std);
            }
        }
        
        // 处理内置触发器
        if (trigger) {
            result.trigger.push(expandCellTrigger(trigger, worldPos, unitSize, cellRotation));
        }
    }
    
    return result;
}
```

### 相邻消除

当两个单元共享一个面时，只需生成一次构件：

```
单元 A              单元 B
┌──────┐┌──────┐
│      ││      │     A 的 Right 面 和 B 的 Left 面是同一个面
│      A.Right = B.Left      → 只生成一次
│      ││      │
└──────┘└──────┘
```

```typescript
/**
 * 相邻面消除规则
 * 如果两个相邻单元共享的面状态一致，只在低坐标单元生成
 */
const ADJACENT_OFFSET: Record<ParticleFace, [number, number, number]> = {
    [ParticleFace.Top]:    [0, 0, +1],
    [ParticleFace.Bottom]: [0, 0, -1],
    [ParticleFace.Front]:  [0, -1, 0],
    [ParticleFace.Back]:   [0, +1, 0],
    [ParticleFace.Left]:   [-1, 0, 0],
    [ParticleFace.Right]:  [+1, 0, 0],
};

const OPPOSITE_FACE: Record<ParticleFace, ParticleFace> = {
    [ParticleFace.Top]:    ParticleFace.Bottom,
    [ParticleFace.Bottom]: ParticleFace.Top,
    [ParticleFace.Front]:  ParticleFace.Back,
    [ParticleFace.Back]:   ParticleFace.Front,
    [ParticleFace.Left]:   ParticleFace.Right,
    [ParticleFace.Right]:  ParticleFace.Left,
};
```

---

## 空间构建流程

### 1. 填充阶段

用户选择一个空间范围，以弦粒子单元填满：

```typescript
/**
 * 填充一个矩形区域的弦粒子单元
 */
function fillRegion(
    from: [number, number, number],
    to: [number, number, number],
    defaultState: FaceState = FaceState.Closed
): ParticleCell[] {
    const cells: ParticleCell[] = [];
    
    for (let x = from[0]; x <= to[0]; x++) {
        for (let y = from[1]; y <= to[1]; y++) {
            for (let z = from[2]; z <= to[2]; z++) {
                cells.push({
                    position: [x, y, z],
                    level: 0,
                    rotation: [0, 0, 0],
                    faces: Array(6).fill(null).map((_, i) => ({
                        face: i as ParticleFace,
                        state: defaultState,
                        variant: 0,
                    })),
                });
            }
        }
    }
    return cells;
}
```

### 2. 联通性编辑

用户选择面，切换联通/阻断状态，选择构型：

```typescript
/**
 * 切换指定单元的指定面状态
 */
function toggleFace(
    cell: ParticleCell,
    face: ParticleFace,
    state?: FaceState
): void {
    const config = cell.faces[face];
    config.state = state ?? (config.state === FaceState.Open 
        ? FaceState.Closed 
        : FaceState.Open);
    config.variant = 0;  // 切换状态后重置构型为默认
}

/**
 * 选择构型
 */
function setVariant(
    cell: ParticleCell,
    face: ParticleFace,
    variantIndex: number
): void {
    cell.faces[face].variant = variantIndex;
}
```

### 3. 自动生成

系统根据配置自动展开为基础件数据，写入 Block 的 Raw 数据：

```
用户操作                      引擎处理
                              
填充 3×3×2 空间    ──→  生成 18 个单元
                              │
打开走廊联通面     ──→  修改 bitmask
选择拱门构型       ──→  设置 variant
                              │
确认生成           ──→  particleRawToStd()
                              │
                        展开为 Box/Wall/Stop/Trigger
                              │
                        合并入 Block Raw 数据
                              │
                        标准 Pipeline 渲染
```

---

## 主题系统

不同的主题提供不同的构型集合和默认材质：

```typescript
/**
 * 弦粒子主题
 */
interface ParticleTheme {
    id: number;
    name: string;
    // 基础单元固定为 [4,4,4]m，通过 level 细分
    defaultMaterial: MaterialConfig;
    
    // 每个面方向 × 每种状态 = 可用构型列表
    variants: Record<ParticleFace, {
        open: FaceVariant[];    // 联通时的构型选项
        closed: FaceVariant[];  // 阻断时的构型选项
    }>;
    
    // ===== AI 集成 =====
    aiPrompt: string;               // AI System Prompt 片段
    constraints: ThemeConstraint[]; // AI 生成时的约束规则
}

/**
 * 主题约束规则（AI 生成校验用）
 */
interface ThemeConstraint {
    rule: string;                   // 规则标识
    value: number | string;         // 约束值
    message?: string;               // 违规提示
}
```

### 示例主题

```typescript
const theme_dungeon: ParticleTheme = {
    id: 1,
    name: '地牢',
    // 基础单元固定 [4,4,4]m，通过 level 细分
    defaultMaterial: { texture: 102, repeat: [2, 2] },
    variants: {
        [ParticleFace.Top]: {
            closed: [
                { id: 'c0', name: '石天花', adjuncts: [/* Wall 全封 */] },
            ],
            open: [
                { id: 'o0', name: '方形开口', adjuncts: [/* 四边边框 */] },
            ],
        },
        [ParticleFace.Front]: {
            closed: [
                { id: 'c0', name: '实墙', adjuncts: [/* 一面 Wall */] },
                { id: 'c1', name: '带窗墙', adjuncts: [/* Wall + 窗口 Box */] },
                { id: 'c2', name: '半墙', adjuncts: [/* 半高 Wall */] },
                { id: 'c3', name: '栅栏', adjuncts: [/* 多个细 Box 竖排 */] },
                { id: 'c4', name: '带门墙', adjuncts: [/* Wall + 门框 Box + Trigger */] },
            ],
            open: [
                { id: 'o0', name: '全开', adjuncts: [] },
                { id: 'o1', name: '拱门', adjuncts: [/* 拱形 Box 组合 */] },
                { id: 'o2', name: '门框', adjuncts: [/* 三面边框 Box */] },
            ],
        },
        // ... 其他面方向类似
    },
};
```

---

## 与 Trigger 的结合

弦粒子的阻断构型（如"带门墙"）可以包含 Trigger，实现交互式空间变化：

```typescript
// "带门墙" 构型定义
const doorWallVariant: FaceVariant = {
    id: 'c4',
    state: FaceState.Closed,
    face: ParticleFace.Front,
    name: '带门墙',
    desc: '带有可交互门的墙壁',
    adjuncts: [
        // 墙体（门洞左侧）
        {
            type: 'wall',
            size: [0.35, 0.05, 1.0],
            offset: [-0.325, 0, 0],
            rotation: [0, 0, 0],
            stop: true,
        },
        // 墙体（门洞右侧）
        {
            type: 'wall',
            size: [0.35, 0.05, 1.0],
            offset: [0.325, 0, 0],
            rotation: [0, 0, 0],
            stop: true,
        },
        // 墙体（门洞上方）
        {
            type: 'wall',
            size: [0.3, 0.05, 0.2],
            offset: [0, 0, 0.4],
            rotation: [0, 0, 0],
            stop: true,
        },
        // 门板（可开关的 Box）
        {
            type: 'box',
            size: [0.28, 0.02, 0.78],
            offset: [0, 0, -0.1],
            rotation: [0, 0, 0],
            material: { texture: 201 },
            stop: true,
        },
        // 触发器（门前区域）
        {
            type: 'trigger',
            size: [0.4, 0.3, 0.8],
            offset: [0, -0.2, 0],
            rotation: [0, 0, 0],
            audio: {
                resource: { asset: 'sfx/door_creak.ogg' },
                mode: 'trigger',
                volume: 0.7,
                range: 8,
                event: 'in',
            },
            event: {
                type: 'in',
                todo: 'wall.hide',  // 触发时隐藏门板
            },
        },
    ],
};
```

---

## 类型定义汇总

```typescript
// ========== 弦粒子核心类型 ==========

export enum ParticleFace {
    Top = 0, Bottom = 1, Front = 2, Back = 3, Left = 4, Right = 5,
}

export enum FaceState {
    Open = 0, Closed = 1,
}

export type SubdivisionLevel = 0 | 1 | 2 | 3;

export interface FaceAdjunctDef {
    type: 'box' | 'wall' | 'stop' | 'trigger';
    size: [number, number, number];
    offset: [number, number, number];
    rotation: [number, number, number];
    material?: MaterialConfig;
    stop?: boolean;
    audio?: AdjunctAudio;
    event?: Record<string, EventDefinition>;
}

export interface ModelRef {
    asset: string;
    scale?: [number, number, number];
    offset?: [number, number, number];
    rotation?: [number, number, number];
    collider?: boolean;
}

export interface FaceVariant {
    id: string;
    state: FaceState;
    face: ParticleFace;
    name: string;
    desc: string;
    preview?: string;
    source: 'primitives' | 'model';
    adjuncts?: FaceAdjunctDef[];
    model?: ModelRef;
}

export interface ParticleFaceConfig {
    face: ParticleFace;
    state: FaceState;
    variant: number;
}

export interface CellTrigger {
    event: string;
    actions: TriggerAction[];
    onetime: boolean;
    templateId: number;         // 触发器模板 ID（二进制存储用）
}

export interface TriggerAction {
    target: string[];
    method: string;
    value?: any;
}

export interface ParticleCell {
    position: [number, number, number];
    level: SubdivisionLevel;
    rotation: [number, number, number];  // 0-23 per axis, step 15°
    faces: ParticleFaceConfig[];
    trigger?: CellTrigger;
}

export interface ParticleTheme {
    id: number;
    name: string;
    // 基础单元固定 [4,4,4]m，通过 level 细分
    defaultMaterial: MaterialConfig;
    variants: Record<ParticleFace, {
        open: FaceVariant[];
        closed: FaceVariant[];
    }>;
}
```

---

## 相关文档

- [架构概述](../architecture/overview.md) - 系统总体架构（弦粒子是开创性特性之一）
- [类型定义](../api/types.md) - 基础件类型（Box、Wall、Stop、Trigger）
- [框架核心](../systems/framework.md) - Pipeline 数据转换管线
- [AI 集成](../features/ai-integration.md) - AI 驱动的 3D 游戏开发（弦粒子是AI降维的关键）
- [时间维度](../features/time-dimension.md) - 区块链时间驱动的世界演化
