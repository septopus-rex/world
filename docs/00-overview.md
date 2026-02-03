# Septopus World 架构概述

## 系统介绍

Septopus World 是一个全链运行的 3D 虚拟世界引擎，采用模块化设计，支持组件动态加载和数据驱动的 3D 渲染。本文档为 TypeScript 重构提供架构指导。

## TypeScript 重构目标

### 1. 类型安全
- 所有公共接口使用 TypeScript 类型定义
- 启用 `strict` 模式，包括 `noImplicitAny` 和 `strictNullChecks`
- 使用 `readonly` 标记不可变数据结构
- 提供清晰的类型注解和泛型约束

### 2. 模块化架构
- 将大型文件拆分为职责单一的模块
- 定义清晰的组件接口契约
- 减少循环依赖，使用依赖注入模式

### 3. 语义化设计
- 保持原系统的语义化坐标系统和数据结构
- 使用有意义的类型名称和接口定义
- 保持事件系统、数据流的原有逻辑

### 4. 可扩展性
- 定义可扩展的组件接口
- 支持运行时组件注册
- 保持插件系统的灵活性

## 核心设计原则

### 1. 组件化架构
所有功能以组件形式注册到 Framework，组件分为以下类别：

| 类别 | 说明 | 示例 |
|------|------|------|
| `system` | 核心系统组件 | Block, Event, Player |
| `render` | 渲染组件 | Three.js 渲染器, 2D 渲染器 |
| `controller` | 控制组件 | FPV 控制器, 2D 控制器 |
| `adjunct` | 附属物组件 | Box, Wall, Water, Trigger |
| `datasource` | 数据源组件 | API 数据获取 |
| `plugin` | 插件组件 | 外部程序交互 |

### 2. 数据驱动转换

```
链上数据 → Raw数据 → STD数据 → 3D数据 → 渲染
  (IPFS)   (存储格式) (中间格式) (渲染格式) (Three.js)
```

- **Raw 数据**: 链上存储的原始格式，紧凑高效
- **STD 数据**: 标准中间格式，便于处理和转换
- **3D 数据**: Three.js 渲染格式，包含位置、材质、动画等

### 3. 语义化坐标系统

**Septopus 坐标系**:
- X: 东西方向 (+东, -西)
- Y: 南北方向 (+北, -南)
- Z: 高度方向 (+向上, -向下)
- 单位: 米
- 原点: 西南角 Block[1,1] 的中心点

**Three.js 坐标系**:
- X: 水平右方向
- Y: 垂直向上方向
- Z: 水平向前方向
- 单位: 无单位

**坐标转换**:
```typescript
// Septopus → Three.js
[x_septopus, z_septopus, -y_septopus]

// Three.js → Septopus
[x_three, -z_three, y_three]
```

### 4. 事件驱动

统一事件系统支持跨组件通信：

| 事件类别 | 事件示例 |
|----------|----------|
| System | `init`, `launch`, `update` |
| Block | `in`, `out`, `loaded`, `stop` |
| Trigger | `in`, `hold`, `out` |
| Player | `fall`, `death`, `rotate` |
| Stop | `on`, `leave`, `beside` |
| Module | `parsed` |

### 5. 帧同步循环

每帧执行固定序列：
1. 获取活动场景
2. 执行帧同步队列（Block 检查、资源检查、触发器运行、运动计算）
3. 渲染场景
4. 更新状态显示

## 模块结构

```
septopus/
├── types/              # TypeScript 类型定义
│   ├── index.ts       # 类型导出
│   ├── core.ts        # 核心数据类型
│   ├── component.ts   # 组件接口
│   ├── event.ts       # 事件类型
│   └── coordinate.ts  # 坐标类型
├── core/               # 核心系统
│   ├── framework.ts   # 框架核心
│   ├── world.ts       # World 入口
│   ├── block.ts       # Block 组件
│   ├── event.ts       # 事件系统
│   ├── player.ts      # 玩家系统
│   └── movement.ts    # 运动计算
├── render/             # 渲染系统
│   ├── renderer-3d.ts # Three.js 渲染
│   ├── renderer-2d.ts # 2D 渲染
│   └── textures/      # 纹理管理
├── control/            # 控制系统
│   ├── fpv.ts         # 第一人称控制
│   ├── 2d.ts          # 2D 控制
│   └── observe.ts     # 观察模式
├── adjunct/            # 附属物系统
│   ├── box.ts         # 基础盒子
│   ├── wall.ts        # 墙壁
│   ├── water.ts       # 水体
│   ├── light.ts       # 灯光
│   └── trigger.ts     # 触发器
├── effects/            # 效果系统
│   ├── animations.ts  # 动画效果
│   ├── camera.ts      # 摄像机效果
│   └── scene.ts       # 场景效果
├── three/              # Three.js 封装
│   ├── factory.ts     # 对象工厂
│   ├── geometries.ts  # 几何体
│   ├── materials.ts   # 材质
│   └── lights.ts      # 光源
└── utils/              # 工具函数
    ├── math.ts        # 数学计算
    ├── convert.ts     # 数据转换
    └── validate.ts    # 数据验证
```

## 系统模式

| 模式 | 说明 | 特点 |
|------|------|------|
| `normal` | 正常浏览模式 | 自由浏览，可交互 |
| `edit` | 编辑模式 | 显示编辑辅助，可修改内容 |
| `game` | 游戏模式 | 阻止网络请求，启用游戏逻辑 |
| `ghost` | 游客模式 | 只读访问 |

## 性能优化

### 1. 缓存策略
- **Block 缓存**: 已加载 Block 的 Raw/STD/3D 数据
- **资源缓存**: 纹理、模块等资源全局缓存
- **LRU 管理**: 超出范围 Block 自动卸载

### 2. 渐进加载
- 预加载队列: `block_loading`, `resource_loading`
- 显示占位符: Block 数据加载中显示 holder
- 资源去重: 同一纹理/模块只加载一次

### 3. 视锥裁剪
- 只渲染玩家 extend 范围内的 Block
- 超出范围 Block 自动卸载释放内存

### 4. 批量更新
- 修改任务队列累积
- 批量执行减少缓存操作

## 初始化流程

```
1. World.init()
   └─ 注册所有组件到 Framework
   └─ 触发 system.init 事件

2. World.first(dom_id, cfg)
   └─ 构建 DOM 结构
   └─ 初始化渲染环境

3. World.initEnv(dom_id)
   └─ 获取玩家位置
   └─ 设置摄像机和场景

4. World.launch(dom_id, x, y, ext, world)
   └─ 从数据源加载 Block
   └─ 保存并转换数据
   └─ 预加载资源

5. Controller.start(dom_id)
   └─ 启动输入控制
   └─ 注册帧同步函数

6. Render.show(dom_id)
   └─ 开始渲染循环
   └─ 触发 system.launch 事件

7. Framework.loop()
   └─ 帧同步循环启动
```

## 扩展机制

### 1. 附属物扩展

```typescript
interface IAdjunctComponent {
    hooks: {
        reg: () => IAdjunctRegistration;
        def?: (data: any) => void;
        animate?: (effect: number, param: any) => IAnimation;
    };
    transform: ITransformHandlers;
    attribute: IAttributeHandlers;
    menu?: IMenuHandlers;
    task?: Record<string, Function>;
}
```

### 2. 效果扩展

```typescript
interface IEffect {
    (params: IEffectParams): (config: any) => void;
}
```

### 3. 插件扩展

```typescript
interface IPlugin {
    hooks: {
        reg: () => IPluginRegistration;
    };
    task: Record<string, Function>;
}
```

## 相关文档

- [类型定义](./01-types.md) - TypeScript 类型定义
- [框架核心](./02-framework.md) - Framework 详细说明
- [Block 系统](./03-block.md) - Block 数据和转换
- [附属物系统](./04-adjunct.md) - 附属物组件
- [控制系统](./05-control.md) - 输入和交互
- [效果系统](./06-effects.md) - 动画和特效
- [事件系统](./07-event.md) - 事件通信机制
- [玩家系统](./08-player.md) - 玩家管理和运动
- [坐标系统](./09-coordinate.md) - 坐标转换
- [渲染系统](./10-render.md) - Three.js 渲染
