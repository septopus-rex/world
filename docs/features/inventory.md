# 背包系统（Inventory System）

## 概述

背包系统需要解决的核心问题：**物品存在于 Block（链上空间）中，玩家需要拾取、携带、使用、丢弃、交易这些物品。** 在链上架构中，每一步都涉及数据归属和状态转移。

### 核心挑战

| 操作 | 传统游戏 | 链上世界 |
|------|---------|---------|
| 拾取 | 服务器删除场景物品、加入背包 | Block 移除 Adjunct + 玩家账户写入 |
| 丢弃 | 反向操作 | 玩家账户删除 + Block 写入 Adjunct |
| 交易 | 数据库更新 | 链上原子交换 |
| 随机生成 | 服务器 RNG | 区块哈希确定性生成 |
| 物品属性 | 服务端定义 | 链上不可篡改 |

---

## 物品数据模型

### 物品定义

```typescript
/**
 * 物品实例（链上存储）
 */
interface Item {
    /** 物品唯一 ID（链上地址或自增 ID） */
    id: string;
    /** 物品模板 ID（引用 ItemTemplate） */
    templateId: number;
    /** 生成时的 slot（用于时间维度演化） */
    birthSlot: number;
    /** 生成时的区块哈希种子（决定随机属性） */
    seed: number;
    /** 当前所有者（玩家公钥 或 Block 坐标） */
    owner: string;
    /** 物品状态 */
    state: ItemState;
    /** 动态属性（由 seed + birthSlot 确定性推导） */
    // 注意：不存储推导属性，客户端实时计算
}

enum ItemState {
    InWorld = 0,       // 在场景中（作为 Adjunct 存在于 Block）
    InInventory = 1,   // 在玩家背包中
    Equipped = 2,      // 已装备
    InTrade = 3,       // 交易锁定中
}

/**
 * 物品模板（定义物品种类）
 */
interface ItemTemplate {
    id: number;
    name: string;
    category: ItemCategory;
    /** 场景中的视觉表现（作为 Adjunct 时的外观） */
    worldModel: ModelRef;
    /** 背包中的图标 */
    icon: string;
    /** 可堆叠数量（0=不可堆叠） */
    stackable: number;
    /** 属性生成规则（基于 seed 推导） */
    attributes: AttributeRule[];
    /** 稀有度分布 */
    rarityWeights: number[];  // 对应 Rarity 枚举的概率权重
}

enum ItemCategory {
    Material = 0,      // 材料
    Consumable = 1,    // 消耗品
    Equipment = 2,     // 装备
    Key = 3,           // 钥匙/道具
    Collectible = 4,   // 收藏品
}

enum Rarity {
    Common = 0,
    Uncommon = 1,
    Rare = 2,
    Epic = 3,
    Legendary = 4,
}
```

### 属性的确定性推导

物品的随机属性**不存储在链上**——它们由 `seed` 确定性推导，任何客户端算出的结果都一样：

```typescript
/**
 * 从种子确定性推导物品属性
 * seed 相同 → 属性一定相同（跨客户端一致）
 */
function deriveItemAttributes(template: ItemTemplate, seed: number): DerivedAttributes {
    const rng = createSeededRNG(seed);
    
    // 稀有度
    const rarity = weightedSelect(template.rarityWeights, rng.next());
    
    // 各属性根据模板规则和稀有度推导
    const attrs: Record<string, number> = {};
    for (const rule of template.attributes) {
        const base = rule.baseRange[0] + rng.next() * (rule.baseRange[1] - rule.baseRange[0]);
        const rarityMultiplier = 1 + rarity * rule.rarityScale;
        attrs[rule.name] = Math.floor(base * rarityMultiplier);
    }
    
    return { rarity, attributes: attrs };
}

interface AttributeRule {
    name: string;             // 属性名：'damage', 'defense', 'glow', ...
    baseRange: [number, number]; // 基础值范围
    rarityScale: number;      // 稀有度对该属性的加成系数
}
```

---

## 随机物品生成

### 场景中的物品生成

物品可以通过三种方式出现在场景中：

#### 1. 预置物品（创建 Block 时放入）

由创作者/AI 在 Block 数据中直接放置：

```json
{
    "adjunct": "item",
    "param": {
        "templateId": 42,
        "position": [2.0, 3.0, 0.5]
    }
}
```

#### 2. Trigger 生成（踩到机关后刷出）

```typescript
// Trigger Action：生成物品
{
    target: ["item_spawner"],
    method: "spawn",
    value: {
        templateId: 42,
        // seed 自动从当前 slot hash + 位置生成
    }
}
```

#### 3. 区块哈希驱动的定时刷新

类似时间维度中的稀有事件机制：

```typescript
/**
 * 检查某个 Block 在当前 slot 是否应该刷新物品
 */
function checkItemSpawn(block: Block, currentSlot: number): SpawnResult | null {
    const hash = getBlockHash(currentSlot);
    const spawnSeed = hashCombine(hash, blockPositionHash(block.coord));
    const rng = createSeededRNG(spawnSeed);
    
    // 每 ~10,000 slots（约 1 小时）检查一次
    if (currentSlot % 10_000 !== 0) return null;
    
    const roll = rng.next();
    if (roll < 0.01) {
        // 1% 概率生成稀有物品
        return {
            templateId: selectRareItem(rng),
            seed: spawnSeed,
            position: randomPositionInBlock(block, rng),
        };
    }
    return null;
}
```

> [!IMPORTANT]
> 因为 seed 来自区块哈希，物品的属性在生成瞬间就被"锁定"了。即使物品还没被任何人发现，它的稀有度和属性已经确定——任何人到达该位置都会看到同样的物品。

---

## 拾取与丢弃

### 拾取流程

```
玩家走到物品附近 → 触发拾取 Trigger
    │
    ├── 客户端验证：背包是否有空位
    │
    ├── 链上交易（原子操作）：
    │   ├── 1. 从 Block 的 Adjunct 列表中移除该物品
    │   ├── 2. 在玩家账户的背包数据中写入该物品
    │   └── 3. 更新物品 state: InWorld → InInventory
    │
    └── 渲染更新：场景中物品消失，背包 UI 更新
```

```typescript
/**
 * 拾取物品（链上交易）
 */
async function pickupItem(
    player: PublicKey,
    blockCoord: BlockCoord,
    itemId: string,
): Promise<TransactionSignature> {
    // 构建原子交易：同时修改 Block 和玩家账户
    const tx = new Transaction();
    
    tx.add(
        // 指令 1：从 Block 移除物品 Adjunct
        removeAdjunctInstruction(blockCoord, itemId),
        // 指令 2：向玩家背包添加物品
        addToInventoryInstruction(player, itemId),
    );
    
    return sendTransaction(tx);
}
```

### 丢弃流程

拾取的逆过程——从背包移除，写入当前所在 Block：

```typescript
async function dropItem(
    player: PublicKey,
    blockCoord: BlockCoord,
    itemId: string,
    position: [number, number, number],
): Promise<TransactionSignature> {
    const tx = new Transaction();
    tx.add(
        removeFromInventoryInstruction(player, itemId),
        addAdjunctInstruction(blockCoord, itemId, position),
    );
    return sendTransaction(tx);
}
```

> [!NOTE]
> 丢弃物品到他人的 Block 需要该 Block 允许"公共丢弃"权限，否则只能丢在自己拥有的 Block 中。

---

## 背包存储

### 链上数据结构

```typescript
/**
 * 玩家背包（链上账户）
 */
interface PlayerInventory {
    owner: PublicKey;
    /** 背包容量 */
    capacity: number;
    /** 物品槽位 */
    slots: InventorySlot[];
}

interface InventorySlot {
    itemId: string;         // 物品实例 ID
    templateId: number;     // 模板 ID（冗余，加速查询）
    count: number;          // 堆叠数量
    acquiredSlot: number;   // 获得时的 slot（可用于时间维度）
}
```

### 存储成本

```
每个背包槽位：
  itemId:       32 bytes（Solana PublicKey）
  templateId:    2 bytes
  count:         2 bytes
  acquiredSlot:  8 bytes
  ─────────────────
  每槽 ≈ 44 bytes

20 个槽位的背包 = 880 bytes + 少量 header ≈ 1 KB
Solana 租金 ≈ $0.007

极低成本，每个玩家一个背包账户即可
```

---

## 特殊宝石示例

回答原始问题——"如何捡起一块随机生成的特殊宝石"：

### 完整流程

```
1. 宝石生成
   ├── 触发方式：玩家踩到弦粒子中某个 cell 的 Trigger
   ├── seed = hash(当前 slot hash, block 坐标, cell 位置)
   ├── 由 seed 推导：颜色=蓝, 稀有度=Rare, 魔力=47, 光泽=82
   └── 场景中出现一颗闪烁的蓝色宝石 Adjunct

2. 宝石渲染
   ├── 模型：ItemTemplate.worldModel（一个闪光宝石 glb）
   ├── 颜色/光效：由推导属性动态调整材质
   └── 时间维度：放置越久 → 光泽略增（客户端渲染效果）

3. 拾取
   ├── 玩家靠近 → 拾取 Trigger 触发
   ├── 链上原子交易：Block 移除 + 背包写入
   └── 物品 seed 永久保存 → 属性永不变化

4. 在背包中查看
   ├── 客户端从 seed 推导属性并显示
   ├── 显示：蓝色宝石 ⭐⭐⭐ Rare | 魔力 47 | 光泽 82
   └── 显示：生成于 Block[3,5] / slot 342,851,207

5. 交易/展示
   ├── 其他玩家可验证：seed → 属性推导一致
   └── 无法伪造属性——seed 来自不可篡改的区块哈希
```

---

## 与其他系统的关系

```
弦粒子                    背包系统                 时间维度
┌───────────┐            ┌───────────┐           ┌───────────┐
│ Trigger   │──生成──→   │ Item      │←──演化──  │ 区块哈希   │
│ 机关触发   │            │ 物品实例   │           │ 确定性属性  │
│ 物品刷新点  │            │ 拾取/丢弃  │           │ 时间老化   │
└───────────┘            │ 链上交换   │           └───────────┘
                         └───────────┘
                              │
                         跨 Block 规则
                         ├── 拾取：Block owner 允许
                         ├── 丢弃：需要目标 Block 权限
                         └── 交易：链上原子交换，无需信任
```

---

## 类型定义汇总

```typescript
// ========== 背包系统类型 ==========

export interface Item {
    id: string;
    templateId: number;
    birthSlot: number;
    seed: number;
    owner: string;
    state: ItemState;
}

export enum ItemState {
    InWorld = 0,
    InInventory = 1,
    Equipped = 2,
    InTrade = 3,
}

export interface ItemTemplate {
    id: number;
    name: string;
    category: ItemCategory;
    worldModel: ModelRef;
    icon: string;
    stackable: number;
    attributes: AttributeRule[];
    rarityWeights: number[];
}

export enum ItemCategory {
    Material = 0,
    Consumable = 1,
    Equipment = 2,
    Key = 3,
    Collectible = 4,
}

export enum Rarity {
    Common = 0,
    Uncommon = 1,
    Rare = 2,
    Epic = 3,
    Legendary = 4,
}

export interface AttributeRule {
    name: string;
    baseRange: [number, number];
    rarityScale: number;
}

export interface PlayerInventory {
    owner: PublicKey;
    capacity: number;
    slots: InventorySlot[];
}

export interface InventorySlot {
    itemId: string;
    templateId: number;
    count: number;
    acquiredSlot: number;
}

export interface DerivedAttributes {
    rarity: Rarity;
    attributes: Record<string, number>;
}
```

---

## 相关文档

- [架构概述](../architecture/overview.md) - 系统总体架构
- [框架核心](../systems/framework.md) - 跨 Block 规则、TriggerSystem
- [弦粒子系统](../features/spp.md) - 物品刷新点（Trigger）
- [AI 集成](../features/ai-integration.md) - AI 可设计物品分布
- [时间维度](../features/time-dimension.md) - 区块哈希驱动随机属性和定时刷新
