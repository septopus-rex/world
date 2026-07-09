# Septopus 玩家协议 (Player Protocol)

在 **Septopus 引擎**中，"玩家 (Player)" 不仅是一个视点，而是一个遵循物理规则并在世界中具有实体表现（Avatar）的交互单元。其位置与状态由引擎实时追踪，并可与经由 SPP 组织的内容进行深度交互。

> 本文档与实现对应：状态容器与持久化见 `client/desktop/src/lib/DesktopLoader.ts`
> （`SeptopusPlayerState`），状态上报见 `engine/src/core/movement/CharacterController.ts`，
> Avatar 装载见 `engine/src/core/EntityFactory.ts`，组件定义见
> `engine/src/core/components/PlayerComponents.ts`。

## 1. 玩家空间状态 (Player Spatial State)

玩家的核心持久化状态格式（客户端 `SeptopusPlayerState`，存于 localStorage
`spp_player_state`，刷新后断点续传）：

```json
{
    "block": [2048, 2048],
    "world": "main",
    "position": [8, 8, 1.0],
    "rotation": [0, 0, 0],
    "stop": { "on": false, "adjunct": "", "index": 0 },
    "extend": 2,
    "posture": 0
}
```

### 状态属性与实现状态

| 字段 | 说明 | 实现状态 |
|---|---|---|
| `block` | 玩家当前所在地块的 `[X, Y]` 坐标。 | ✅ 引擎动态上报 |
| `position` | **相对于当前地块**的 `[X, Y, Z]` 坐标（Septopus 轴序，Z 为高度）。 | ✅ 引擎动态上报 |
| `rotation` | 视角欧拉旋转 `[X, Y, Z]`（Septopus 约定）。 | ✅ 引擎动态上报 |
| `world` | 所在世界 ID（`string \| number`）。 | ⚠️ 容器内携带；引擎当前单世界，不动态更新 |
| `extend` | 视口加载半径（周围加载多少圈相邻地块，`2` = 5×5）。 | ✅ 客户端用于流式加载（下限钳制为 2）；同名静态配置亦存在于 world config `player.extend` |
| `stop` | 脚下踩踏对象（`on`/`adjunct`/`index`），用于坠落参照。 | 🚧 **预留**——结构在容器中保留，引擎从不更新（接地状态在引擎内部为 `RigidBodyComponent.isGrounded`） |
| `posture` | 姿态枚举（站立/行走/奔跑/攀爬/蹲下/匍匐）。 | 🚧 **预留**——引擎无 posture 状态机 |

### 状态上报（`player:state` 事件）

引擎不每帧持久化：`CharacterController.processPersistence` 在**位移/转角超过阈值**时
发出 `player:state` 事件，载荷为 **`{ block, position, rotation }`**（经
`Coords.engineToSeptopus` 转回 Septopus 坐标）。客户端订阅该事件并合并进上述容器后写入
localStorage——其余字段（`stop`/`posture` 等）保持容器默认值随存随读。

## 2. 地形与重力计算 (Terrain & Gravity)

引擎持续解算玩家与地形/附属物的碰撞，防止穿模与跌出世界：

- **子步进积分**：每帧位移被切成 ≤0.08m 的子步（上限 48 步）逐步碰撞检测，
  高速移动不会隧穿薄墙。
- **跨步规则（单阈值）**：障碍物顶面与脚底的高差 ≤ `stepHeight`（默认 0.5m）
  时自动踏上，否则水平阻挡。该规则统一覆盖"地块→附属物 / 附属物→附属物 /
  附属物→地块"的所有过渡。
- **坠落事件**：离地时记录起跌高度，落地时若坠距 ≥ `fallDeathHeight`（默认 12m）
  发出 **`player:fell`** 事件 `{ drop }`——`HealthSystem` 据此判定致死（见下文）。
- **失足保险**：跌出世界（深渊）时引擎将玩家复位到最近安全点并发出
  `player:recovered`。
- **Ghost 模式**：无重力、无碰撞的自由漫游（Space 上升 / Shift 下降），
  跳过坠落事件与失足保险，Avatar 隐藏。

### 生命值与重生（`HealthComponent` + `HealthSystem`）

玩家携带 `HealthComponent { hp, maxHp }`（默认 100/100）。事件流：

- `player:damage` / `player:heal` `{ amount }` —— 扣减/恢复（trigger 经 actuator 的
  `player` 动作发出，**仅 Game 模式**）；每次变化广播 `player:health { hp, maxHp }`。
- 致死坠落（`player:fell`）或 hp ≤ 0 —— 发 `player:died { cause }`，传送回世界
  出生点、清零速度、回满血，发 `player:respawned`。
- 客户端 HP 条消费 `player:health`（满血隐藏）。

### 身体参数（`PlayerBodyComponent`）

| 字段 | 说明 | 状态 |
|---|---|---|
| `height` | 碰撞柱体总高（m） | ✅ |
| `eyeHeight` | 眼高（相机偏移，m） | ✅ |
| `stepHeight` | 自动跨步/阻挡的单阈值（m） | ✅ |
| `fallDeathHeight` | 触发 `player:fell` 的坠距（m） | ✅ |
| `crouchHeight` | 蹲伏高度 | 🚧 预留 |
| `jumpHeight` | 目标跳跃顶点（当前由 `RigidBodyComponent.jumpForce` 冲量驱动） | 🚧 预留 |

运动能力在 `RigidBodyComponent`：`maxSpeedWalk` / `maxSpeedRun` / `jumpForce` /
`gravity` / `friction` / `isGrounded`。

> **已接线(2026-07-09 更新,基础数据审计 P9)**:`player.capacity`
> (speed/walkSpeed/jumpForce/gravityMultiplier/ghostFlySpeed/voidRecover/**maxHp**/**reach**)
> 与 `player.physique` **均由引擎读取**,数据优先、下表缺省兜底。
> **physique = 体格基准**(取代已删除的旧 VBW `body` 段,后者从未被消费):
> `height` 1.8(化身按此**缩放修正**——任何 avatar 换装后统一到基准身高)·
> `eyeHeight` 1.7(第一人称相机)· `stepHeight` 0.5 · `crouchHeight` 0.9 ·
> `jumpHeight` 1.2 · `fallDeathHeight` 12(致死落差,米)。
> **深嵌救援(popOut)为规范行为**:出生/传送/重生落入固体时弹至固体顶面;
> 行走子步 ≤0.08 m < 0.1 m 触发余量,正常移动不误触。
> `player.bag.max` **已接线**:作为玩家背包的槽位上限
> （`InventoryComponent.maxCapacity`），背包整体设计见
> [inventory-local-first 规格](../../docs/plan/specs/inventory-local-first.md)
> （b5 物品 adjunct、原子拾取/丢弃、IndexedDB 持久化、trigger `bag` 动作与
> `inventory.*` 条件）。

## 3. 虚拟化身 (Avatar)

**Avatar 就是一个模型资源**：按 id（路径 / IPFS CID，`resolveUrl` 支持 CID→网关
映射）经 `ResourceManager` 的模型管线获取，与 module（a4）共用同一条
load-once + instance-many 通道，不存在并行的资产路径。

### 配置与装载

```json
// world config（领主配置）
"player": {
    "avatar": { "max": 2097152, "scale": [1, 1, 1], "resource": 30 }
}
```

| 字段 | 说明 | 状态 |
|---|---|---|
| `resource` | 模型资源 id（经 `IDataSource.module()` 解析为 `{format, raw: <路径/CID>}`） | ✅ 唯一被引擎消费的字段 |
| `scale` | 体格缩放 | 🚧 **预留**——引擎当前按身高等比 scale-to-fit，不读取此字段 |
| `max` | Avatar 文件大小上限（字节） | 🚧 **预留**——引擎未校验 |

装载流程（`EntityFactory.loadAvatarModel`）：

1. 出生即显示**占位盒**（半透明 0.6×1.8×0.6）。
2. `ResourceManager.getModel(resource)` 异步加载（按 id 去重，多人共用同一 id
   时只加载一次、各自克隆实例——为未来多人做好了去重）。
3. 加载成功后**等比缩放到身体高度**（保持比例，不拉伸），swap 替换占位盒；
   失败则保留占位盒。
4. 模型内嵌的骨骼动画剪辑（`AnimationClip`）经 `RenderEngine.startAnimation` 注册到 mixer，
   `CharacterController` 每帧按运动状态调 `setAnimationState`（idle/walk/run/air + crossfade）
   并经 `RenderEngine.updateAnimation` 推进 mixer——**内嵌剪辑确实在播**。
   ⚠️ 但状态→剪辑映射靠剪辑名正则启发式 + 回退首条；**形象/动作未分离**（动作绑死在 avatar GLB 里，
   无共享可重定向动作库），且无标准骨架契约。完整数据契约（形象/动作/状态三层分离、VRM humanoid
   骨架、状态集、重定向、现状与分期）见 **[虚拟化身动画协议](./avatar-animation.md)**。

**支持格式**：GLTF/GLB、FBX、OBJ、DAE（`ModelLoader`）。**VRM 暂不支持**（见动画协议 §7 v3）。

**可见性**：Avatar 仅在第三人称视角下渲染（第一人称时相机位于体内，强制隐藏）。

### 未实现 / 规划中

以下为目标态描述，**当前均未实现**，列出以免误引（完整规范见
[虚拟化身动画协议](./avatar-animation.md)）：

- **姿态动画集 + 形象/动作分离**：动作做成独立于形象、可重定向的动作集（`avatar.motion`），
  按 idle/walk/run/air 等标准状态切换（当前只注册了内嵌剪辑、且 mixer 未推进）。
  规范基准 = VRM 1.0 humanoid 骨架 + VRMA 动作格式。
- **表情系统**：沿用 VRM expression presets（happy/angry/sad/relaxed/surprised + 口型）
  的混合变形（blendshape）及强度渐变。
- **独立 Avatar 元数据文件**（`{body, action, emotion, datasource, format}`）：
  当前没有元数据层，avatar 仅是"一个模型资源 id"。如未来需要骨架重定向、
  动画集声明、碰撞体格匹配，可引入专门的 `IDataSource.avatar()` 元数据接口。
- **体格重定向**：按身高/肩宽等体格参数匹配碰撞框（当前碰撞柱体与模型互不感知，
  仅做整体等比缩放）。

去中心化方向不变：Avatar 以内容寻址（IPFS CID）分发，加载管线已具备 CID
解析能力，上链/IPFS 发布属 P3–P4 范畴。
