# Septopus 玩家协议 (Player Protocol)

在 **Septopus 引擎**中，"玩家 (Player)" 不仅是一个视点，而是一个遵循物理规则并在世界中具有实体表现（Avatar）的交互单元。其位置与状态由引擎实时追踪，并可与经由 SPP 组织的内容进行深度交互。

> 本文档与实现对应：状态容器与持久化见 `client/desktop/src/lib/DesktopLoader.ts`
> （`SPPPlayerState`），状态上报见 `engine/src/core/movement/CharacterController.ts`，
> Avatar 装载见 `engine/src/core/EntityFactory.ts`，组件定义见
> `engine/src/core/components/PlayerComponents.ts`。

## 1. 玩家空间状态 (Player Spatial State)

玩家的核心持久化状态格式（客户端 `SPPPlayerState`，存于 localStorage
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
| `position` | **相对于当前地块**的 `[X, Y, Z]` 坐标（SPP 轴序，Z 为高度）。 | ✅ 引擎动态上报 |
| `rotation` | 视角欧拉旋转 `[X, Y, Z]`（SPP 约定）。 | ✅ 引擎动态上报 |
| `world` | 所在世界 ID（`string \| number`）。 | ⚠️ 容器内携带；引擎当前单世界，不动态更新 |
| `extend` | 视口加载半径（周围加载多少圈相邻地块，`2` = 5×5）。 | ✅ 客户端用于流式加载（下限钳制为 2）；同名静态配置亦存在于 world config `player.extend` |
| `stop` | 脚下踩踏对象（`on`/`adjunct`/`index`），用于坠落参照。 | 🚧 **预留**——结构在容器中保留，引擎从不更新（接地状态在引擎内部为 `RigidBodyComponent.isGrounded`） |
| `posture` | 姿态枚举（站立/行走/奔跑/攀爬/蹲下/匍匐）。 | 🚧 **预留**——引擎无 posture 状态机 |

### 状态上报（`player:state` 事件）

引擎不每帧持久化：`CharacterController.processPersistence` 在**位移/转角超过阈值**时
发出 `player:state` 事件，载荷为 **`{ block, position, rotation }`**（经
`Coords.engineToSpp` 转回 SPP 坐标）。客户端订阅该事件并合并进上述容器后写入
localStorage——其余字段（`stop`/`posture` 等）保持容器默认值随存随读。

## 2. 地形与重力计算 (Terrain & Gravity)

引擎持续解算玩家与地形/附属物的碰撞，防止穿模与跌出世界：

- **子步进积分**：每帧位移被切成 ≤0.08m 的子步（上限 48 步）逐步碰撞检测，
  高速移动不会隧穿薄墙。
- **跨步规则（单阈值）**：障碍物顶面与脚底的高差 ≤ `stepHeight`（默认 0.5m）
  时自动踏上，否则水平阻挡。该规则统一覆盖"地块→附属物 / 附属物→附属物 /
  附属物→地块"的所有过渡。
- **坠落事件**：离地时记录起跌高度，落地时若坠距 ≥ `fallDeathHeight`（默认 12m）
  发出 **`player:fell`** 事件 `{ drop }`（由监听方决定复位/扣血等后果）。
- **失足保险**：跌出世界（深渊）时引擎将玩家复位到最近安全点并发出
  `player:recovered`。

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

> ⚠️ world config 中的 `player.capacity`（rotate/speed/jumpForce/gravityMultiplier）、
> `player.body`（头/手/腿分段）、`player.bag.max` 均为**预留类型**——引擎创建玩家时
> 使用硬编码默认值，目前不读取这些配置。领主配置写了也不会生效。

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
4. 模型内嵌的骨骼动画剪辑（`AnimationClip`）经渲染层
   `RenderEngine.startAnimation` 自动播放**第一条剪辑**，每帧由
   `CharacterController` 推进 mixer。

**支持格式**：GLTF/GLB、FBX、OBJ、DAE（`ModelLoader`）。**VRM 暂不支持**。

**可见性**：Avatar 仅在第三人称视角下渲染（第一人称时相机位于体内，强制隐藏）。

### 未实现 / 规划中

以下为旧版协议的目标态描述，**当前均未实现**，列出以免误引：

- **姿态动画集**：按 `posture` 绑定 Stand/Walk/Run/Squat/Prone/Climb 标准剪辑、
  随移动状态切换（当前只自动播第一条内嵌剪辑）。
- **表情系统**：Normal/Happy/Angry/Sad 混合变形（blendshape）及强度渐变。
- **独立 Avatar 元数据文件**（`{body, action, emotion, datasource, format}`）：
  当前没有元数据层，avatar 仅是"一个模型资源 id"。如未来需要骨架重定向、
  动画集声明、碰撞体格匹配，可引入专门的 `IDataSource.avatar()` 元数据接口。
- **体格重定向**：按身高/肩宽等体格参数匹配碰撞框（当前碰撞柱体与模型互不感知，
  仅做整体等比缩放）。

去中心化方向不变：Avatar 以内容寻址（IPFS CID）分发，加载管线已具备 CID
解析能力，上链/IPFS 发布属 P3–P4 范畴。
