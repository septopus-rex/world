# Septopus World

Solana 链上 3D 虚拟世界引擎。当前处于 Launch Period（2025.6.19 - 2027.6.18），运行在 Solana Devnet。

## 项目结构

```
world/
├── engine/          # 3D 引擎（JS/JSX，核心代码）
│   └── src/septopus/
│       ├── core/        # 框架、世界、Block、玩家、事件
│       ├── render/      # Three.js 3D/2D/观察者渲染
│       ├── control/     # FPV/2D/观察者控制器
│       ├── adjunct/     # 附属物组件（墙、水、灯光、触发器等）
│       ├── effects/     # 动画和视觉特效
│       ├── io/          # API、数据源、UI
│       ├── lib/         # 工具函数
│       ├── plugin/      # 插件
│       └── three/       # Three.js 封装
├── app/             # React 前端（Vite + TypeScript）
├── chain/           # Solana 合约（Anchor/Rust）
├── sample/          # 示例数据（岩石、天气等）
├── docs/            # 架构文档（TypeScript 重构参考）
└── document/        # 合约、治理文档
```

## 常用命令

```bash
# 前端开发（React App）
cd app && npm run dev        # 启动开发服务器
cd app && npm run build      # 构建

# 引擎开发
cd engine && npm run dev     # 启动引擎开发服务器
cd engine && npm run build   # 构建引擎

# 合约
cd chain && npm run lint     # 代码检查
```

## 核心概念

- **Block**: 世界的基本单元，4096x4096 网格，每个 Block 16x16 米
- **Adjunct**: 附属物，附着在 Block 上的 3D 对象（墙、水、灯光、触发器等）
- **Framework (VBW)**: 全局框架实例，所有组件注册到此
- **数据流**: 链上数据(IPFS) → Raw → STD → 3D → Three.js 渲染
- **坐标系**: Septopus(X东Y北Z上) ↔ Three.js(X右Y上Z前)

## 关键入口

- `engine/src/septopus/app.js` — 引擎启动入口，`Septo.launch()`
- `engine/src/septopus/core/world.js` — World 生命周期（init/first/launch/edit/modify）
- `engine/src/septopus/core/framework.js` — 全局框架 VBW
- `app/src/App.tsx` — React 前端入口

## World 操作 API

```javascript
// 核心操作（在 world.js 中暴露）
World.first(container, ck, cfg)              // 首次启动
World.edit(container, world_index, x, y)     // 进入编辑模式
World.normal(container, world_index)         // 退回正常模式
World.select(container, world_index, x, y, adjunct, index, face)  // 选中附属物
World.modify(tasks, container, world_index, ck)  // 批量修改附属物

// 修改任务格式
{ adjunct: "wall", action: "set", param: { z: 8, index: 0 } }
{ adjunct: "wall", action: "add", param: { ox: 3, oy: 12 } }
{ adjunct: "wall", action: "del", param: { id: 1 } }
{ adjunct: "module", action: "set", param: { id: 0, oz: 3 } }
```

## 文档索引

- `docs/00-overview.md` — 系统架构和设计原则
- `docs/01-types.md` — TypeScript 类型定义
- `docs/02-framework.md` — 框架核心、组件注册、缓存系统
- `docs/03-block.md` — Block 数据结构和转换
- `docs/04~10` — 待完成（adjunct/control/effects/event/player/coordinate/render）
- `document/contract/cn/` — 合约模块文档（world/king/rules/AIs/resource）
- `document/governance_cn.md` — 治理体系

## 开发注意事项

- 引擎核心代码目前是 JavaScript，计划迁移到 TypeScript（参考 docs/ 中的类型定义）
- 合约在 Solana Devnet，地址: `4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2`
- 有 actuator 机制支持外部程序与 3D 事件交互（`cfg.actuator`）
- 组件通过 `VBW.register()` 注册，遵循 hooks/transform/attribute/menu/task 接口
