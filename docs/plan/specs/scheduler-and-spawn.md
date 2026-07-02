# F1 — 运行时调度 / 定时器 / 通用生成(Scheduler & Spawn)

> 状态:**已实现(2026-07-02)**。F 系列第一项——NPC(F2)、战斗(F3)、任务(F4)
> 都踩着它走。设计预决策见 `GAME_SYSTEMS_BACKLOG.md`「F 系列统一设计模式」,本文照此展开。
> 落点:`core/services/Scheduler.ts`(纯类)+ `systems/ScheduleSystem`(LiveSystem 后)
> + `systems/SpawnerSystem`(AdjunctSystem 后)+ `utils/Spawn.ts spawnRelative`(共享生成路径)
> + `plugins/adjunct/adjunct_spawner.ts`(b9)+ Actuator delay/spawn/despawn +
> `BlockSystem.despawnRuntime`(authored 拒绝)。测试:`unit/scheduler.test.ts`(6)
> + `systems/scheduler-spawn.test.ts`(7,全生命周期)。客户端 e2e(palette 放 b9 →
> 走近刷出 → 驱逐 → 重刷)记入 e2e 全量欠账,机器空闲时补。

## 0. 统一模式(照抄预决策,本 spec 的公理)

```
authored 源(adjunct,进 block raw)→ 运行时派生实体(不受块驱逐绑架)
定义(模板/文档,协议推导)      → 实例(运行时态,不持久化)
条件 = JSONLogic 上下文            → 效果 = actuator 词汇
定时 = 仿真时间(dt 累积)          → 门控 = 世界时间(进条件上下文)
```

**时间公理**:定时器一律跑**仿真时间**(`step(dt)` 累积)——确定性 = `protocol/game.md §9`
重放可验证的前提。世界时间(链高度历法,`world.md §3.1`)只作 JSONLogic 条件源
(`{"var":"world.hour"}`),**永不驱动定时器**(链高度会跳,挂定时器会补发/跳段)。
零 `setTimeout`/墙钟(既有铁律)。

---

## 1. 数据词汇(协议面)

### 1.1 actuator 新动作(3 个)

`TriggerAction` 形状保持 `{type, target, method, params}`,新增**可选嵌套字段 `actions`**
(向后兼容,老数据不受影响):

```jsonc
// delay:N 秒后执行嵌套动作(一次性)
{ "type": "delay", "target": "", "method": "", "params": [2.5],
  "actions": [ { "type": "flag", "target": "gate_open", "method": "", "params": [true] } ] }

// spawn:在当前块生成一个 authored 实体(inline 模板)
{ "type": "spawn", "target": "", "method": "", "params": [ 0x00a2, [[1,1,1],[8,8,1],[0,0,0],2,[1,1],0,0] ] }
//                                              params = [typeId, rawRow(模板,pos 相对语义见 §2.3)]

// despawn:销毁一个运行时生成的实体
{ "type": "despawn", "target": "<adjunctId>", "method": "", "params": [] }
```

- `delay` 由 `LocalActuator` 转交 `world.scheduler`(§3),到期后逐条执行 `actions`
  (执行上下文 = 调度时快照的 `{playerId, blockEid, mode?}`,mode 按**到期时**现值重查——
  延时跨模式切换时权限矩阵仍成立,`gameonly` 双层控制不被 delay 绕过)。
- `spawn` 复用 `BlockSystem.spawnAdjunct`(现成 public API)——生成物是**标准 adjunct 实体**
  (碰撞/触发/LOD/渲染装配全部白拿),落在动作上下文的当前块。
- 纯 C 案例(trigger 数据)即可使用全部三个动作,零专用代码。

### 1.2 Spawner adjunct(新类型 `b9 = 0x00b9`)

块内 authored 生成器——「每 N 秒在这里刷一个,场上最多 M 个」:

```
raw 行 = [ pos, template, interval, maxAlive, autoStart, seed ]

pos       [E, N, Alt]   spawner 锚点(块内局部,同其他 adjunct)
template  [typeId, rawRow]  生成模板;rawRow 的 pos 槽 = 相对 spawner 锚点(§2.3)
interval  number(秒)   生成间隔(仿真时间)
maxAlive  number         同时存活上限;有实体被 despawn/销毁后,下个间隔补位
autoStart 0|1            块载入即武装(1)/ 等 actuator 启动(0,预留 v2)
seed      uint32         确定性随机源(mulberry32,协议同 item.md §2;v1 保留字段)
```

- 注册进 `AdjunctRegistry`(golden 测试 16→17);编辑器 palette 随注册自动出现;
- spawner 自身渲染为小标记(编辑模式可见,普通模式 invisible——同 b8 trigger 惯例)。

### 1.3 生成物的身份:复用 `derivedFrom`

生成的实体标 `derivedFrom = <spawner adjunctId>`——**与 SPP/motif 展开产物同一机制**,白拿三件事:

1. `BlockSerializer` 跳过(生成物**永不烘进 draft**——"可推导之物不持久化");
2. 块驱逐时随块销毁(adjunct 实体天然生命周期);
3. 观测/census 口径统一(现有测试基建直接可用)。

## 2. 语义规则(Normative)

### 2.1 确定性

- 调度器持**仿真时间累积器**(`simTime += dt`,World 级),任务按 `(dueTime, seq)` 排序;
  同帧多个到期按**注册序**执行;
- 同一 `(初始状态, dt 序列)` 重放 → 定时器触发帧**逐帧一致**(game.md §9 前提);
- 大 dt 跨过多个到期点:**逐个补发,不合并**(repeat 任务在一帧内可触发多次)。

### 2.2 持久化:**不存**(决策)

未到期的定时器**不随 reload 持久化**——重进块由 spawner/trigger 重新武装
(同「armed config 跨驱逐保留→重入即新局」的街机柜哲学;也符合"可推导之物不持久化")。
延时中的 `delay` 动作跨 reload 丢弃——authored 内容不应依赖跨会话的悬挂定时器。

### 2.3 spawn 位置语义:模板 pos 相对 spawner

模板 `rawRow` 的 pos 槽 = **相对 spawner 锚点的偏移**。实现走通用路径(不逐类型硬编码
pos 槽位):`deserialize(rawRow) → std.ox/oy/oz += spawner 锚点 → serialize → spawnAdjunct`
——复用每个 adjunct 类型自己的 `attribute` 序列化器,任意类型可生成。

### 2.4 生命周期

- 生成物挂靠 spawner 所在块(`parentBlockEntityId`):**块驱逐 → 随块销毁**(根除悬空实体,
  原生游戏 teardown 的教训);重进块 → spawner 重新武装 → 按 interval 重新生成;
- `maxAlive` 计数 = 场上 `derivedFrom === spawnerId` 的存活实体数;
- spawner 自身被删(编辑器)→ 其生成物同帧全部销毁(同 SPP `destroyDerived` 语义)。

## 3. 实现设计

### 3.1 `ScheduleSystem`(新,core/systems)

- **注册位置:`LiveSystem` 之后、`CharacterController` 之前**——"时间输入"与外部输入同段,
  到期动作在本帧后续系统(trigger/物理/渲染)可见;
- 每帧:`simTime += dt` → 弹出所有 `dueTime <= simTime` 的任务按序执行;
- 代码 API(Pattern B 游戏 / 引擎内部可用):
  ```ts
  world.scheduler.after(seconds, () => {...}): TaskHandle    // 一次性
  world.scheduler.every(seconds, () => {...}): TaskHandle    // 周期(返回句柄可 cancel)
  world.scheduler.cancel(handle)
  ```
  回调仅允许改 world 状态/发事件(与 System update 同权限);数据面(§1.1)在其上构建。

### 3.2 `SpawnerSystem`(或并入 ScheduleSystem,实现时定)

块载入时扫描 b9 → `autoStart` 者注册 `every(interval)` 任务;任务体:数 `maxAlive` →
不足则 §2.3 生成。块驱逐时 cancel 其任务(句柄随 spawner 实体存)。

### 3.3 事件

- `spawn.created` `{ adjunctId, spawnerId?, typeId }`(帧作用域队列,观测/任务钩子用);
- `spawn.removed` `{ adjunctId, reason: 'despawn'|'evict'|'spawner_deleted' }`。

## 4. 测试计划

- **确定性**:固定 dt 步进,delay/every 触发帧断言逐帧一致;两次重放同帧一致;
- **补发语义**:大 dt 跨两个到期点 → repeat 触发两次;
- **actuator 面**:trigger 数据 `delay`→嵌套动作到期执行;`spawn`→实体出现(标准装配:
  Solid/Raycast/Mesh);`despawn`→消失 + `spawn.removed`;
- **spawner**:interval 生成、maxAlive 封顶、despawn 后补位、块驱逐清干净(零悬空)、
  重进块重新武装、**draft 保存不烘生成物**(serializer skip);
- **权限**:`delay` 嵌套的 `bag`/`player` 动作在到期时按当时 mode 校验(gameonly 不被绕过);
- e2e(客户端):放一个 b9 → 走近看刷出 → 走远块驱逐 → 回来重新刷。

## 5. 不做的(v1 边界)

- 跨块 spawn(动作上下文块之外)——v2 按需;
- spawner 的 start/stop actuator 控制(`autoStart=0` 路径)——字段预留,v2;
- 定时器持久化——**有意不做**(§2.2 决策);
- cron 式日历调度(「每天 20:00」)——用世界时间条件 + repeat 组合表达,不进调度器;
- seed 驱动的模板随机化(掉落表式 spawn)——seed 槽已留,F3 掉落需求出现时启用。
