# Septopus World 文档索引

本目录包含 Septopus World 3D 引擎的完整文档，用于 TypeScript 重构参考。

## 快速导航

### 核心文档

| 文档 | 说明 | 状态 |
|------|------|------|
| [00-概述](./00-overview.md) | 系统整体架构和设计原则 | ✅ 完成 |
| [01-类型定义](./01-types.md) | TypeScript 类型定义 | ✅ 完成 |
| [02-Framework](./02-framework.md) | 框架核心、组件注册、缓存系统 | ✅ 完成 |
| [03-Block](./03-block.md) | Block 数据结构和转换 | ✅ 完成 |

### 系统文档

| 文档 | 说明 | 状态 |
|------|------|------|
| [04-附属物](./04-adjunct.md) | 附属物组件和扩展 | ⏳ 待完成 |
| [05-控制](./05-control.md) | FPV/2D/观察模式控制 | ⏳ 待完成 |
| [06-效果](./06-effects.md) | 动画和视觉特效 | ⏳ 待完成 |
| [07-事件](./07-event.md) | 事件通信机制 | ⏳ 待完成 |
| [08-玩家](./08-player.md) | 玩家管理和运动计算 | ⏳ 待完成 |
| [09-坐标](./09-coordinate.md) | 坐标转换和计算 | ⏳ 待完成 |
| [10-渲染](./10-render.md) | Three.js 3D 渲染 | ⏳ 待完成 |

### 历史文档

| 文档 | 说明 |
|------|------|
| [old/](./old/) | 原始文档（参考用）|

## 数据流

```
链上数据 → Raw 数据 → STD 数据 → 3D 数据 → Three.js 渲染
  (IPFS)     (存储格式)   (中间格式)   (渲染格式)
```

## 核心模块

| 模块 | 功能 | 文档 |
|------|------|------|
| Framework | 组件注册、缓存、队列 | [Framework](./02-framework.md) |
| Block | Block 数据管理 | [Block](./03-block.md) |
| Adjunct | 附属物组件 | [Adjunct](./04-adjunct.md) |
| Control | 输入控制 | [Control](./05-control.md) |
| Effects | 动画特效 | [Effects](./06-effects.md) |
| Event | 事件系统 | [Event](./07-event.md) |
| Player | 玩家管理 | [Player](./08-player.md) |
| Render | 3D 渲染 | [Render](./10-render.md) |

## 数据格式

| 格式 | 说明 | 文档 |
|------|------|------|
| Raw | 链上存储格式 | [Block](./03-block.md#raw-数据链上存储格式) |
| STD | 标准中间格式 | [类型定义](./01-types.md#block-stddata) |
| 3D | Three.js 渲染格式 | [类型定义](./01-types.md#three-数据) |

## 坐标系统

| 系统 | 描述 | 文档 |
|------|------|------|
| Septopus | 东 X、北 Y、上 Z（米） | [坐标](./09-coordinate.md) |
| Three.js | 右 X、上 Y、前 Z（无单位） | [坐标](./09-coordinate.md) |
| Block | [1, 4096] 网格 | [Block](./03-block.md) |

## 系统模式

| 模式 | 说明 | 文档 |
|------|------|------|
| Normal | 正常浏览模式 | [概述](./00-overview.md#系统模式) |
| Edit | 编辑模式 | [Framework](./02-framework.md#模式系统) |
| Game | 游戏模式 | [概述](./00-overview.md#系统模式) |
| Ghost | 游客模式 | [概述](./00-overview.md#系统模式) |

## 事件系统

| 事件类别 | 事件 | 文档 |
|----------|------|------|
| System | init, launch, update | [Event](./07-event.md) |
| Block | in, out, loaded, stop | [Event](./07-event.md) |
| Trigger | in, hold, out | [Event](./07-event.md) |
| Player | fall, death | [Event](./07-event.md) |
| Stop | on, leave, beside | [Event](./07-event.md) |

## 初始化流程

### 完整启动流程

```
1. World.init() - 注册所有组件
   ↓
2. World.first() - 构建 DOM 结构
   ↓
3. World.initEnv() - 初始化环境
   ↓
4. World.launch() - 启动 Block 加载
   ↓
5. Controller.start() - 启动控制器
   ↓
6. Render.show() - 开始渲染
   ↓
7. Framework.loop() - 帧同步循环
```

### 数据加载流程

```
1. API.datasource.view() - 获取 Block 数据
   ↓
2. World.save() - 保存 Raw 数据
   ↓
3. Framework.structSingle() - Raw → STD 转换
   ↓
4. Framework.structRenderData() - STD → 3D 转换
   ↓
5. World.prefetch() - 预加载资源
   ↓
6. Render.fresh() - 刷新场景
```

### 帧同步流程

```
每帧执行：
1. 获取活动场景
   ↓
2. 执行帧同步队列
   - block_checker: 检查 Block 加载
   - resource_checker: 检查资源加载
   - trigger_runtime: 执行触发器
   - movement: 处理玩家运动
   - sky_checker: 更新天空
   ↓
3. 渲染场景
   ↓
4. 更新状态显示
```

## 代码组织

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

## 扩展指南

### 创建新附属物

参考：[附属物系统](./04-adjunct.md)

```typescript
import type { IComponent } from './types';

const newAdjunct: IComponent = {
    hooks: {
        reg: () => ({
            name: 'custom_adjunct',
            category: 'adjunct',
            short: 'ca',
            desc: 'Custom adjunct description',
            version: '1.0.0',
            events: ['in', 'out', 'touch'],
        }),
        def: (data) => { /* 定义数据 */ },
        animate: (effect, param) => { /* 动画定义 */ }
    },
    transform: {
        raw_std: (arr, cvt) => { /* Raw → STD */ },
        std_3d: (stds, va) => { /* STD → 3D */ },
        std_active: (stds, va, cvt) => { /* 编辑高亮 */ },
        std_raw: (arr, cvt) => { /* STD → Raw */ },
    },
    attribute: {
        add: (p, raw) => { /* 添加 */ },
        set: (p, raw, limit) => { /* 设置 */ },
        remove: (p, raw) => { /* 删除 */ },
    },
    menu: {
        pop: (std) => { /* 弹出菜单 */ },
        sidebar: (std) => { /* 侧边栏菜单 */ }
    },
    task: { /* 任务函数 */ }
};
```

### 创建新效果

参考：[效果系统](./06-effects.md)

## 关键技术特性

| 特性 | 描述 | 文档 |
|------|------|------|
| 空间定位格栅 | 编辑模式下的定位辅助 | [概述](./00-overview.md) |
| 弦粒子系统 | 预定义内容压缩包 | [概述](./00-overview.md) |
| 链上时间 | 区块高度作为时间计数 | [概述](./00-overview.md) |
| 区块哈希随机 | 程序化内容差异性 | [概述](./00-overview.md) |

## 相关资源

### 外部依赖
- [Three.js](https://threejs.org/) - 3D 渲染引擎
- [TypeScript](https://www.typescriptlang.org/) - 类型系统

### 相关文档
- [Engine 文档](../document/engine_cn.md)
- [合约文档](../document/contract/cn/)
- [原始文档](./old/)

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 2.0.0 | 2026-02-04 | TypeScript 重构文档 |

## 贡献

文档基于 TypeScript 重构目标创建，保持系统语义化，对 AI 友好。
