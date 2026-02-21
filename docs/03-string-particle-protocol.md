# 弦粒子二进制协议（String Particle Binary Protocol）

> [!NOTE]
> **授权声明**：弦粒子协议（String Particle Protocol）由 [@ff13dfly](https://github.com/ff13dfly) 独立维护于 [spp-protocol](https://github.com/ff13dfly/spp-protocol) 仓库。该协议已正式授权 Septopus World 项目在开源实现及商业应用中使用。

> 版本：1.1  
> 状态：草案

## 概述

本文档定义弦粒子在**链上存储的二进制格式**——即三层架构中的 **Layer 2（塌陷状态层）**。

```
Layer 1: 全状态定义 (IPFS)     ← protocol.md
Layer 2: 塌陷状态 (链上)       ← 本文档
Layer 3: 运行时 (引擎)         ← 03-string-particle.md
```

弦粒子的完整定义（所有 cell、所有候选项、模型、材质）存储在 IPFS 上。链上只存储两样东西：

1. **IPFS CID**：指向全状态定义（32 bytes，一次性）
2. **塌陷选择**：每个 cell 每面选了候选集中的第几个（4 bytes/cell）

> [!IMPORTANT]
> 链上不存储 position / level / bitmask / faceOptions——这些全在 IPFS 的定义中。链上只记录"观测结果"（塌陷选择），引擎通过 CID 获取完整定义后，结合塌陷选择展开为具体空间。

---

## 1. 基本单元（Particle Cell）

### 1.1 空间定义

弦粒子的基础单元是一个**等大立方体**：

| 属性 | 值 | 说明 |
|------|-----|------|
| 基础尺寸 | `[4, 4, 4]` 米 | 固定，不可配置 |
| 细分 | `0.5^level` | level 0-3，最小 0.5m |
| 面数 | 6 | Top/Bottom/Front/Back/Left/Right |
| 面状态 | Open / Closed | 联通 / 阻断 |

### 1.2 细分等级

```
level   尺寸          网格步长      一个 level-0 等价于
  0     4 × 4 × 4m    4m           1 个
  1     2 × 2 × 2m    2m           8 个
  2     1 × 1 × 1m    1m           64 个
  3     0.5×0.5×0.5m  0.5m         512 个
```

### 1.3 面方向

```typescript
enum ParticleFace {
    Top    = 0,    // Z+
    Bottom = 1,    // Z-
    Front  = 2,    // Y-
    Back   = 3,    // Y+
    Left   = 4,    // X-
    Right  = 5,    // X+
}
```

### 1.4 面状态

```typescript
enum FaceState {
    Open   = 0,    // 联通（可通行）
    Closed = 1,    // 阻断（生成构件）
}
```

---

## 2. 单元数据结构

### 2.1 逻辑结构

```typescript
interface ParticleCell {
    /** 网格坐标（相对于 Block 原点） */
    position: [number, number, number];   // u8 × 3, 范围 0-255
    
    /** 细分等级 */
    level: SubdivisionLevel;              // 0-3
    
    /** 单元旋转（15° 整数倍） */
    rotation: [number, number, number];   // u8 × 3, 每轴 0-23
    
    /** 六面状态掩码 */
    bitmask: number;                      // u6, 每 bit 对应一个面
    
    /** 六面构型索引 */
    variants: [number, number, number, number, number, number];  // u4 × 6
    
    /** 内置触发器模板 ID（0=无） */
    triggerId: number;                    // u8
}

type SubdivisionLevel = 0 | 1 | 2 | 3;
```

### 2.2 Bitmask 编码

6 个 bit 分别对应 6 个面的状态（1=Open, 0=Closed）：

```
bit:    5     4     3     2     1     0
面:   Right  Left  Back  Front Bottom Top

示例：bitmask = 0b110011 = 51
  Top=Open, Bottom=Open, Front=Closed, Back=Closed, Left=Open, Right=Open
  → 左右上下可通行，前后有墙
```

### 2.3 旋转编码

每轴 24 个方向，步长 15°：

```
值      角度
0       0°
1       15°
6       90°
12      180°
23      345°

实际角度 = rotation_value × 15°
```

### 2.4 构型索引

每面 4 bit（0-15），索引引用当前主题中对应面方向、对应状态下的构型列表：

```
variant = 0  → 该面该状态的第 0 号构型（通常是默认构型）
variant = 1  → 第 1 号构型
...
variant = 15 → 第 15 号构型（最多 16 种构型/面/状态）
```

---

## 3. 链上二进制编码

### 3.1 Chunk 布局

```
┌──────────────────────────────────────────────────┐
│ Header                            44 bytes        │
│   definitionCID: bytes32  IPFS 全状态定义的哈希     │  32 bytes
│   cellCount:     u16      单元数量（大端序）        │   2 bytes
│   encoding:      u8       编码方式 (0=raw, 1=rle) │   1 byte
│   flags:         u8       标记位                  │   1 byte
│ ── 放置信息 ──                                     │
│   originX:       u8       Block 内 X 锚点          │   1 byte
│   originY:       u8       Block 内 Y 锚点          │   1 byte
│   originZ:       u8       Block 内 Z 锚点          │   1 byte
│   baseLevel:     u8       基准细分等级 (0-3)        │   1 byte
│   layerId:       u8       堆叠层 ID                │   1 byte
│   reserved:      [u8; 3]  保留                    │   3 bytes
├──────────────────────────────────────────────────┤
│ Cell Data        N × 4 bytes (raw) 或 RLE 压缩    │
└──────────────────────────────────────────────────┘
```

`origin` 定义弦粒子在 Block 内的放置锚点（基于 baseLevel 的网格坐标）。
弦粒子的覆盖范围 `bounds` 存储在 IPFS 全状态定义中，引擎通过 `origin + bounds` 计算实际占用区域。

同一 Block 内可通过不同的 `layerId` 堆叠多组弦粒子（如地基层 + 装饰层 + 机关层）。

### 3.2 Cell 二进制布局（4 bytes/cell）

链上每 cell 只存塌陷选择——position/level/bitmask/faceOptions 全在 IPFS 定义中。

```
Offset  Size  Field           描述
──────  ────  ─────           ────
 0      u8    collapseIdx01   bit7-4: face[0] 选了第几个候选
                              bit3-0: face[1] 选了第几个候选
 1      u8    collapseIdx23   bit7-4: face[2] 选了第几个候选
                              bit3-0: face[3] 选了第几个候选
 2      u8    collapseIdx45   bit7-4: face[4] 选了第几个候选
                              bit3-0: face[5] 选了第几个候选
 3      u8    triggerId       触发器模板 ID (0=无)
```

每面 4 bit → 最多 16 个候选项，与 IPFS 定义中 `faceOptions[i]` 数组的索引对应。

### 3.3 编解码器

```typescript
const CollapseCodec = {
    HEADER_SIZE: 44,
    CELL_SIZE: 4,

    // ── Header ──

    encodeHeader(h: CollapseHeader, buf: Uint8Array, offset: number): void {
        buf.set(h.cid, offset);                             // 32 bytes CID
        buf[offset + 32] = (h.cellCount >> 8) & 0xFF;
        buf[offset + 33] = h.cellCount & 0xFF;
        buf[offset + 34] = h.encoding;
        buf[offset + 35] = h.flags;
        buf[offset + 36] = h.originX;
        buf[offset + 37] = h.originY;
        buf[offset + 38] = h.originZ;
        buf[offset + 39] = h.baseLevel;
        buf[offset + 40] = h.layerId;
        buf[offset + 41] = 0;  buf[offset + 42] = 0;  buf[offset + 43] = 0;  // reserved
    },

    decodeHeader(buf: Uint8Array, offset: number): CollapseHeader {
        return {
            cid: buf.slice(offset, offset + 32),
            cellCount: (buf[offset + 32] << 8) | buf[offset + 33],
            encoding: buf[offset + 34],
            flags: buf[offset + 35],
            originX: buf[offset + 36],
            originY: buf[offset + 37],
            originZ: buf[offset + 38],
            baseLevel: buf[offset + 39],
            layerId: buf[offset + 40],
        };
    },

    // ── Cell ──

    encodeCell(collapseIndices: [number, number, number, number, number, number], triggerId: number, buf: Uint8Array, offset: number): void {
        buf[offset + 0] = (collapseIndices[0] << 4) | collapseIndices[1];
        buf[offset + 1] = (collapseIndices[2] << 4) | collapseIndices[3];
        buf[offset + 2] = (collapseIndices[4] << 4) | collapseIndices[5];
        buf[offset + 3] = triggerId;
    },

    decodeCell(buf: Uint8Array, offset: number): { collapseIndices: [number, number, number, number, number, number]; triggerId: number } {
        return {
            collapseIndices: [
                (buf[offset + 0] >> 4) & 0x0F, buf[offset + 0] & 0x0F,
                (buf[offset + 1] >> 4) & 0x0F, buf[offset + 1] & 0x0F,
                (buf[offset + 2] >> 4) & 0x0F, buf[offset + 2] & 0x0F,
            ],
            triggerId: buf[offset + 3],
        };
    },
};

interface CollapseHeader {
    cid: Uint8Array;
    cellCount: number;
    encoding: number;
    flags: number;
    originX: number;
    originY: number;
    originZ: number;
    baseLevel: number;
    layerId: number;
}
```

---

## 4. RLE 压缩


当 `encoding = 1` 时，Cell Data 使用 Run-Length Encoding 压缩连续重复的塌陷选择。

### 4.1 RLE 格式

```
RLE Entry:
┌──────────────────────────────────────┐
│ RLE Header          1 byte           │
│   bit7-6: direction (0=X, 1=Y, 2=Z) │
│   bit5-0: length    (1-63)           │
├──────────────────────────────────────┤
│ Cell Data           4 bytes          │
└──────────────────────────────────────┘

含义：从该 cell 的顺序位置开始，沿 direction 方向
     连续 length 个 cell 共享相同的塌陷选择和 triggerId
```

### 4.2 压缩效果

```
场景                  Raw 大小          RLE 大小          压缩比
10 个散落 cell        44 + 40 = 84B     84B (无重复)      1.0x
5 格直线走廊          44 + 20 = 64B     44 + 5 = 49B     1.3x
10×10 平面大厅        44 + 400 = 444B   44 + 50 = 94B    4.7x
10×10×3 立体空间      44 + 1200= 1244B  44 + 150 = 194B  6.4x
```

---

## 5. 触发器模板引用

Cell 的 `triggerId: u8` 引用一个预注册的触发器模板：

```
ID    说明
0     无触发器
1-254 引用 TriggerTemplate 注册表
255   保留
```

触发器模板的具体内容（事件类型、动作列表）由引擎侧管理，链上协议只传递 ID。

---

## 6. 约束规则

### 6.1 链上数据约束

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| definitionCID | bytes32 | — | IPFS 全状态定义的内容哈希 |
| cellCount | u16 | 0-65535 | 单元数量 |
| encoding | u8 | 0-1 | 编码方式 |
| collapseIndex | u4 | 0-15 | 每面的塌陷选择索引 |
| triggerId | u8 | 0-255 | 触发器模板 ID |

### 6.2 语义约束

1. **CID 有效性**：`definitionCID` 必须指向一个有效的 IPFS 全状态定义。
2. **cell 数量一致**：`cellCount` 必须与 IPFS 定义中的 cell 数量一致。
3. **索引范围**：每面的 `collapseIndex` 不得超出 IPFS 定义中对应 `faceOptions[i]` 数组的长度。超出时引擎回退到索引 `0`。
4. **封闭面忽略**：当 IPFS 定义中某面的 `faceState = 0`（封闭）时，对应的 `collapseIndex` 应为 `0`，引擎忽略该值。

---

## 7. 版本兼容

### 7.1 当前版本

- 协议版本：`1.1`
- Cell 大小：`4 bytes`（塌陷选择）
- Header 大小：`44 bytes`（含 32-byte CID + 8-byte 放置信息）

### 7.2 扩展策略

1. **向后兼容**：通过 Header 的 `reserved` 字节标识扩展版本。
2. **字段扩展**：在 cell 末尾追加字段，旧版引擎读到 4 bytes 即停止。
3. **不破坏已有数据**：已上链的塌陷状态永远有效，IPFS 上的定义不可变（CID = 内容寻址）。

---

## 8. 编码示例

### 8.1 最小示例：1 个 cell

IPFS 定义中的 cell[0]: 6 面各有 2 个候选项。
塌陷选择：全部选第 0 个候选，无触发器。

```
Header (44 bytes):
  <32 bytes CID>      definitionCID
  00 01               cellCount = 1
  00                   encoding = raw
  00                   flags = 0
  02 03 00             origin = [2, 3, 0]
  01                   baseLevel = 1
  00                   layerId = 0
  00 00 00             reserved

Cell (4 bytes):
  00                   face[0]=0, face[1]=0
  00                   face[2]=0, face[3]=0
  00                   face[4]=0, face[5]=0
  00                   triggerId = 0

Total: 48 bytes
```

### 8.2 走廊示例：不同塌陷

5 格走廊，IPFS 定义中每面有 3 个候选项 [实墙, 拱门, 门框]。
前 3 格选实墙(0)，后 2 格选拱门(1)：

```
Header (44 bytes):
  <32 bytes CID>
  00 05               cellCount = 5
  00                   encoding = raw
  00                   flags = 0
  00 00 00             origin = [0, 0, 0]
  00                   baseLevel = 0
  01                   layerId = 1 (装饰层)
  00 00 00             reserved

Cell 0-2 (各 4 bytes):
  00  00  00  00       全部 face 选第 0 个，无 trigger

Cell 3-4 (各 4 bytes):
  11  11  11  00       全部 face 选第 1 个，无 trigger

Total: 44 + 20 = 64 bytes
```

---

## 9. 维度退化（Dimensional Degeneracy）

弦粒子协议天然支持低维场景——2D 和 2.5D 是 3D 的特例，**不需要任何协议改动**。

### 9.1 退化规则

| 维度 | 固定面 | 有效塌陷选择 |
|------|--------|-------------|
| **3D** | 无 | 全部 6 面 |
| **2D 俯视** | Top/Bottom 恒封闭 | 仅 face[2]-face[5] 有意义 |
| **2.5D 侧视** | Front/Back 恒封闭 | 仅 face[0]-face[1], face[4]-face[5] 有意义 |

### 9.2 协议层无需感知维度

```
一套二进制格式 ──→ 2D 平面地牢（俯视角）
               ──→ 2.5D 侧视平台跳跃
               ──→ 3D 立体迷宫

编解码器完全一致，4 bytes/cell
维度约束由 IPFS 定义中的 faceStates 控制
```

2D 俯视图中，Top/Bottom 面的构型变成了**地板和天花板纹理**——虽然恒为 Closed，但 variant 索引依然有效，可以选择不同的地板样式。
---

## 相关文档

- [SPP-Core 语义协议](./protocol.md) - Layer 1 全状态定义和三层架构总览
- [弦粒子系统](./03-string-particle.md) - Layer 3 引擎侧实现（展开算法、构型定义、主题系统）
- [类型定义](./01-types.md) - 基础 Adjunct 类型和 Audio 类型
- [框架核心](./02-framework.md) - Pipeline 和二进制编解码阶段
- [AI 集成](./04-ai-integration.md) - AI 生成弦粒子 JSON 的工作流
