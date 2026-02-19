# 时间维度（Time Dimension）

## 概述

Septopus World 部署在区块链上，每笔写入都携带**不可篡改的时间戳**（slot / block height）。这为游戏世界提供了传统游戏无法实现的能力：**真实的时间维度**。

链上时间的独特属性：

| 属性 | 说明 | 游戏价值 |
|------|------|---------|
| **不可篡改** | 创建时间写入链上，无法修改 | 物品/建筑的"年龄"真实可信 |
| **全局一致** | 所有客户端看到同样的时间 | 天气/季节/老化效果全局同步 |
| **高频** | Solana ~400ms 一个 slot | 足够驱动细粒度模拟 |
| **永久** | 历史 slot 数据永久可查 | 世界有真实的、可回溯的历史 |

> [!IMPORTANT]
> 时间维度不需要修改链上数据——所有效果都在**渲染层**和**客户端逻辑层**计算。链上只存储创建时间（slot），客户端根据 `当前 slot - 创建 slot = 年龄` 推导出一切。

---

## 核心机制

### 年龄计算

```typescript
interface TimeContext {
    /** 当前 Solana slot */
    currentSlot: number;
    /** Block 创建时的 slot */
    creationSlot: number;
    /** 年龄（slot 数） */
    age: number;                // currentSlot - creationSlot
    /** 年龄换算为天（Solana ~216,000 slots/天） */
    ageDays: number;
}

function getTimeContext(blockAccount: BlockAccount): TimeContext {
    const currentSlot = connection.getSlot();
    const creationSlot = blockAccount.slot;
    const age = currentSlot - creationSlot;
    return {
        currentSlot,
        creationSlot,
        age,
        ageDays: age / 216_000,
    };
}
```

### 区块哈希作为确定性随机源

区块哈希天然提供**不可预测但确定性**的随机数序列。可以作为游戏世界的环境模拟输入：

```typescript
/**
 * 从区块哈希中提取环境参数
 * 确定性：同一个 slot 永远产出同样的参数
 * 不可预测：无法提前知道未来 slot 的参数
 */
interface SlotEnvironment {
    sunlight: number;      // 0-15  光照强度
    rainfall: number;      // 0-15  降水量
    temperature: number;   // 0-15  温度
    wind: number;          // 0-15  风力
    event: number;         // 0-15  随机事件（虫害/施肥/雷击...）
}

function parseEnvironment(slotHash: Uint8Array): SlotEnvironment {
    return {
        sunlight:    (slotHash[0] >> 4) & 0x0F,
        rainfall:    slotHash[0] & 0x0F,
        temperature: (slotHash[1] >> 4) & 0x0F,
        wind:        slotHash[1] & 0x0F,
        event:       (slotHash[2] >> 4) & 0x0F,
    };
}
```

---

## 应用场景

### 1. 材质老化

建筑和物体根据年龄自动改变外观，无需更新链上数据：

```
age = 0      → 崭新：棱角分明，颜色鲜亮
age = 30天   → 轻微风化：接缝加深，色彩微暗
age = 365天  → 明显老化：青苔覆盖，裂纹出现
age = 1000天 → 残破：藤蔓缠绕，部分坍塌
```

实现方式——着色器层面：

```glsl
uniform float uAgeDays;
uniform sampler2D uBaseMap;     // 新材质
uniform sampler2D uAgedMap;     // 老化材质（苔藓/裂纹）

void main() {
    float ageFactor = clamp(uAgeDays / 365.0, 0.0, 1.0);
    vec4 base = texture2D(uBaseMap, vUv);
    vec4 aged = texture2D(uAgedMap, vUv);
    gl_FragColor = mix(base, aged, ageFactor);
}
```

### 2. 生长模拟

利用区块哈希序列模拟生物的确定性生长过程：

```
种植一棵树（slot = S）

回放 slot S ~ S+N 的哈希序列：
  每个 slot 的哈希 → 环境参数（光照/水分/温度）
  环境参数 → 生长函数输入
  生长函数 → 树的当前状态（高度/枝叶/果实）

结果：
  ✅ 每棵树因种植时间不同 → 经历不同"天气" → 长成独特形态
  ✅ 任何客户端重新计算 → 得到完全一样的树
  ✅ 无法伪造一棵"千年老树"——必须真的等千年的 slot
```

位置差异化——同一片森林中每棵树独特：

```typescript
function getTreeSeed(slotHash: Uint8Array, position: [number, number, number]): number {
    // 将 slot hash 与位置混合，使同一时刻不同位置的树有不同的生长条件
    return hashCombine(slotHash, positionHash(position));
}
```

### 3. 日夜与季节

```typescript
// Solana ~400ms/slot, ~216,000 slots/天

// 日夜周期：以真实时间的 1/24 映射（1小时 = 1游戏天）
const dayNightCycle = currentSlot % 9_000;   // ~1小时一周期
const timeOfDay = dayNightCycle / 9_000;      // 0.0~1.0

// 季节周期：以 30 天 = 1 游戏年
const seasonCycle = currentSlot % (216_000 * 30);
const season = Math.floor(seasonCycle / (216_000 * 7.5)); // 0=春 1=夏 2=秋 3=冬
```

### 4. 动态天气

天气由区块哈希驱动，不可预测但全局一致：

```typescript
function getWeather(currentSlot: number): Weather {
    const hash = getBlockHash(currentSlot);
    const env = parseEnvironment(hash);

    if (env.rainfall > 12) return 'storm';
    if (env.rainfall > 8)  return 'rain';
    if (env.temperature < 3 && env.rainfall > 5) return 'snow';
    if (env.wind > 13)     return 'windy';
    return 'clear';
}

// 所有客户端对同一个 slot 计算出相同的天气
// 无需服务器同步
```

### 5. 稀有事件

区块哈希可以触发极低概率的世界事件：

```typescript
function checkRareEvent(slotHash: Uint8Array): RareEvent | null {
    // 连续 4 字节全 0xFF → 极光（概率 ~1/4,294,967,296）
    if (slotHash[0] === 0xFF && slotHash[1] === 0xFF
     && slotHash[2] === 0xFF && slotHash[3] === 0xFF) {
        return { type: 'aurora', duration: 1000 };
    }

    // hash[0] === 0x00 → 流星（概率 ~1/256, 约每 100 秒一次）
    if (slotHash[0] === 0x00) {
        return { type: 'meteor', direction: slotHash[1] };
    }

    return null;
}
```

---

## 与弦粒子的结合

时间维度天然与弦粒子系统配合：

```
弦粒子定义空间（静态）     +     时间维度驱动演化（动态）

cell 创建于 slot S                渲染时：
├── 面构型：variant 3（石墙）  →   age=500天 → 石墙长满青苔
├── 内置 trigger              →   某个稀有 hash 触发隐藏门
└── 模型构型（树）            →   回放 hash 序列 → 树长成独特形态
```

时间维度不增加任何链上存储成本——所有计算在客户端完成。

---

## 传统游戏 vs 链上时间的对比

| 维度 | 传统游戏 | 链上时间 |
|------|---------|---------|
| 时间来源 | 服务器时钟（可篡改） | 区块共识（不可篡改） |
| "古老遗迹" | 开发者预设的假年龄 | 真正经历了 N 天的真数据 |
| 稀有物品 | 运营控制发放量 | 数学概率 + 真实等待 |
| 天气同步 | 服务器广播 | 全客户端自行计算，天然一致 |
| 历史验证 | 不可能 | 任何人可回放 slot 序列验证 |
| 世界感 | 静态、无变化 | 活的、有真实时间流逝的 |

---

## 类型定义

```typescript
// ========== 时间维度类型 ==========

export interface TimeContext {
    currentSlot: number;
    creationSlot: number;
    age: number;
    ageDays: number;
}

export interface SlotEnvironment {
    sunlight: number;       // 0-15
    rainfall: number;       // 0-15
    temperature: number;    // 0-15
    wind: number;           // 0-15
    event: number;          // 0-15
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'rain' | 'storm' | 'snow' | 'windy' | 'fog';

export interface RareEvent {
    type: string;           // 事件类型
    duration?: number;      // 持续 slot 数
    [key: string]: any;     // 附加参数
}

export interface GrowthState {
    seed: number;           // 种植时 slot hash + 位置 hash
    age: number;            // 经过的 slot 数
    height: number;         // 当前高度
    branches: number;       // 枝条数
    fruits: number;         // 果实数
    health: number;         // 健康度 0-100
}
```

---

## 相关文档

- [架构概述](./00-overview.md) - 系统整体架构
- [弦粒子系统](./03-string-particle.md) - 空间构建，时间维度在此基础上驱动演化
- [AI 集成](./04-ai-integration.md) - AI 可生成含时间规则的场景
