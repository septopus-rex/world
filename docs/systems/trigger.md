# 事件与触发器系统 (Event & Trigger)

Septopus 的组件解耦和逻辑驱动依赖事件总线（Event Bus）与实体级触发器（Trigger）。

> 数据格式契约见 [触发器协议](../../protocol/cn/trigger.md)；实现位于
> `engine/src/core/systems/TriggerSystem.ts` 与 `engine/src/plugins/adjunct/adjunct_trigger.ts`。

## 1. 事件总线

**现状**：引擎当前运行的是朴素总线——`World.on/off/emitSimple`，事件为
`GameEvent` 信封 `{type, payload, source}`，emit 时同步调用全部订阅回调。
触发器相关的跨系统通讯目前只有一条：`RaycastInteractionSystem` 发出的
`interact` 事件（玩家点击/按 E 命中某实体）被 `TriggerSystem` 订阅，路由为 `touch` 触发。

**目标态**：帧作用域双缓冲队列、emit 不直接跑回调、类型化 EventMap、
实体级精准路由（EntityId + 稳定 `adj:`/`blk:` 键的双键定向投递）——完整设计与
PR-0..7 迁移计划见 [事件总线设计规格](../plan/specs/event-bus-design.md)，**尚未实施**。
本页旧版描述的"强类型全局事件总线 + 对象级绑定"即指该目标态，勿当作现状引用。

## 2. 触发器系统 (Trigger)

触发器（adjunct `b8`）本质是一个包围体形状的逻辑判定区，是游戏模式下世界互动的核心组件。

### 组成结构

- **空间体积 (Volume)**：盒子或球体判定区。纯行走判定的体积不渲染；带 `touch`
  节点的体积生成一个**不可见但可被射线命中**的网格充当"隐形按钮"。
- **逻辑节点列表 (Logic Nodes)**：同一体积可绑定多个节点（`in` 开门、`out` 关门、
  `hold` 计时各自独立），同类型多个节点全部依次触发。

### 生命周期（与实现一致）

1. **`in`**：玩家坐标落入包围体的那一帧触发一次（边沿触发）。
2. **条件评估**：节点可携带一条 JSONLogic 规则（`conditions`），对 WorldContext
   （`player.*` / `flags.*` / `inventory.*` / `time` / `weather`）求值。无条件视为恒真。
3. **动作执行**：条件为真执行 `actions`，为假执行 `fallbackActions`（如提示
   "先去拿钥匙"）。动作经 `world.actuator`（`IActuator`，缺省 `LocalActuator`，
   可注入替换——接链时换 contract 实现）落地。当前动作面：`adjunct`
   （moveZ / rotateY，开门、升降）、`flag`（写世界标志位）、`bag`
   （give/take 背包物品，**仅 Game 模式**）、`system`（日志）。
4. **`hold`**：累计停留**跨过** `holdDuration` 毫秒阈值时触发一次；时长由步进 dt
   累加（确定性），离开清零、再进入自动重新武装。
5. **`out`**：离开包围体的那一帧触发一次。

节点可声明 `oneTime`，在一次**通过性执行**（条件满足且动作已跑）后被消耗；
走 fallback 不消耗，锁住的门可反复尝试。

> 旧设计中的"恢复动作"（退出条件 + 自动回滚缓存原貌）**未实现**：状态恢复需显式
> 写反向节点（`in` 开门 / `out` 关门就是一对）。玩家属性类动作未实现；
> 背包动作已由 `bag`（经 actuator 层）覆盖，见
> [背包规格](../plan/specs/inventory-local-first.md)。

### 多人感知的运行时

体积按**参与者实体**分别记录"是否在体内"与停留毫秒数。游戏模式下接入的多个玩家
（WebRTC 多人）会被独立评估，互不影响彼此的进入/停留/退出状态。

### 模式权限 (Data Security)

| 模式 | 触发器行为 |
|---|---|
| **Edit（编辑）** | 全部禁用（编辑器操作不应误触机关），排队点击一并丢弃 |
| **Ghost（幽灵）** | 全部禁用 |
| **Normal（浏览）** | 正常评估；`gameOnly = 1` 的体积除外 |
| **Game（游戏）** | 全部评估 |

体积级 `gameOnly` 标志声明"仅游戏模式参与评估"，**raw 缺省值为 1**——常驻机关需显式写 0。

展望：触发器若涉及背包等高危修改（未实现），主网模式下仅在本地会话生效，
除非经合约调用上链固化——刷新即重置。

### 数据精简

旧版条件三元组是为链上字节成本设计的；现行 JSONLogic 换取表达力与现成求值器，
其紧凑编码（展平位置数组 + 字典 + 二进制，约 2.4× 起）作为**编解码层**方案预留，
与 P4 上链同期落地，运行时不感知——详见 [触发器协议 §9](../../protocol/cn/trigger.md)。
