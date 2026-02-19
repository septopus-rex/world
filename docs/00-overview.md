# Septopus World 架构概述

## 系统介绍

Septopus World 是一个**全链运行的 3D 开放世界引擎**，采用**协议驱动 + 数据驱动**的核心设计理念。引擎通过分层架构和 ECS（Entity-Component-System）模式，实现模块化、可扩展的虚拟世界构建。

### 核心理念

| 理念 | 说明 |
|------|------|
| **协议驱动** | 链上数据协议 + 引擎描述协议分离，引擎仅负责解析和渲染 |
| **数据驱动** | 所有内容由数据描述，通过转换管线最终呈现为 3D/2D 场景 |
| **全链部署** | 所有数据存储在链上和 IPFS，任何兼容的引擎都可渲染 |
| **模块扩展** | 附属物（Adjunct）和插件（Plugin）机制支持动态扩展 |
| **AI 原生** | 通过弦粒子降维和语义化协议，使 AI 可直接生成 3D 游戏内容 |
| **时间维度** | 利用区块链不可篡改的时间戳驱动世界演化（老化/生长/天气/季节） |

## TypeScript 重构目标

### 1. 类型安全
- 所有公共接口使用 TypeScript 类型定义
- 启用 `strict` 模式，包括 `noImplicitAny` 和 `strictNullChecks`
- 使用 `readonly` 标记不可变数据结构
- 提供清晰的类型注解和泛型约束

### 2. ECS 架构

引入标准 Entity-Component-System 模式：

- **Entity（实体）**：Block 作为基础实体，每个 Block 是 16M×16M 的空间单元
- **Component（组件）**：附属物（Box、Wall、Trigger 等）作为挂载在 Entity 上的数据组件
- **System（系统）**：渲染系统、物理系统、输入系统等，负责处理对应组件的逻辑

### 3. 分层解耦
- 将当前 Framework 的"上帝对象"拆分为职责单一的模块
- 引入渲染抽象层，解耦引擎核心与 Three.js
- 定义清晰的模块接口契约，减少循环依赖

### 4. 管线抽象
- 数据转换从散落的函数调用提升为统一 Pipeline
- 支持管线步骤的插拔和自定义

## 系统分层架构

```
┌─────────────────────────────────────────────────────────┐
│                      应用层 (Application)                │
│   World 入口 · 编辑器 · 游戏运行时 · UI 交互              │
├─────────────────────────────────────────────────────────┤
│                      系统层 (Systems)                    │
│   渲染系统 · 物理/碰撞系统 · 输入/控制系统                  │
│   事件系统 · 网络/链上系统 · 天空/天气系统                  │
├─────────────────────────────────────────────────────────┤
│                    核心引擎层 (Engine Core)               │
│   ECS 框架 · 场景管理 · 资源管理 · 坐标服务 · 调度器       │
├─────────────────────────────────────────────────────────┤
│                      协议层 (Protocol)                   │
│   链上数据协议 · 引擎描述协议 · 资源格式规范               │
├─────────────────────────────────────────────────────────┤
│                      基础设施 (Infrastructure)            │
│   Three.js / WebGPU · Solana / IPFS · 浏览器 API         │
└─────────────────────────────────────────────────────────┘
```

### 各层职责

#### 协议层（Protocol）
定义数据格式和通信规范，是引擎的"契约"：
- **链上数据协议**：Raw 数据的存储格式（紧凑数组编码）
- **引擎描述协议**：STD 数据的标准中间格式（JSON 语义化描述）
- **资源格式规范**：纹理、模型、动画等资源的统一引用和加载标准

#### 核心引擎层（Engine Core）
引擎运行的核心基础设施：

| 模块 | 职责 | 原模块 |
|------|------|--------|
| `Engine` | 引擎入口，全局状态和生命周期 | `framework.js` 部分 |
| `Registry` | 组件/系统注册中心 | `framework.component` |
| `ResourceManager` | 资源加载、缓存、GC | `world.prefetch` + `framework.cache` |
| `SceneManager` | 场景创建、切换、销毁 | `framework.initActive` |
| `Pipeline` | 数据转换管线 | `framework.structSingle/structRenderData` |
| `Scheduler` | 帧循环、任务调度 | `framework.loop` + `queue` |
| `CoordinateService` | 统一坐标转换 | 各组件中分散的转换逻辑 |

#### 系统层（Systems）
ECS 中的 System，处理具有特定 Component 的 Entity：

| 系统 | 职责 | 原模块 |
|------|------|--------|
| `RenderSystem` | 3D/2D 渲染 | `render_3d.js` / `render_2d.js` |
| `PhysicsSystem` | 碰撞检测、运动计算 | `movement.js` + Stop 逻辑 |
| `InputSystem` | 键盘/鼠标/触摸输入 | `control_fpv.js` / `control_2d.js` |
| `EventSystem` | 事件派发和监听 | `event.js` |
| `NetworkSystem` | 链上数据读写、IPFS | `api.js` / `datasource` |
| `SkySystem` | 天空、天气、时间 | `sky.js` / `time.js` / `weather.js` |
| `TriggerSystem` | 触发器运行时 | `basic_trigger.js` 逻辑 |

#### 应用层（Application）
面向用户的高层功能：

| 模块 | 职责 | 原模块 |
|------|------|--------|
| `World` | 世界入口、初始化流程 | `world.js` |
| `Editor` | 编辑模式的选择、修改、网格 | `world.edit/select/modify` |
| `GameRuntime` | 游戏模式的逻辑执行 | `world` 中 game 相关 |
| `UI` | 用户界面交互 | `io_ui.js` / `pages.js` |

## ECS 架构设计

### Entity（实体）

Block 是基础实体，代表 16M×16M 的空间单元：

```typescript
interface Entity {
    readonly id: string;          // 唯一标识，格式: "${x}_${y}_${world}"
    readonly coord: BlockCoord;   // Block 坐标
    components: Map<string, Component>;  // 挂载的组件
    active: boolean;              // 是否激活（在可视范围内）
}
```

### Component（组件）

纯数据容器，不含逻辑：

```typescript
interface Component {
    readonly type: string;        // 组件类型名
}

// 示例：Transform 组件
interface TransformComponent extends Component {
    type: 'transform';
    position: Vector3;            // Septopus 坐标
    rotation: Vector3;
    scale: Vector3;
}

// 示例：Renderable 组件
interface RenderableComponent extends Component {
    type: 'renderable';
    meshType: 'box' | 'sphere' | 'cylinder' | 'plane' | 'module';
    material: MaterialConfig;
    visible: boolean;
}

// 示例：Collider 组件（原 Stop）
interface ColliderComponent extends Component {
    type: 'collider';
    shape: ColliderShape;
    isTrigger: boolean;           // true = 触发器, false = 阻拦体
}
```

### System（系统）

处理具有特定组件组合的实体：

```typescript
interface System {
    readonly name: string;
    readonly requiredComponents: string[];  // 需要哪些组件
    priority: number;                       // 执行优先级
    
    init(): void;
    update(dt: number, entities: Entity[]): void;
    destroy(): void;
}
```

## 数据管线（Pipeline）

### 转换流程

```
链上数据(Raw) ──→ 标准数据(STD) ──→ 渲染数据(RenderData) ──→ 场景对象
   IPFS存储        语义化JSON         引擎内部格式           Three.js对象
```

### Pipeline 抽象

```typescript
interface PipelineStage<TInput, TOutput> {
    readonly name: string;
    process(input: TInput, context: PipelineContext): TOutput;
}

// 数据转换管线
const blockPipeline = Pipeline.create<BlockRawData, SceneNode>()
    .addStage(new RawToSTDStage())       // Raw → STD
    .addStage(new STDToRenderStage())    // STD → RenderData
    .addStage(new RenderToSceneStage()); // RenderData → SceneNode
```

### 管线上下文

```typescript
interface PipelineContext {
    readonly world: number;
    readonly blockCoord: BlockCoord;
    readonly accuracy: number;            // 坐标精度系数
    readonly side: [number, number];      // Block 尺寸
    readonly elevation: number;           // Block 标高
    registry: Registry;                   // 组件注册中心
    resources: ResourceManager;           // 资源管理器
}
```

## 坐标系统

### Septopus 坐标系

- **X**: 东西方向 (+东, -西)
- **Y**: 南北方向 (+北, -南)
- **Z**: 高度方向 (+向上, -向下)
- **单位**: 毫米（内部精度），对外接口使用米
- **原点**: 西南角 Block[1,1] 的中心点

### Three.js 坐标系

- **X**: 水平右方向
- **Y**: 垂直向上方向
- **Z**: 水平向前方向

### 坐标转换

```typescript
// 统一坐标服务
class CoordinateService {
    // Septopus → Three.js
    toThree(coord: SeptopusCoord): ThreeCoord {
        return { x: coord.x, y: coord.z, z: -coord.y };
    }
    
    // Three.js → Septopus
    toSeptopus(coord: ThreeCoord): SeptopusCoord {
        return { x: coord.x, y: -coord.z, z: coord.y };
    }
    
    // Block 坐标 → 世界坐标（Septopus）
    blockToWorld(block: BlockCoord, local: Vector3): SeptopusCoord {
        const side = this.config.side;
        return {
            x: (block.x - 1) * side[0] + local.x,
            y: (block.y - 1) * side[1] + local.y,
            z: local.z,
        };
    }
}
```

## 事件系统

### 事件分类

| 事件类别 | 事件 | 说明 |
|----------|------|------|
| System | `init`, `launch`, `update`, `off`, `restart` | 系统生命周期 |
| Block | `enter`, `leave`, `loaded`, `unloaded` | Block 加载和玩家进出 |
| Trigger | `enter`, `stay`, `exit` | 触发器碰撞事件 |
| Collider | `contact`, `separate`, `beside` | 阻拦体碰撞事件 |
| Player | `fall`, `death`, `start`, `rotate` | 玩家状态变化 |
| Resource | `loaded`, `failed` | 资源加载状态 |

### 事件增强

```typescript
interface EventBus {
    // 支持优先级
    on(category: string, event: string, callback: EventCallback, options?: {
        priority?: number;      // 执行优先级
        once?: boolean;         // 是否只触发一次
        filter?: EventFilter;   // 事件过滤条件
        target?: EventTarget;   // 绑定到特定对象
    }): void;
    
    // 支持异步
    emit(category: string, event: string, data: EventData): Promise<void>;
    
    // 支持取消
    off(category: string, event: string, callback?: EventCallback): void;
}
```

## 系统模式

使用状态机管理：

```typescript
enum SystemMode {
    Normal = 'normal',    // 正常浏览模式：自由浏览，可交互
    Edit = 'edit',        // 编辑模式：显示编辑辅助，可修改内容
    Game = 'game',        // 游戏模式：阻止网络请求，启用游戏逻辑
    Ghost = 'ghost',      // 游客模式：只读访问
}

// 状态转换规则
// Normal ↔ Edit（需要 Block 所有权）
// Normal ↔ Game（需要 gameSetting）
// Ghost → Normal（需要身份验证）
```

## 性能优化

### 1. 资源管理
- **LRU 缓存**：Block 数据按距离管理，超出可视范围自动卸载
- **资源池**：纹理、几何体等资源全局共享引用计数
- **异步加载**：资源预加载队列，优先加载玩家视野方向

### 2. 渲染优化
- **视锥裁剪**：只渲染玩家 `extend` 范围内的 Block
- **LOD 预留**：远距离 Block 使用低精度替代物
- **批量渲染**：相同材质的几何体合并绘制

### 3. 帧调度
- **固定时间步长**：物理和逻辑更新使用固定 dt
- **可变渲染帧率**：渲染帧率独立于逻辑更新
- **任务分帧**：大量数据转换分帧执行避免卡顿

## 初始化流程

```
1. Engine.create(config)
   └─ 初始化 Registry、ResourceManager、Scheduler
   └─ 注册所有内置 System
   └─ 注册所有 Adjunct 组件

2. World.load(worldId)
   └─ 从链上/缓存获取世界配置
   └─ 初始化 CoordinateService
   └─ 设置 EventBus

3. Scene.enter(blockCoord, extend)
   └─ 加载范围内 Block 数据（Raw）
   └─ Pipeline 转换：Raw → STD → RenderData
   └─ 预加载资源（纹理、模块）
   └─ 创建场景节点

4. Scheduler.start()
   └─ 启动 InputSystem
   └─ 启动 RenderSystem
   └─ 启动帧同步循环
```

## 模块结构

```
septopus/
├── types/                 # TypeScript 类型定义
│   ├── index.ts          # 类型导出
│   ├── ecs.ts            # ECS 核心类型
│   ├── block.ts          # Block 和坐标类型
│   ├── component.ts      # 组件接口
│   ├── material.ts       # 材质和渲染类型
│   ├── event.ts          # 事件类型
│   └── config.ts         # 配置类型
├── core/                  # 核心引擎层
│   ├── engine.ts         # 引擎入口
│   ├── registry.ts       # 组件/系统注册
│   ├── resource.ts       # 资源管理
│   ├── scene.ts          # 场景管理
│   ├── pipeline.ts       # 数据转换管线
│   ├── scheduler.ts      # 帧循环和调度
│   └── coordinate.ts     # 坐标服务
├── systems/               # ECS 系统
│   ├── render.ts         # 渲染系统
│   ├── physics.ts        # 物理/碰撞系统
│   ├── input.ts          # 输入系统
│   ├── event.ts          # 事件系统
│   ├── network.ts        # 链上数据系统
│   ├── trigger.ts        # 触发器系统
│   └── sky.ts            # 天空/天气系统
├── components/            # 内置组件（数据）
│   ├── transform.ts      # 变换组件
│   ├── renderable.ts     # 渲染组件
│   ├── collider.ts       # 碰撞体组件
│   ├── trigger.ts        # 触发器组件
│   └── light.ts          # 灯光组件
├── adjuncts/              # 附属物扩展
│   ├── box.ts            # 基础盒子
│   ├── wall.ts           # 墙壁
│   ├── water.ts          # 水体
│   ├── module.ts         # 外部模型
│   └── sample.ts         # 扩展示例
├── render/                # 渲染后端
│   ├── backend.ts        # 渲染抽象接口
│   ├── three/            # Three.js 实现
│   │   ├── renderer.ts   # Three.js 渲染器
│   │   ├── factory.ts    # 对象工厂
│   │   ├── geometries.ts # 几何体
│   │   ├── materials.ts  # 材质
│   │   └── lights.ts     # 光源
│   └── canvas2d/         # 2D Canvas 实现
│       └── renderer.ts   # 2D 渲染器
├── app/                   # 应用层
│   ├── world.ts          # World 入口
│   ├── editor.ts         # 编辑器
│   └── game.ts           # 游戏运行时
├── effects/               # 效果系统
│   ├── animation.ts      # 动画效果
│   ├── camera.ts         # 摄像机效果
│   └── scene.ts          # 场景效果
└── utils/                 # 工具函数
    ├── math.ts           # 数学计算
    ├── convert.ts        # 数据转换
    └── validate.ts       # 数据验证
```

## 开创性特性

### 1. 空间定位格栅
3D 物体的精准定位辅助系统。通过切换不同的空间格栅，实现全向 3D 定位，解决第一人称视角下的 3D 编辑难题。

### 2. 弦粒子系统
预定义的 3D 内容压缩包。基于空间联通关系自动填充，实现菜单式快速建造，降低 3D 内容创建门槛。

### 3. 链上时间
区块高度作为时间计数器。支持基于时间的内容变化，结合天气系统实现动态虚拟世界环境。

### 4. 区块哈希随机
关联区块哈希作为随机数种子。实现程序化内容的差异性——相同的种子长出不同的"树"，如同现实世界。

## 相关文档

- [类型定义](./01-types.md) - TypeScript 类型定义
- [框架核心](./02-framework.md) - 核心模块详细说明
- [弦粒子系统](./03-string-particle.md) - 空间内容快速构建
- [弦粒子协议](./03-string-particle-protocol.md) - 链上二进制格式规范
- [AI 集成](./04-ai-integration.md) - AI 驱动的 3D 游戏开发
- [时间维度](./05-time-dimension.md) - 区块链时间驱动的世界演化
- [背包系统](./06-inventory.md) - 物品拾取、存储与随机生成
- [系统效率分析](./07-efficiency.md) - 存储成本、运行性能、三层架构
- [SPP-Core 协议](./protocol.md) - 弦粒子语义塌陷协议

