# World 3D 实现文档索引

## 文档列表

本目录包含Septopus World 3D实现的完整文档系列：

1. **[架构概述](./00-architecture.md)** - 系统整体架构和设计原则
2. **[Framework核心](./01-framework.md)** - 框架核心、组件注册、缓存系统
3. **[Block系统](./02-block.md)** - Block数据结构和转换
4. **[渲染系统](./03-render.md)** - Three.js 3D渲染实现
5. **[附属物系统](./04-adjunct.md)** - 附属物定义和扩展
6. **[控制系统](./05-control.md)** - FPV/2D/观察模式控制
7. **[效果系统](./06-effects.md)** - 动画和视觉特效
8. **[事件系统](./07-event.md)** - 事件通信机制
9. **[玩家与运动](./08-player.md)** - 玩家管理和运动计算
10. **[坐标系统](./09-coordinate.md)** - 坐标转换和计算

## 快速导航

### 数据流
```
链上数据 → Raw数据 → STD数据 → 3D数据 → Three.js渲染
```

### 核心模块

| 模块 | 功能 | 文档 |
|------|------|------|
| Framework | 组件注册、缓存、队列 | [Framework核心](./01-framework.md) |
| Block | Block数据管理 | [Block系统](./02-block.md) |
| Render | 3D渲染 | [渲染系统](./03-render.md) |
| Adjunct | 附属物组件 | [附属物系统](./04-adjunct.md) |
| Control | 输入控制 | [控制系统](./05-control.md) |
| Effects | 动画特效 | [效果系统](./06-effects.md) |
| Event | 事件系统 | [事件系统](./07-event.md) |
| Player | 玩家管理 | [玩家与运动](./08-player.md) |

### 数据格式

| 格式 | 说明 | 文档 |
|------|------|------|
| Raw | 链上存储格式 | [Block系统](./02-block.md#1-raw数据链上存储格式) |
| STD | 标准中间格式 | [Framework核心](./01-framework.md#4-数据转换-2-std-data) |
| 3D | Three.js渲染格式 | [渲染系统](./03-render.md#2-数据转换) |

### 坐标系统

| 系统 | 描述 | 文档 |
|------|------|------|
| Septopus坐标 | 东X、北Y、上Z（米） | [坐标系统](./09-coordinate.md#概述) |
| Three.js坐标 | 右X、上Y、前Z（无单位） | [坐标系统](./09-coordinate.md#概述) |
| Block坐标 | [1, 4096]网格 | [坐标系统](./09-coordinate.md#1-block坐标系统) |

### 系统模式

| 模式 | 说明 | 文档 |
|------|------|------|
| NORMAL | 正常浏览模式 | [Framework核心](./01-framework.md#2-模式系统) |
| EDIT | 编辑模式 | [控制系统](./05-control.md#1-编辑模式控制) |
| GAME | 游戏模式 | [Framework核心](./01-framework.md#2-模式系统) |
| GHOST | 游客模式 | [Framework核心](./01-framework.md#2-模式系统) |

### 事件系统

| 事件类别 | 事件 | 文档 |
|----------|------|------|
| System | init, launch, update | [事件系统](./07-event.md##系统事件) |
| Block | in, out, loaded, stop | [事件系统](./07-event.md##block事件) |
| Trigger | in, hold, out | [事件系统](./07-event.md#触发器事件) |
| Player | fall, death | [事件系统](./07-event.md#玩家事件) |
| Stop | on, leave, beside | [事件系统](./07-event.md#阻拦体事件) |

### 关键技术特性

| 特性 | 描述 | 文档 |
|------|------|------|
| 空间定位格栅 | 编辑模式下的定位辅助 | [架构概述](./00-architecture.md#开创性特性) |
| 弦粒子系统 | 预定义内容压缩包 | [架构概述](./00-architecture.md#开创性特性) |
| 链上时间 | 区块高度作为时间计数 | [架构概述](./00-architecture.md#开创性特性) |
| 区块哈希随机 | 程序化内容差异性 | [架构概述](./00-architecture.md#开创性特性) |

## 代码组织

### 目录结构
```
world/engine/src/septopus/
├── core/              # 核心系统
│   ├── framework.js   # 框架核心
│   ├── world.js      # World入口
│   ├── block.js      # Block组件
│   ├── event.js      # 事件系统
│   ├── player.js     # 玩家系统
│   ├── movement.js   # 运动计算
│   ├── sky.js       # 天空系统
│   ├── time.js       # 时间系统
│   └── weather.js    # 天气系统
├── render/            # 渲染系统
│   ├── render_3d.js    # Three.js渲染
│   ├── render_2d.js    # 2D渲染
│   └── render_observe.js # 观察渲染
├── control/           # 控制系统
│   ├── control_fpv.js   # 第一人称
│   ├── control_2d.js   # 2D控制
│   └── control_observe.js # 观察控制
├── adjunct/           # 附属物系统
│   ├── basic_*.js      # 基础组件
│   ├── adjunct_*.js    # 自定义附属物
├── effects/           # 效果系统
│   ├── entry.js       # 效果入口
│   ├── mesh/          # 网格效果
│   ├── camera/        # 摄像机效果
│   └── scene/         # 场景效果
├── three/             # Three.js封装
│   ├── entry.js       # Three对象工厂
│   ├── basic/         # 基础对象
│   ├── geometry/      # 几何体
│   ├── material/      # 材质
│   └── light/         # 光源
├── lib/               # 工具库
│   ├── toolbox.js     # 工具函数
│   ├── calc.js        # 计算函数
│   └── convert.js     # 数据转换
└── io/                # 输入输出
    ├── api.js         # API接口
    └── io_ui.js       # UI交互
```

## 初始化流程

### 1. 完整启动流程
```
1. World.init() - 注册所有组件
   ↓
2. World.first() - 构建DOM结构
   ↓
3. World.initEnv() - 初始化环境
   ↓
4. World.launch() - 启动Block加载
   ↓
5. Controller.start() - 启动控制器
   ↓
6. Render.show() - 开始渲染
   ↓
7. Framework.loop() - 帧同步循环
```

### 2. 数据加载流程
```
1. API.datasource.view() - 获取Block数据
   ↓
2. World.save() - 保存Raw数据
   ↓
3. Framework.structSingle() - Raw → STD转换
   ↓
4. Framework.structRenderData() - STD → 3D转换
   ↓
5. World.prefetch() - 预加载资源
   ↓
6. Render.fresh() - 刷新场景
```

### 3. 帧同步流程
```
每帧执行：
1. 获取活动场景
   ↓
2. 执行帧同步队列
   - block_checker: 检查Block加载
   - resource_checker: 检查资源加载
   - trigger_runtime: 执行触发器
   - movement: 处理玩家运动
   - sky_checker: 更新天空
   ↓
3. 渲染场景
   ↓
4. 更新状态显示
```

## 扩展指南

### 1. 创建新附属物
参考：[附属物系统](./04-adjunct.md#扩展附属物)

```javascript
const newAdjunct = {
    hooks: {
        reg: () => ({ name, category, short, desc, version, events }),
        def: (data) => {},
        animate: (effect, param) => {}
    },
    transform: {
        raw_std: (arr, cvt) => {},
        std_3d: (stds, va) => {},
        std_active: (stds, va, cvt) => {},
        std_raw: (arr, cvt) => {},
        std_2d: (stds, face) => {}
    },
    attribute: {
        add: (p, raw) => {},
        set: (p, raw, limit) => {},
        remove: (p, raw) => {}
    },
    menu: {
        pop: (std) => {},
        sidebar: (std) => {}
    },
    task: {}
}
```

### 2. 创建新效果
参考：[效果系统](./06-effects.md#效果扩展)

### 3. 注册自定义组件
```javascript
// 在regs中添加新组件
const regs = {
    core: [...],
    render: [...],
    controller: [...],
    adjunct: [..., newAdjunct],
    plugin: [...]
}

// 执行注册
for (let cat in regs) {
    for (let i = 0; i < regs[cat].length; i++) {
        const component = regs[cat][i];
        const cfg = component.hooks.reg();
        VBW.component.reg(cfg, component);
    }
}
```

## 参考资源

### 1. 外部依赖
- [Three.js](https://threejs.org/) - 3D渲染引擎
- [React](https://react.dev/) - UI框架
- [Vite](https://vitejs.dev/) - 构建工具

### 2. 相关文档
- [World README](../README.md)
- [Engine文档](../document/engine_cn.md)
- [合约文档](../document/contract/cn/)

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2025-04-25 | 初始版本 |

## 贡献

文档基于 `world/engine/src/septopus/` 目录下的源代码自动生成。

## 许可

本文档遵循Septopus项目的开源许可协议。
