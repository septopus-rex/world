# 玩家系统 (Player System)

玩家系统负责管理玩家实体的状态流转、能力配置以及与环境的交互（下落、阻挡、踩踏等），并驱动虚拟化身（Avatar）的渲染表现。

> 数据格式契约见 [玩家协议](../../protocol/cn/player.md)；实现位于
> `engine/src/core/movement/CharacterController.ts`、
> `engine/src/core/components/PlayerComponents.ts`、
> `engine/src/core/EntityFactory.ts`。

## 1. 玩家数据模型

玩家是一个普通 ECS 实体，状态即组件数据（纯逻辑数值，支持无头环境校验）：

| 组件 | 职责 | 关键字段 |
|---|---|---|
| `TransformComponent` | 位置/朝向（引擎坐标） | `position` `rotation` `dirty` |
| `RigidBodyComponent` | 运动能力与物理状态 | `maxSpeedWalk` `maxSpeedRun` `jumpForce` `gravity` `friction` `isGrounded` |
| `PlayerBodyComponent` | 身体/碰撞参数 | `height` `eyeHeight` `stepHeight` `fallDeathHeight`（`crouchHeight`/`jumpHeight` 预留） |
| `InputStateComponent` | 输入意图 | 移动/跳跃/视角 |
| `CameraComponent` | 相机挂载 | `offset`（眼高）`fov` |
| `AvatarComponent` | 化身渲染句柄 | `handle` `visible` `resource` |
| `InventoryComponent` | 背包 | `items` `maxCapacity` |

**持久化**：`CharacterController` 在位移/转角超过阈值时发出 `player:state` 事件
（`{block, position, rotation}`，SPP 坐标）；客户端将其合并进
`SPPPlayerState` 容器并写入 localStorage（`spp_player_state`）实现断线位置续传。
容器中的 `stop{}`、`posture` 字段为**预留**（引擎不更新），合约同步属后续规划。

## 2. 运动能力与身体参数

### 运动能力（`RigidBodyComponent`）

能力是组件数据而非控制器硬编码，可被外部逻辑修改：

*   `maxSpeedWalk` / `maxSpeedRun`：行走/奔跑速度上限。
*   `jumpForce`：跳跃冲量（目标顶点高度 `jumpHeight` 为预留字段）。
*   `gravity` / `friction`：重力与摩擦系数。

> 旧文档中的 `capacity{move/jump/span/death}` 能力面板与"经 Adjunct/触发器修改
> 能力"的机制**未实现**——触发器当前的动作面是 adjunct/flag/bag/system
> （见 [触发器协议](../../protocol/cn/trigger.md) §6）；背包动作已实现（Game 模式），
> 玩家属性目标仍待扩展。

### 身体参数（`PlayerBodyComponent`）

*   `stepHeight`（默认 0.5m）：自动跨步/水平阻挡的**单阈值**——障碍顶面与脚底高差
    在阈值内直接踏上，否则阻挡（旧文档称 `span`）。
*   `fallDeathHeight`（默认 12m）：落地时坠距达到该值发出 **`player:fell`**
    事件 `{drop}`（旧文档写作 `player.death`，事件名以代码为准）；跌出世界
    另有失足保险，复位至安全点并发 `player:recovered`。
*   `height` / `eyeHeight`：碰撞柱体高与眼高。

> 旧文档"体格骨架参数重定向匹配碰撞框"**未实现**：Avatar 模型与碰撞柱体互不感知，
> 仅做整体等比缩放（见下文）。

## 3. 状态转换与同步（每帧流水线）

输入指令不会直接改 3D `mesh.position`，每帧严格走以下周期
（`CharacterController.update`）：

1. **输入 → 意图**：读取 `InputStateComponent`，结合视角朝向解算本帧理论位移
   （水平步进 + 重力下坠 + 跳跃冲量）。
2. **子步进碰撞解算**：位移切成 ≤0.08m 的子步（上限 48 步）逐段与
   [物理边界](./physics.md)碰撞——跨步、阻挡、落地判定都在此完成，结果写回
   `TransformComponent`。
3. **相机与化身同步**：
   - 相机移到眼位（第三人称时退后并抬高，跟随视角偏航）。
   - Avatar 句柄同步到玩家位置/朝向，**仅第三人称可见**（第一人称强制隐藏），
     并按运动状态调 `setAnimationState`（idle/walk/run/air）+ `updateAnimation` 每帧推进
     mixer——内嵌剪辑确实在播；完整契约见[虚拟化身动画协议](../../protocol/cn/avatar-animation.md)。
4. **状态上报**：超过阈值时发 `player:state`（见 §1）。

## 4. 虚拟化身 (Avatar)

Avatar 是一个**模型资源 id**（路径 / IPFS CID），复用 module 的模型管线
（`ResourceManager` load-once + instance-many）：出生先显示占位盒，模型加载完
等比缩放到身体高度后 swap 替换；内嵌剪辑注册到 mixer 并每帧推进、确实在播（见上）。支持
GLTF/GLB/FBX/OBJ/DAE，VRM 暂不支持。**形象/动作分离、姿态动画集（idle/walk/run/air）、
重定向、表情系统**的完整数据契约见 [虚拟化身动画协议](../../protocol/cn/avatar-animation.md)
（规范基准 VRM humanoid + VRMA）；avatar 资源字段见 [玩家协议 §3](../../protocol/cn/player.md)。
