# Inventory — local-first design & implementation spec

Status: **P0–P2 implemented**（2026-06）。P3+（多人 L3 同步、链上原子交换）为规划。

取代链耦合时代的设计稿 `docs/features/inventory.md`（已标注 historical）。
该旧稿中**与链无关的两个核心思想被保留**：

1. **物品以 Adjunct 形式存在于 Block**——物品是世界内容，进 block raw，
   自动获得 DraftStore 持久化、JSON 导出/导入、未来上链的全部既有管线。
2. **seed 确定性推导属性**——链上/本地只存 `seed`，稀有度与属性由纯函数推导，
   跨客户端一致、不可伪造。

被替换的部分：以 Solana 交易为执行原语 → 改为 **actuator 分层**（与 trigger P2
同一抽象）：纯模式 `LocalActuator` 本地原子操作，接链时换注入实现。

## 架构总览

```
ItemRegistry（模板表 + seed 推导，纯函数）
      │
b5 item adjunct（raw: [pos, templateId, seed, count, rot]）
      │  BlockSystem 装载 → ItemComponent + 可点击网格
      ▼
ItemSystem ── interact(点击) ──→ 本地原子拾取:
      │     1. 背包容量预检（满则中止，无副作用）
      │     2. pickup_item → InventorySystem 入包（堆叠/容量/广播）
      │     3. 销毁实体 + 网格 + 资源引用
      │     4. 重序列化 block raw → DraftStore（= 旧设计"Block 移除+背包写入"的本地原子版）
      │
      └── dropItem(API) ──→ 反向：背包扣减 + block raw 追加 + 实时生成实体 + draft
      ▼
InventorySystem ──变更──→ DraftStore.saveMeta(0,'inventory',items)（IndexedDB worlds store）
      │                    Engine.hydrateDrafts() 启动时还原
      ▼
inventory_updated 事件 ──→ 客户端 React 背包面板（显示/丢弃）
```

Trigger 集成（P2）：
- **条件**：JSONLogic WorldContext 增加 `inventory.<itemId>` 计数映射——
  `{">=": [{"var": "inventory.tpl_2"}, 1]}` 即"有钥匙才开门"。
- **动作**：`{type:'bag', target:<itemId>, method:'give'|'take', params:[count]}`，
  经 `IActuator` 执行，**仅 Game 模式生效**（game.md 权限矩阵）。

## 数据格式

### b5 item adjunct（typeId `0x00b5`）

raw 行 = `[ pos, templateId, seed, count, rot ]`：

| 槽位 | 字段 | 说明 |
|---|---|---|
| 0 | `pos` `[x,y,z]` | SPP 轴序，相对地块原点（米） |
| 1 | `templateId` | ItemRegistry 模板 id |
| 2 | `seed` | 属性推导种子（0 = 无随机属性） |
| 3 | `count` | 数量，缺省 1 |
| 4 | `rot` `[x,y,z]` | 可选旋转 |

视觉（形状/尺寸/颜色）来自模板的 `visual` 字段，不进 raw——同模板同外观，
raw 保持最小。稀有度对颜色做确定性提亮。

### 物品身份（itemId）

- 可堆叠模板（`stackable > 0`）：`tpl_{templateId}`——同模板合并堆叠，seed 不参与身份。
- 不可堆叠（`stackable === 0`）：`itm_{templateId}_{seed}`——每件唯一，
  `metadata: {templateId, seed}` 随背包项保存，属性按需重推导。

### ItemTemplate（注册于 `core/services/ItemRegistry.ts`）

```ts
{ id, name, category, stackable,
  visual: { shape: 'box'|'sphere'|'cone', size: [x,y,z], color },
  attributes: [{ name, baseRange: [min,max], rarityScale }],
  rarityWeights: number[] }   // Common..Legendary 权重
```

`deriveItemAttributes(template, seed)`：mulberry32 种子 RNG → `{rarity, attributes}`。
纯函数、无墙钟、无 Math.random——同 seed 必同结果。
内置演示模板：`1` gem（不可堆叠，魔力/光泽随机）· `2` key（可堆叠）· `3` potion（可堆叠）。

熵源：本地模式由内容作者写定 seed 或经 `feedChainState` 的 height/hash 派生
（与时间/天气同通道）；接链后即真区块哈希，性质不变。

## 持久化

- **世界侧**（物品在哪、还在不在）：进 block raw → DraftStore（既有 P1 基建）。
- **玩家侧**（背包内容）：`IDraftBackend` 新增 `loadMeta/saveMeta(worldId, key, value)`，
  IndexedDB 落在 DB "septopus" 的 `worlds` store（P1 建库时预留）；
  InventorySystem 每次变更后写 `key='inventory'`，`Engine.hydrateDrafts()` 启动还原。
- 世界 JSON 导出（ExportService）**不含背包**——背包是玩家状态，不是世界内容。

## 模式权限（沿用 game.md 矩阵）

| 操作 | Normal | Game | Edit / Ghost |
|---|---|---|---|
| 点击拾取 / dropItem | ✅ | ✅ | ❌ |
| trigger `bag` 动作（give/take） | ❌（警告跳过） | ✅ | ❌（trigger 整体禁用） |
| trigger `inventory.*` 条件 | ✅ | ✅ | — |

## Actuator 分层（P2，trigger 动作执行）

```ts
interface IActuator { kind: string; execute(action: TriggerAction, ctx: ActuatorContext): void }
class LocalActuator  // adjunct / flag / system / bag 全量本地实现
```

- `World` 构造默认 `LocalActuator`，可经 `WorldDeps.actuator` 注入替换
  （与 renderer/draftBackend 同款模式）。
- `TriggerSystem` 不再自持动作执行逻辑，统一 `world.actuator.execute(...)`。
- 接链（P4）：`ContractActuator` 把 bag/adjunct 动作转链上交易，trigger 数据零改。

## 分期与状态

| 期 | 内容 | 状态 |
|---|---|---|
| P0 | `bag.max` 接线（死配置激活）· JSONLogic `inventory.*` 上下文 · 背包 IndexedDB 持久化 | ✅ |
| P1 | b5 item adjunct · 原子拾取/丢弃 · React 背包面板 · 演示场物品 | ✅ |
| P2 | IActuator/LocalActuator · bag give/take（Game 门控）· ItemRegistry + seed 推导 · 钥匙门演示 | ✅ |
| P3 | 多人 L3 `"inventory"` 同步（WebRTC，事件驱动格式见 game.md §7.3） | 规划 |
| P4 | ContractActuator：链上原子交换 / 物品账户（旧稿思路作为后端接回） | 规划 |

## 已知边界

- 拾取的"原子性"是单帧同步语义（无并发写者）；多人/链上时代由 actuator 后端保证。
- 物品掉落实体（`spawn_drop`，临时漂浮掉落物）与 b5 adjunct 并存：前者是运行时
  临时物（不持久化），后者是世界内容。
- ~~`Engine.setMode` 仍缺~~ **已补齐**（2026-06-12）：`Engine.setMode` +
  客户端四模式切换器落地，Game 模式 bag/player 动作用户可达。
