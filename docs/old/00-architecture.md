# World 3D 架构概述

## 系统介绍

Septopus World 是一个全链运行的3D虚拟世界引擎，采用模块化设计，支持组件动态加载和数据驱动的3D渲染。

## 核心设计原则

### 1. 组件化架构
- 所有功能以组件形式注册到 Framework
- 组件分为多个类别：`system`、`render`、`controller`、`adjunct`、`datasource`、`plugin`
- 每个组件通过 `hooks` 系统实现生命周期管理

### 2. 数据驱动
- 链上数据 → Raw数据 → STD数据 → 3D数据 → 渲染
- 多层转换确保数据格式适配不同组件
- 缓存系统优化数据访问性能

### 3. 语义化坐标系统
- **Septopus坐标系**：X(东西)，Y(南北)，Z(高度)
- **Three.js坐标系**：转换为 [X, Z, -Y] 格式
- **Block定位**：每个Block为16M×16M，坐标 [1,1] 到 [4096,4096]

### 4. 事件驱动
- 统一事件系统支持跨组件通信
- 关键事件：`system.init`、`system.launch`、`block.loaded`、`trigger.in/out` 等
- 支持对象级事件绑定

## 核心模块结构

```
septopus/
├── core/              # 核心系统
│   ├── framework.js   # 框架核心，组件注册、缓存、队列管理
│   ├── world.js      # World入口，初始化流程
│   ├── block.js      # Block组件，土地块管理
│   ├── event.js      # 事件系统
│   ├── player.js     # 玩家系统
│   ├── movement.js   # 运动计算
│   ├── sky.js       # 天空系统
│   ├── time.js       # 时间系统
│   └── weather.js    # 天气系统
├── render/            # 渲染系统
│   ├── render_3d.js    # Three.js 3D渲染
│   ├── render_2d.js    # 2D渲染
│   └── render_observe.js # 观察模式
├── control/           # 控制系统
│   ├── control_fpv.js   # 第一人称控制
│   ├── control_2d.js   # 2D控制
│   └── control_observe.js # 观察控制
├── adjunct/           # 附属物系统
│   ├── basic_box.js      # 基础盒子
│   ├── basic_light.js    # 灯光
│   ├── basic_trigger.js  # 触发器
│   ├── basic_stop.js     # 阻拦体
│   ├── basic_module.js   # 模块
│   ├── adjunct_wall.js   # 墙壁
│   └── ...
├── effects/           # 效果系统
│   ├── entry.js         # 效果入口
│   ├── mesh/            # 网格效果
│   ├── camera/          # 摄像机效果
│   └── scene/           # 场景效果
├── three/             # Three.js封装
│   ├── entry.js         # Three对象工厂
│   ├── basic/           # 基础对象
│   ├── geometry/        # 几何体
│   ├── material/        # 材质
│   └── light/           # 光源
├── lib/               # 工具库
│   ├── toolbox.js       # 工具函数
│   ├── calc.js          # 计算函数
│   └── convert.js       # 数据转换
└── io/                # 输入输出
    ├── api.js           # API接口
    └── io_ui.js        # UI交互
```

## 数据流

### 1. 数据加载流程
```
链上数据/IPFS
    ↓
API.datasource.view()
    ↓
Block Raw数据 → Block Raw缓存
    ↓
framework.structSingle() → STD数据
    ↓
framework.structRenderData() → 3D数据
    ↓
渲染器创建Three对象
```

### 2. 数据格式

#### Raw数据 (链上存储格式)
```javascript
[
    elevation,    // Block标高
    status,       // Block状态
    [],           // 附属物数组: [[short, [data]], ...]
    gameSetting   // 游戏设置
]
```

#### STD数据 (标准中间格式)
```javascript
{
    block: [
        {
            x, y, z,              // 尺寸
            ox, oy, oz,          // 偏移
            rx, ry, rz,          // 旋转
            elevation,             // 标高
            material: { texture, color, repeat },
            status,
            game
        }
    ],
    wall: [...],   // 附属物按short key组织
    trigger: [...],
    ...
}
```

#### 3D数据 (Three.js渲染格式)
```javascript
{
    type: "box",
    index: 0,
    params: {
        size: [x, y, z],
        position: [ox, oy, oz],
        rotation: [rx, ry, rz]
    },
    material: {
        texture: ThreeTexture,
        color: 0x...
    },
    animate: { router, param },
    stop: { opacity, color }
}
```

## 坐标系统转换

### Septopus → Three.js
```javascript
// 世界坐标转换
transform = [arr[0], arr[2], -arr[1]];

// 块内坐标
const x = (block_x - 1) * side + ox;
const y = (block_y - 1) * side + oy;  
const z = oz;
three_position = [x, z, -y];
```

### Three.js → Septopus
```javascript
septopus_x = three_x;
septopus_y = -three_z;
septopus_z = three_y;
```

## 渲染管线

### 帧同步 (Frame Synchronization)
```javascript
VBW.loop = (ev) => {
    // 1. 获取活动场景
    const dom_id = VBW.cache.get(["active", "current"]);
    const active = VBW.getActive(dom_id);

    // 2. 执行帧同步队列
    const list = VBW.getLoopQueue(world, dom_id);
    for (const item of list) {
        if (item.fun) item.fun();
    }

    // 3. 渲染场景
    active.render.render(active.scene, active.camera);
    active.status.update();
}
```

### 动画系统
```javascript
// 效果定义
{
    name: "rotate",
    duration: 0,        // 0=无限循环
    loops: 0,           // 循环次数
    category: "mesh",
    timeline: [
        {
            type: "rotate",
            mode: "add",    // add/set
            axis: "XYZ",
            time: 0,
            value: Math.PI / 180
        }
    ]
}

// 动画执行
const fn = Effects.decode(std, category);
fn(meshes, frame);
```

## 事件系统

### 事件分类
```javascript
events: {
    system: ["init", "launch", "off", "restart", "update"],
    block: ["in", "out", "hold", "stop", "loaded", "cross", "unload"],
    trigger: ["in", "hold", "out"],
    stop: ["on", "leave", "beside"],
    player: ["fall", "death", "start", "hold", "rotate"],
    module: ["parsed"]
}
```

### 事件绑定
```javascript
// 全局事件
VBW.event.on("system", "init", (ev) => {
    console.log("System initialized", ev.stamp);
});

// 对象级事件
const target = { x: 2025, y: 619, world: 0, adjunct: "block", index: 0 };
VBW.event.on("block", "in", (ev) => {
    console.log("Entered block", ev);
}, target);
```

### 事件触发
```javascript
VBW.event.trigger("block", "loaded", {
    stamp: Toolbox.stamp()
}, target);
```

## 模式系统

### 系统模式
```javascript
MODE_NORMAL: "normal",     // 正常浏览模式
MODE_EDIT: "edit",       // 编辑模式
MODE_GAME: "game",       // 游戏模式
MODE_GHOST: "ghost"     // 游客模式
```

### 模式切换
```javascript
VBW.mode(mode, target, (pre) => {
    // 预加载数据
    VBW.prefetch(pre.texture, pre.module, (failed) => {
        VBW[config.render].show(container, [x, y, world]);
    });
});
```

## 性能优化

### 1. 缓存策略
- **Block缓存**：已加载Block的Raw/STD/3D数据
- **资源缓存**：纹理、模块等资源全局缓存
- **LRU管理**：超出范围Block自动卸载

### 2. 渐进加载
- 预加载队列：`block_loading`、`resource_loading`
- 显示占位符：Block数据加载中显示holder
- 资源去重：同一纹理/模块只加载一次

### 3. 视锥裁剪
- 只渲染玩家extend范围内的Block
- 超出范围Block自动卸载释放内存

### 4. 批量更新
- 修改任务队列累积
- 批量执行减少缓存操作

## 扩展机制

### 1. Adjunct扩展
```javascript
const reg = {
    name: "custom_adjunct",
    category: 'adjunct',
    short: "ca",
    desc: "Custom adjunct",
    version: "1.0.0",
    events: ["in", "out", "touch"]
}

const hooks = {
    reg: () => { return reg },
    def: (data) => { definition = data },
    animate: (effect, param) => { ... }
}

const transform = {
    raw_std: (arr, cvt) => { ... },
    std_3d: (stds, va) => { ... }
}
```

### 2. Plugin扩展
```javascript
// 实现外部程序交互
const plugin = {
    hooks: { reg: () => reg },
    task: { ... }
}
```

### 3. Effect扩展
```javascript
const effect = {
    type: "move",
    handler: ({ mesh }, config, frame) => {
        mesh.position[config.axis] += config.value;
    }
}
```

## 关键技术特性

### 1. 空间定位格栅
- 编辑模式下的定位辅助系统
- 支持全向3D定位
- 通过切换不同空间格栅实现精准放置

### 2. 弦粒子系统
- 预定义的3D内容压缩包
- 基于空间联通关系自动填充
- 菜单式快速建造

### 3. 链上时间
- 区块高度作为时间计数器
- 支持基于时间的内容变化
- 结合天气系统实现动态环境

### 4. 区块哈希随机
- 关联区块哈希作为随机数种子
- 实现程序化内容的差异性
- 相同种子产生相似但不同的结果

## 初始化流程

```javascript
// 1. 注册所有组件
World.init() {
    self.register();
    VBW.event.trigger("system", "init", { stamp: Toolbox.stamp() });
}

// 2. 构建DOM结构
World.first(dom_id, ck, cfg) {
    self.struct(dom_id, cfg);
    self.runOnce(dom_id, cfg);
}

// 3. 初始化环境
World.initEnv(dom_id, ck) {
    VBW.player.start(dom_id, (start) => {
        VBW.datasource.world(world, (wd) => {
            self.setup(wd);
            VBW.player.initial(local, dom_id);
            VBW.event.start(world, dom_id);
        })
    });
}

// 4. 启动Block
self.launch(dom_id, x, y, ext, world, limit, ck) {
    VBW.datasource.view(x, y, ext, world, (map) => {
        self.save(dom_id, world, map, world_info);
        VBW.load(range, (pre) => {
            self.prefetch(pre.texture, pre.module, (failed) => {
                VBW[config.controller].start(dom_id);
                VBW[config.render].show(dom_id);
            });
        });
    });
}
```

## 参考文档

- [Framework核心](./01-framework.md)
- [Block系统](./02-block.md)
- [渲染系统](./03-render.md)
- [附属物系统](./04-adjunct.md)
- [控制系统](./05-control.md)
- [效果系统](./06-effects.md)
- [事件系统](./07-event.md)
- [玩家与运动](./08-player.md)
- [坐标系统](./09-coordinate.md)
