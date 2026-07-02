# Septopus Item (物品) 协议

物品是**可拾取、可携带、可推导**的世界内容。协议的核心设计：一件物品实例只存
`{templateId, seed}` 两个数——稀有度与全部属性由**纯种子函数**推导。任何客户端 / 任何引擎
对同一 `(template, seed)` 必须算出**同一件物品**；一切可推导之物永不持久化（也不可伪造）。

> **规范级（Normative）**：本文件钉死推导算法的每一步。参考实现
> `engine/src/core/services/ItemRegistry.ts`；改这里的任何公式必须同步改本规格。
> 设计背景见 `docs/plan/specs/inventory-local-first.md`。

## 1. 数据模型

**物品实例**（存储/传输形）：
```
{ templateId: number, seed: number (uint32), count?: number }
```

**物品模板**（世界内容——由宿主/世界注册，引擎不内置任何模板；demo 目录在
`engine/src/core/mocks/ItemTemplates.ts`，属 mock 内容）：
```ts
ItemTemplate = {
  id: number,
  name: string,
  category: 0 Material · 1 Consumable · 2 Equipment · 3 Key · 4 Collectible,
  stackable: number,          // 0 = 唯一（身份含 seed，永不堆叠）；>0 = 每格堆叠上限
  visual: { shape: 'box'|'sphere'|'cone', size: [x,y,z] (SPP 序, 米), color: 0xRRGGBB },
  attributes: AttributeRule[],  // 属性规则，顺序即抽取顺序（见 §3）
  rarityWeights: number[],      // Common..Legendary 概率权重
}
AttributeRule = { name: string, baseRange: [lo, hi], rarityScale: number }
```

**稀有度**：`0 Common · 1 Uncommon · 2 Rare · 3 Epic · 4 Legendary`。

## 2. PRNG（规范）：mulberry32

种子取 `seed >>> 0`（uint32）。每次调用产出 `[0,1)` 浮点，全部运算为 **uint32 环**：

```
state = seed >>> 0
next():
  state = (state + 0x6D2B79F5) >>> 0
  t = state
  t = imul(t XOR (t >>> 15), t OR 1)
  t = t XOR (t + imul(t XOR (t >>> 7), t OR 61))
  return ((t XOR (t >>> 14)) >>> 0) / 4294967296
```

`imul` = 32 位有符号整型乘法（截断到 32 位）。任何引擎必须逐位复现该序列。

## 3. 推导算法（规范——调用顺序即协议）

对 `(template, seed)`，取一个新 PRNG 实例，**严格按以下顺序消耗随机数**：

**第 1 抽 · 稀有度**：
```
weights = rarityWeights 非空 ? rarityWeights : [1]
total   = Σ max(0, w)
roll    = next() × (total 为 0 时取 1)
从 i=0 起累减 max(0, weights[i])，首个使 roll < 0 的 i 即 rarity；无命中 → Common(0)
```

**第 2..N 抽 · 属性**（**按 `template.attributes` 数组顺序**，每条规则恰好消耗一次 `next()`）：
```
base  = lo + next() × (hi − lo)
value = floor(base × (1 + rarity × rarityScale))
```

> 顺序敏感：插入/重排属性规则会改变所有后续抽取——模板一经发布，`attributes` 顺序不可变。

## 4. 身份与堆叠（规范）

```
stackable > 0  →  身份 = "tpl_{id}"          （同模板合并为一叠）
stackable = 0  →  身份 = "itm_{id}_{seed>>>0}" （每件唯一）
```

## 5. 稀有度显示色（规范公式）

基色向白提亮：`k = min(1, rarity × 0.18)`，每通道 `c' = min(255, round(c + (255−c) × k))`。
（公式为纯整数运算、可移植；渲染管线的后续色调映射属渲染器自定义。）

## 6. 在世界中的落点

- **b5 adjunct**（可拾取物）raw：`[pos, templateId, seed, count, rot]` —— 见 adjunct 协议。
- 拾取/丢弃为原子操作（背包变更 + block raw 重序列化同帧完成，`ItemSystem`）。
- JSONLogic 条件可读 `inventory.*`（如门锁检查钥匙数量）。
