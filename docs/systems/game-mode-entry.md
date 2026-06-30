# 游戏模式进入契约 (Game-Mode Entry)

进入 **Game 模式不是一个自由开关**，而是**区域门控**的：玩家只有站在一个**声明为可玩**的
block 内，才能（经一次**显式动作**）进入 Game 模式；离开该 block 自动退回 Normal。

> 这条契约的存在是为了**链化后的解释器无关性**：可玩与否是写在 **block 数据本身**（最终上链）的
> **明确可查信息**，触发是从该信息**确定性派生**的，因此**任何解释器**（当前的 TypeScript 3D
> 引擎只是其中一个官方解释器）读同一份数据都得到同一判定。它是旧引擎 `BLOCK_INDEX_GAME_SETTING`
> + `block:in/out` 'mode' 菜单的新引擎继任者。
>
> 实现：`engine/src/core/systems/GameZoneSystem.ts`、`World.setMode` 守卫、
> `engine/src/core/services/Actuator.ts`（`player.enterGame/exitGame`）。

## 1. 三个组成（与三条要求一一对应）

| 要求 | 落地 |
|---|---|
| **明确的可查信息** | block 头部字段 `block.game`（block raw `raw[4]`，`0`=非游戏，`>=1`=可玩）。位于 block 级、随 `BlockSerializer` round-trip、最终上链——解释器**不解 SPP、不扫 adjunct** 即可枚举"哪些 block 可玩"。 |
| **明确的触发** | `GameZoneSystem` 每帧从玩家所在 block 的 `game` 字段派生 `world.gameZoneActive`，并在边界跨越时发 `game.zone_enter` / `game.zone_exit`。每个解释器从**同一字段**算出**同一触发**，不依赖作者手工摆触发体。 |
| **所有解释器一致** | 进入语义由本契约规定（非某一实现私有）：`setMode(Game)` 被守卫，仅在 `gameZoneActive` 时成功；进入需一次**显式玩家动作**；离开 zone 即退出 Game；Game 模式门控触发器/血量/背包等玩法面。表现层（确认按钮长什么样）是各解释器自由发挥的**唯一**部分。 |

## 2. block raw 布局

```
raw = [ elevation, status, adjunctsRaw, animations, game ]
        raw[0]     raw[1]  raw[2]       raw[3]      raw[4]
```

`raw[4]` 缺省视为 `0`（向后兼容旧的 4 元 raw）。`BlockSystem` 注水时
`block.game = raw[4] ?? 0`；`BlockSerializer` 写回 `raw[4] = block.game || 0`。

## 3. 进入/退出流程

```
玩家走入 game>=1 的 block
        │  GameZoneSystem 派生
        ▼
world.gameZoneActive = true ──emit──▶ game.zone_enter
        │
        │  解释器提供"显式动作"（3D 客户端：底部"进入游戏"确认按钮；
        │  或数据驱动：放在可玩 block 内的 b8 触发器 action = player.enterGame）
        ▼
World.setMode(Game)  ── 守卫：!gameZoneActive 则拒绝（force 仅引擎内部/测试）
        ▼
Game 模式（触发器/血量/背包生效；CoasterSystem 等玩法系统运转）
        │
        │  玩家走出 block（或解释器调用 player.exitGame）
        ▼
GameZoneSystem 发 game.zone_exit + 自动 setMode(Normal)
```

**进入的两条等价路径**，都汇入同一个被守卫的 `World.setMode(Game)`：

1. **解释器表现层动作**：客户端在 `game.zone_enter` 后显示确认按钮，点击 → `setMode('game')`。
2. **数据驱动触发**：可玩 block 内放一个 `b8` 触发器，其动作 `{ type:'player', method:'enterGame' }`
   由 `Actuator` 执行 → `setMode(Game)`。因触发器只能在 zone 内 fire，守卫天然满足。

> `player.exitGame` 对称地 `setMode(Normal)`。

## 4. 守卫语义（`World.setMode`）

```ts
setMode(mode, opts?: { force?: boolean }): boolean
```

- 进入 `Game` 且 `!force` 且 `!gameZoneActive` → **拒绝**（返回 `false`，模式不变，告警一次）。
- `force: true` 绕过守卫，仅供**引擎内部 / 测试**使用（不是面向玩家的入口）。
- 返回布尔表示是否真的切换。客户端 UI **以引擎的 `system.mode` 事件为准**反映模式，而非乐观本地状态——这样被拒绝/自动回退都能正确显示。

## 5. 乘骑例外（`world.rideActive`）

`CoasterSystem` 等接管玩家位置的玩法系统在载客时置 `world.rideActive = true`；
此时 `GameZoneSystem` **冻结** zone 追踪——一条跨越 block 边界的轨道**不会**把骑乘中的
玩家甩出 Game 模式（轨道在载客期间是位置权威）。下车（退出 Game）即解除。

## 6. 客户端约定（3D 官方解释器）

- 模式切换器**不含**自由 GAME 按钮（`client/desktop/src/App.tsx`）。
- 站入可玩 zone → 底部出现 `▶ 进入游戏 · Enter Game`（`data-testid="enter-game"`）；
  Game 模式中显示 `■ 退出游戏 · Exit Game`（`data-testid="exit-game"`）。
- `useEngine` 的 `mode` 镜像引擎 `system.mode`（引擎为真相源），`gameZoneActive` 镜像
  `game.zone_enter/exit`。

## 7. 原生在场游戏复用本契约（Pattern B）

`block.game` 有**两类取值**，都经同一套区域门控，但路由不同：

- **外部 app id（`42`=麻将、`43`=台球…）**：`GameRuntimeSystem` 解析成 GameSetting → 进 Game 时 `start` → `game.started`（外部 HUD）。
- **纯可玩标记 `1`**：`gameById(1)` 无记录 → `GameSetting` 解析为 `null` → `GameRuntimeSystem.startGame` 早返回（**不启动外部 app**），只留区域门控。**原生在场游戏**（`PoolSystem`/`MahjongSystem`/`ShootingRangeSystem`，对象即 adjunct、System 持逻辑）用这一类。

原生游戏的生命周期就**绑在本契约上**：`configure` 只**登记(arm)**该块为某游戏 + 参数；System 每帧 `syncSession` 按「`world.mode===Game` 且玩家在该块」**spawn / teardown** 棋子。进入＝明确动作（进入游戏按钮），离开 block ＝ `GameZoneSystem` 自动退回 Normal ＝ 拆局。armed config 留在 System，跨块驱逐保留 → 重入即新一局。详见 `docs/plan/specs/native-in-world-games.md` #3。

## 8. 未实现 / 后续

- **跨多 block 的可玩区**：当前以单 block 可玩区为主（过山车关卡即单 block）。多 block 连续
  可玩区需要把相邻 block 也标 `game>=1`，并解决 Game 模式全量缓存/流式（见
  `docs/plan/specs/coaster-via-spp.md` §9）。
- `game` 目前是标量布尔（`0/1`）；未来可扩为可玩配置 id（指向规则/关卡资源），与旧引擎
  game setting 取资源的语义对齐。
