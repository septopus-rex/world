# Septopus 触发器协议 (Trigger Protocol)

**Septopus 引擎**通过数据驱动的触发器 (Trigger) 系统实现交互逻辑：创作者无需编写脚本，只需定义"事件 + 条件 + 动作"的组合数据，引擎在运行时自动评估并修改世界状态。

触发器是实现玩法逻辑、环境机关和状态变化的主要机制。

> 本文档与引擎实现一一对应：类型定义见 `engine/src/core/types/Trigger.ts`，
> 运行时见 `engine/src/core/systems/TriggerSystem.ts`，
> raw 编解码见 `engine/src/plugins/adjunct/adjunct_trigger.ts`。
> 系统行为层面的说明（生命周期、模式权限、多人感知）见 `docs/systems/trigger.md`。

## 1. 触发器架构

一个触发器（adjunct 类型 `b8`，typeId `0x00b8`）由两部分构成：

- **空间体积 (Volume)**：一个几何判定区（盒子/球体）。纯行走判定的体积完全不渲染；带 `touch` 节点的体积会生成一个**不可见但可被射线命中**的网格（Three.js 中 `visible=false` 仍可被 Raycaster 命中——引擎利用该特性实现"隐形按钮"）。
- **逻辑节点列表 (Logic Nodes)**：挂在同一体积上的一组逻辑。**同一个体积可以绑定多个节点**（如 `in` 开门、`out` 关门、`hold` 计时），同类型的多个节点会**全部**依次触发。每个节点独立持有自己的事件类型、条件、动作与回退动作。

每个逻辑节点的执行流程：

`事件触发 → 评估条件 (JSONLogic) → 真: 执行 actions / 假: 执行 fallbackActions`

## 2. Raw 数据格式（b8 槽位表）

block raw 中一行 `b8` 数据是**位置数组**：

```
[ size, offset, rotation, shape, gameOnly, events ]
```

| 槽位 | 字段 | 类型 | 说明 |
|---|---|---|---|
| 0 | `size` | `[x, y, z]` | 体积尺寸（米），**SPP 轴序**（X东 Y北 Z高），盒子为各轴全长；球体取 `x` 为半径。 |
| 1 | `offset` | `[x, y, z]` | 相对地块原点的位置（米），SPP 轴序，与其他 adjunct 的 `pos` 同语义。 |
| 2 | `rotation` | `[x, y, z]` | **预留**。当前 in/out/hold 的包含判定是轴对齐盒（AABB），不参与旋转；仅 `touch` 的射线命中网格会应用此旋转。 |
| 3 | `shape` | `1` \| `2` | 形状：`1` = 盒子 (Box)，`2` = 球体 (Sphere)。缺省 `1`。 |
| 4 | `gameOnly` | `0` \| `1` | `1` = 仅游戏模式参与评估。**缺省为 `1`**——演示/常驻机关需显式写 `0`。 |
| 5 | `events` | `TriggerLogicNode[]` | 逻辑节点列表，见下文。 |

**坐标说明**：`size`/`offset` 按 SPP 轴序书写，引擎装载时经 `Coords.getBoxDimensions` 等转换到内部轴序，创作者无需关心。

## 3. 事件 (Events)

| 事件 | 触发时机 |
|---|---|
| `in` | 玩家进入体积的那一帧，触发一次（边沿触发）。 |
| `out` | 玩家离开体积的那一帧，触发一次（边沿触发）。 |
| `hold` | 玩家在体积内**累计停留跨过 `holdDuration` 毫秒阈值**的那一帧，触发一次。 |
| `touch` | 玩家的主交互射线（点击 / KeyE）命中该体积时触发，事件由 `RaycastInteractionSystem` 的 `interact` 路由进来。 |

`hold` 细则：
- 停留时长由步进 `dt` 累加（确定性，不依赖墙钟），玩家离开时清零。
- 采用**跨阈值语义**（`prevMs <= D < nowMs`）：每次停留只触发一次；离开再进入后自动重新武装。
- `holdDuration` 缺省/为 0 时，进入后的下一帧即触发。

## 4. 逻辑节点 (Logic Node)

```ts
interface TriggerLogicNode {
    type: "in" | "out" | "hold" | "touch";
    conditions?: JsonLogicRule;       // 可选，JSONLogic 前置条件
    actions: TriggerAction[];         // 条件为真（或无条件）时执行
    fallbackActions?: TriggerAction[]; // 可选，条件为假时执行
    oneTime?: boolean;                // 可选，成功执行一次后即消耗
    holdDuration?: number;            // 仅 hold：停留阈值（毫秒）
}
```

| 字段 | 说明 |
|---|---|
| `type` | 监听的事件类型。 |
| `conditions` | 可选的 JSONLogic 守卫（见 §5）。缺省视为恒真。评估抛错按假处理。 |
| `actions` | 条件满足时执行的动作列表（见 §6）。 |
| `fallbackActions` | 条件**不满足**时执行的动作列表（如提示"先去按按钮"）。注意：这是条件分支的 else，不是旧版协议的"恢复动作"。 |
| `oneTime` | `true` 时该节点在**一次通过性执行**（条件满足且 actions 已跑）后被消耗。走 fallback 不消耗——锁住的门可以反复尝试。**消耗是持久的**：以 `adjunctId#节点键` 计入会话存档（与世界标志位一起进 IndexedDB），跨地块重载与页面刷新均不复活。 |
| `holdDuration` | 仅 `hold` 节点使用。 |

## 5. 条件 (Conditions, JSONLogic)

条件是一条标准 [JSONLogic](https://jsonlogic.com/) 规则，运行时由 `json-logic-js` 对 **WorldContext** 求值：

```json
{ "==": [ { "var": "flags.demo_touch" }, true ] }
```

```json
{ "and": [
    { ">=": [ { "var": "time" }, 0.25 ] },
    { "<":  [ { "var": "time" }, 0.8 ] }
] }
```

### 可用变量 (WorldContext)

| 变量 | 类型 | 说明 |
|---|---|---|
| `player.x` / `player.y` / `player.z` | `number` | 玩家位置（**引擎轴**：`y` 是高度）。`player.position` 为同值数组。 |
| `flags.<key>` | `any` | 世界级标志位（`world.globalFlags`），可由 `flag` 动作写入——触发器之间靠它串联状态。 |
| `inventory.<itemId>` | `number` | 玩家背包中该物品的总数量（如 `inventory.tpl_2` ——"持有钥匙才开门"），见[背包规格](../../docs/plan/specs/inventory-local-first.md)。 |
| `time` | `number` | 世界时间，0–1 浮点（0.5 = 正午）。 |
| `weather` | `string` | 当前天气。 |

多条件用 JSONLogic 自身的 `and` / `or` / `!` 组合，不再有独立的"条件数组默认 AND"约定。

## 6. 动作 (Actions)

```ts
interface TriggerAction {
    type: string;            // 'adjunct' | 'flag' | 'system'
    target: string | number; // adjunctId、flag 键名或系统名
    method: string;
    params: any[];
}
```

| `type` | `target` | `method` | `params` | 效果 |
|---|---|---|---|---|
| `adjunct` | adjunctId，格式 `adj_{bx}_{by}_{type十进制}_{idx}`（如 `adj_2048_2048_161_0` = 该地块第 0 面墙） | `moveZ` | `[米]` | 目标沿 SPP 高度轴平移（同步更新 Transform 与 stdData，碰撞随动）。 |
| | | `rotateY` | `[弧度]` | 目标绕竖直轴旋转。 |
| `flag` | flag 键名 | （空） | `[值]`，缺省 `true` | 写入 `world.globalFlags[target]`，供其他触发器的条件读取。 |
| `bag` | itemId（`tpl_{模板}` / `itm_{模板}_{seed}`） | `give` / `take` | `[数量]` | 给予/扣除玩家背包物品。**仅 Game 模式生效**（其余模式警告跳过）。 |
| `player` | （不使用） | `damage` / `heal` | `[数值]` | 扣减/恢复玩家生命值（HealthSystem；hp≤0 死亡并重生于出生点）。**仅 Game 模式生效**。 |
| `sound` | 音频资源 id（或直接 URL/路径） | `play` | `[音量]` | 3D 空间音效，锚定在触发体位置（无位置则平面播放）。资源经 `ResourceManager.getAudioUrl` 解析（CID/路径），缓冲按 URL 去重。 |
| `system` | （空） | `log` | `[...任意]` | 控制台日志（调试用）。 |

> 动作执行经 **actuator 分层**（P2 已落地）：`TriggerSystem` 只决定触发什么，
> `world.actuator`（`IActuator`，缺省 `LocalActuator`，可经 `WorldDeps.actuator` 注入替换）
> 决定怎么落地——接链时换 contract 实现，trigger 数据零改。旧版协议中的
> "玩家属性修改"动作**尚未实现**（背包已经 `bag` 动作覆盖）。

## 7. 完整示例（取自演示场，可直接运行）

一个体积绑三个节点——进开门、出关门、停留 800ms 记标志：

```json
[[4, 4.5, 6], [8, 11.25, 3], [0, 0, 0], 1, 0, [
  { "type": "in",  "actions": [
      { "type": "adjunct", "target": "adj_2048_2048_161_0", "method": "moveZ", "params": [3.2] },
      { "type": "flag", "method": "", "target": "demo_gate", "params": [true] } ] },
  { "type": "out", "actions": [
      { "type": "adjunct", "target": "adj_2048_2048_161_0", "method": "moveZ", "params": [-3.2] },
      { "type": "flag", "method": "", "target": "demo_gate", "params": [false] } ] },
  { "type": "hold", "holdDuration": 800, "actions": [
      { "type": "flag", "method": "", "target": "demo_hold", "params": [true] } ] }
]]
```

条件门——JSONLogic 守卫 + `oneTime` + 回退提示：

```json
[[2.2, 2, 4], [14.2, 12, 2], [0, 0, 0], 1, 0, [
  { "type": "in", "oneTime": true,
    "conditions": { "==": [ { "var": "flags.demo_touch" }, true ] },
    "actions": [
      { "type": "adjunct", "target": "adj_2048_2048_161_1", "method": "moveZ", "params": [3.2] } ],
    "fallbackActions": [
      { "type": "system", "method": "log", "target": "", "params": ["先去按圆锥按钮 (demo_touch)"] } ] }
]]
```

## 8. 安全上下文 (Security Contexts)

触发器服从世界模式的执行权限约束：

- **Edit（编辑）/ Ghost（幽灵）模式**：所有触发器禁用，排队中的点击也被丢弃。
- **Normal（浏览）/ Game（游戏）模式**：触发器正常评估。
- `gameOnly = 1` 的体积仅在 Game 模式参与评估（**这是缺省值**）。

**多人感知**：体积按参与者实体分别记录"是否在体内"与停留时长，多个玩家互不影响彼此的进入/停留/退出状态。

## 9. 数据精简与压缩 (Compaction)

### 设计取舍

旧版协议用 `[寻址数组, 运算符编号, 数值]` 三元组表达条件，目的是**数据结构精简**（链上字节即成本）。现行协议改用标准 JSONLogic，换来的是：表达力（任意嵌套逻辑）、现成的求值器（`json-logic-js`，不自研解释器）和工具链兼容。代价是明文体积更大。

### 精简路径（机械、无损）

JSONLogic 的结构本质是 `{操作符: [参数...]}` 的树，可以**无损展平为位置数组** `[操作符编号, 参数...]` ——这正是旧三元组格式的一般化。动作对象同理可位置化。例如演示场中的"条件门"节点：

| 形态 | 字节 |
|---|---|
| 明文 JSON（现行存储） | 348 B |
| 展平位置数组 + 操作符/动作类型编号表 | 145 B（≈ 2.4×） |
| 再叠字符串字典（adjunctId / flag 路径在地块级去重）+ 二进制编码（CollapseCodec / CBOR）+ gzip | 进一步压缩，视重复度通常再得 2–4× |

无条件的简单节点同样有效（107 B → 51 B）。

### 分层原则（重要）

**压缩是编解码层的事，不是创作与运行时的事。**

```
创作/运行时        序列化层 (serialize)          存储/链上
标准 JSONLogic ⇄  展平 + 字典 + 二进制 + gzip  ⇄  紧凑字节
```

- 创作者书写、引擎求值的**永远是标准 JSONLogic**（`TriggerSystem` 不感知压缩）。
- 展平/还原发生在 `serialize`/`deserialize`（`adjunct_trigger.ts` 的 Attribute 层），与 raw 的其余槽位走同一条 CollapseCodec 管线。

### 现状

**尚未实现。** 当前 `events` 以明文 JSON 存于 raw 槽位 5——本地 IndexedDB 持久化与 gzip 传输下字节压力可忽略。紧凑编码计划与 **P4 上链发布**同期落地（链上字节才是真实成本），届时只需新增一层编解码，存量明文数据可一次性迁移，运行时零改动。

## 10. 与旧版协议的差异（迁移对照）

| 旧版 | 现行 | 说明 |
|---|---|---|
| 节点字段 `event` | `type` | 改名。 |
| `runOnce: 0\|1` | `oneTime: boolean` | 改名 + 语义收紧：仅通过性执行消耗。 |
| `exitConditions` + `recovery`（恢复动作） | **未实现** | `fallbackActions` 是条件不满足的 else 分支，**不是**恢复动作。状态恢复需显式写反向节点（如 `out` 关门）。 |
| 条件三元组 `[寻址, 运算符0-5, 数值]` | JSONLogic 规则 | 见 §5；紧凑编码见 §9。 |
| 动作数组 `[寻址, 修改选项, 数值, 动画索引]` | `{type, target, method, params}` 对象 | 动画索引过渡**未实现**（动作即时生效）。 |
| `shape: 0/1/2`（盒/球/圆柱） | `1` 盒 / `2` 球 | 圆柱未实现；编号变更注意。 |
| 寻址数组（系统/附属物/玩家/背包） | adjunctId 字符串 / flag 键名 / `bag` itemId | 背包目标已由 `bag` 动作实现（Game 模式）；玩家属性目标未实现。 |

**向后兼容**：raw 槽位 5 若是旧式的**平铺动作数组**（元素不带 `in/out/hold/touch` 节点类型），装载时自动包装为单个无条件 `in` 节点。
