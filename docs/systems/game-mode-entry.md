# 游戏模式进入契约 (Game-Mode Entry)

进入 **Game 模式不是一个自由开关**。一个"游戏"由**挂在对象上的 game trigger 声明**（**不是写在 block 上**），
玩家**经一次显式动作**（走到机器前点击 / 走进入口）触发该 trigger 进入 Game；这局怎么**收场**由该游戏
自带的 **`exitPolicy`** 决定（走出即销毁 / 弹框确认 / 存档重入）。

> **设计现状（务必先读，2026-07-03 校准）**：本文描述的是**校正后的目标设计**，已**部分落地**。
> `exitPolicy` 已**声明化**：game trigger 的 `enterGame` 动作携带 `exitPolicy`（`Actuator.ts:297-299`
> 写入 `World.gameExitPolicy`，`World.ts:258`），其中 **`ephemeral` ✅**（走出 block 静默退，
> `GameZoneSystem.ts:78`）、**`confirm` ✅**（走出时**保活**并发 `game.leave_intent` →
> `DesktopLoader.ts:342` → `LeaveGameDialog.tsx` 弹框），**`persistent` 🔲 未实现**（暂按
> `ephemeral` 兜底，`SystemMode.ts:47` 注 "Treated as 'ephemeral' for now"）。仍待建：`enterGame`
> 携带 `gameId`/`origin`（**"一块多台"尚不成立**）、block 降级为粗粒度位（状态见 §8）。

> **解释器无关性（保留）**：游戏声明是**规范块数据**（trigger 是 block adjunct 数据的一部分，最终上链），
> 任何解释器（当前 TS 3D 引擎只是其一）读同一份声明 → 同一行为。block 另留一个**可选的粗粒度
> "此处可玩"位**，让地图/索引**不解码 adjunct** 也能枚举"哪些块有游戏"（保住原契约最看重的便宜枚举性）。
> 旧引擎对照：`BLOCK_INDEX_GAME_SETTING` + `block:in/out` 'mode' 菜单的新引擎继任者。
>
> 实现入口：`engine/src/core/systems/GameZoneSystem.ts`、`World.setMode` 守卫、
> `engine/src/core/services/Actuator.ts`（`player.enterGame/exitGame`）、`GameRuntimeSystem`（gameId→GameSetting 解析）。

## 图例

✅ 已实现 · 🟡 设计已定 / 部分实现 · 🔲 待建

## 1. 声明在哪：trigger 携带游戏（block 只留粗粒度位）

| 信息 | 落点 | 状态 |
|---|---|---|
| **富声明**：玩什么 `gameId` + 在哪 `origin`/`footprint` + 参数 + `exitPolicy` | **game trigger**（`b8` + `enterGame` 动作把这些放进 `action.params`）。**一块可放多个** → 一排扭蛋机、一屋街机柜各自一台。 | 🟡 `exitPolicy` 已随 `enterGame` 落地（`Actuator.ts:297-299`）；`gameId`/`origin` 🔲 待建（`enterGame` 现不带 `gameId`，"一块多台"尚不成立） |
| **粗粒度"此处可玩"位** | block `raw[4]`，仅表示"本块含 ≥1 个游戏"，**不带**玩什么/在哪/参数。给地图打点、链上**不解码 adjunct** 的便宜枚举。可由"块内是否有 game trigger"派生。 | 🟡 现为 `block.game`，**承担了全部声明**（待降级为粗位） |

**为什么从 block 迁到 trigger**：block 级标量 ＝ **一块一游戏**，放不下一排扭蛋机；且它把"**哪里能玩**"
（粗、块够用）和"**玩什么 + 在哪台机器 + 什么参数**"（细、对象级）**挤在了同一层**。富声明天然属于对象 →
放 trigger；block 只留粗位。

**block raw 布局**（`raw[4]` 缺省 `0`，向后兼容 4 元 raw；`BlockSystem` 注水 `block.game = raw[4] ?? 0`，
`BlockSerializer` 写回 `raw[4] = block.game || 0`）：

```
raw = [ elevation, status, adjunctsRaw, animations, game ]
        raw[0]     raw[1]  raw[2]       raw[3]      raw[4]  ← 目标：降级为粗粒度"此处可玩"位
                                        └ adjunctsRaw 里的 b8 game trigger = 富声明所在
```

## 2. exitPolicy：一局怎么收场（三档）

游戏**玩法规则不分轻重**（触发器、背包当筹码、血量、点击交互**都一样**）；轻 / 重的差别**只在会话生命周期**。
因此**不新增第二个 `SystemMode`**（`mode===Game` 已在 **12+ 处**门控玩法——触发器 `gameOnly`、`bag`/`player`
actuator、health、移动、Coaster、3 个原生游戏的 `syncSession`——分叉一个 `GameLite` 必漏），而是给**每个游戏
声明**一个 `exitPolicy`（思路同 `TriggerSystem` 已有的 per-trigger `gameOnly`）：

| `exitPolicy` | 退出语义 | 适用 | 状态 |
|---|---|---|---|
| `ephemeral` | 走出 block **静默销毁**、不存档（街机柜：走了就结束） | 扭蛋机、打靶、单机小局 | ✅ 已声明化（缺省档；`GameZoneSystem.ts:78` 静默 `setMode(Normal)`） |
| `confirm` | 走出**游戏区域**弹确认框，确认才销毁（防误踩丢局） | 单局麻将/台球等已投入几分钟的 | ✅ 全链路已实现（`GameZoneSystem.ts:76-77` 发 `game.leave_intent` 且**保活** → `DesktopLoader.ts:342` → `LeaveGameDialog.tsx` 弹框） |
| `persistent` | 离开**存档**、重入续局；需区域预加载 / 不淘汰 | 副本、长局、跨多块场地 | 🔲 待建（**暂按 `ephemeral` 兜底**，`SystemMode.ts:47`；依赖区域预载，见 §8） |

> `confirm` **不需要**区域/预载，只是"走出时拦一下、发 `game.leave_intent` 让客户端弹框"，成本极低，却把
> "silent loss"这个真痛点也一并解决。`ephemeral` 天生单块，不受 §8 多块问题影响。

## 3. 进入 / 退出流程（目标）

```
玩家走到游戏对象前 ── 显式动作（点击 / 走进入口）── 触发 game trigger
        │  trigger 动作 = player.enterGame(gameId, params, exitPolicy)
        ▼
Actuator 执行 enterGame
        │  ├─ 解析 GameSetting（GameRuntimeSystem，dataSource.gameSetting(gameId)，已有）
        │  └─ 武装对应游戏：外部 app（GameRuntime+HUD）/ 原生 System / 纯数据
        ▼
World.setMode(Game)  ── 守卫：无有效游戏入口上下文则拒绝（force 仅引擎内部/测试）
        ▼
Game 模式（触发器/血量/背包生效；原生 System / CoasterSystem 运转）
        │
        │  按 exitPolicy 收场：
        │   ephemeral  → 走出 block：静默 setMode(Normal) + 拆局
        │   confirm    → 走出区域：发 game.leave_intent → 客户端弹框 → 确认才退/拆
        │   persistent → 走出区域：存档 → setMode(Normal)；重入续局
        ▼
退出 Game（player.exitGame 对称地手动退出，任何档可用）
```

**关键复用**：现成的"`gameId` → `GameSetting` 解析"管道（`GameRuntimeSystem`，`:41` `resolveSetting(world, ev.payload.game)`
→ `dataSource.gameSetting(id)`）**不变**——只是 `gameId` 的**来源**从"`block.game` 经 `game.zone_enter`"改成
"trigger 的 `enterGame` 参数"。`gameId` 路由两类（与现状一致）：

- **已注册外部 app id（`42`=麻将、`43`=台球…）**：解析成 GameSetting → 进 Game 时 `start` → `game.started`（外部 HUD）。
- **原生 / 纯标记**：`gameById` 无记录 → `GameSetting` 为 `null` → `GameRuntimeSystem.startGame` 早返回（**不启外部 app**）。**原生在场游戏**（Pattern B，§7）与**纯数据玩法**（Pattern C）走这一类。

## 4. 守卫语义（`World.setMode`）✅

```ts
setMode(mode, opts?: { force?: boolean }): boolean
```

- 进入 `Game` 且 `!force` 且**无有效游戏入口上下文**（现实现：`!gameZoneActive`；目标：未经 game trigger）→ **拒绝**（返回 `false`，模式不变，告警一次）。
- `force: true` 绕过守卫，仅供**引擎内部 / 测试**（不是面向玩家的入口）。
- 返回布尔表示是否真切换。客户端 UI **以引擎 `system.mode` 事件为准**，而非乐观本地状态——被拒绝/自动回退都能正确显示。

## 5. 乘骑例外（`world.rideActive`）✅

`CoasterSystem` 等接管玩家位置的玩法系统载客时置 `world.rideActive = true`；此时 `GameZoneSystem` **冻结**
zone 追踪——跨越 block 边界的轨道**不会**把骑乘中的玩家甩出 Game（轨道载客期间是位置权威）。下车（退出 Game）即解除。
（目标的"区域 / `persistent`"语义将更通用地覆盖此例外。）

## 6. 客户端约定（3D 官方解释器）

- 模式切换器**不含**自由 GAME 按钮（`client/desktop/src/App.tsx`）。
- **目标**：走到游戏对象前 → 出现"进入游戏"动作（确认按钮 / 对象高亮可点）；`exitPolicy==='confirm'` 时，
  走出区域引擎发 `game.leave_intent`，客户端**弹确认框**（确认 → `exitGame`；取消 → 留在 Game，玩家可走回）
  ——`confirm` 弹框这半已实现 ✅，见下条"现状"。
- **现状**：站入可玩 zone（block 级）→ 底部 `▶ 进入游戏 · Enter Game`（`data-testid="enter-game"`）；Game 中显示
  `■ 退出游戏 · Exit Game`（`data-testid="exit-game"`）；走出 block **按 `exitPolicy` 收场**：`ephemeral`
  静默退出（`GameZoneSystem.ts:78`），`confirm` **保活**并发 `game.leave_intent` → `DesktopLoader.ts:342` →
  `LeaveGameDialog.tsx` 弹确认框（✅ 已实现；确认 → `exitGame`，取消/走回 → 留在 Game）。对象级"走到机器前
  高亮可点"随 `gameId` trigger 化跟进。
- `useEngine` 的 `mode` 镜像引擎 `system.mode`（引擎为真相源），`gameZoneActive` 镜像 `game.zone_enter/exit`。

## 7. 原生在场游戏复用本契约（Pattern B）

- **现状（✅）**：原生游戏块标 `block.game=1`（纯可玩标记），客户端 `block.loaded` 时**硬编码** `setupShooting({block:[2048,2047]…})`
  等 arm；进入经场景内 game trigger 的 `enterGame`，**已声明 `exitPolicy`**（打靶/台球/叠叠乐 `ephemeral`、麻将
  `confirm`，见 `client/desktop/src/scenes/*Scene.ts`）；System 每帧 `syncSession` 按「`mode===Game` 且玩家在该块」
  spawn/teardown；走出 block 按声明档收场（`ephemeral` 静默拆局 / `confirm` 保活弹框），仍是单块一游戏。
- **目标（🔲）**：`enterGame` 再携带 **`gameId`+`origin`**（**干掉客户端硬编码坐标**——
  `native-in-world-games.md` 记的开放项随之解决）；一块可放多台。详见 `docs/plan/specs/native-in-world-games.md` #3。

## 8. 实现状态 / 路线

| 项 | 状态 | 备注 |
|---|---|---|
| `block.game` 区域门控 + `setMode(Game)` 守卫 + `player.enterGame/exitGame` | ✅ | 现行前身 |
| `GameRuntimeSystem` gameId→GameSetting 解析 + 外部 app 路由 | ✅ | trigger 化后**直接复用** |
| `ephemeral` 走出即拆（4 个原生游戏可选） | ✅ | 已**声明化**（`enterGame` 带 `exitPolicy`，缺省档；`GameZoneSystem.ts:78`） |
| `enterGame` 携带 `gameId`/`params`/`exitPolicy`（**声明迁到 trigger**） | 🟡 | `exitPolicy` 已带（`Actuator.ts:297-299` → `World.gameExitPolicy`）；`gameId`/`origin` 未带——"一块多游戏"待此 |
| `block.game` 降级为**粗粒度"此处可玩"位**（可由 trigger 派生） | 🔲 | 保留便宜枚举性 |
| `exitPolicy='confirm'`（`game.leave_intent` + 客户端弹框） | ✅ | 全链路：`GameZoneSystem.ts:76-77` 发 `game.leave_intent` 且保活 → `DesktopLoader.ts:342` → `LeaveGameDialog.tsx` |
| `exitPolicy='persistent'`（存档重入 + 区域预加载 / 不淘汰） | 🔲 | **暂按 `ephemeral` 兜底**（`SystemMode.ts:47`）；依赖下条；最重 |
| **跨多 block 可玩区 / 区域预加载**：相邻块成区域、Game 模式不淘汰、`system.preload` 接订阅 | 🔲 | `system.preload` 现为**死通道**、loader 不读 mode；见 `coaster-via-spp.md §9.1 / M2.5`。仅 `persistent` 需要 |
| `GameZoneSystem`（zone）→ 会话/区域追踪，去掉"跨内部块缝踢回 Normal"的 bug | 🔲 | 仅非 `ephemeral` 需要（`ephemeral` 单块不触发） |

**建议落地顺序**：② `exitPolicy` `ephemeral`+`confirm` 两档（声明化现状 + 防误触）**已完成 ✅**；余下
① `enterGame` 带 `gameId` + trigger 入口（开"一块多游戏"）→ ③ block 降级粗位 → ④ `persistent` + 区域预加载
（真有副本类需求再上）。
