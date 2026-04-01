# Septopus World 引擎文档

> 面向引擎开发者的技术文档索引

---

## 📐 架构设计 (`architecture/`)

引擎的整体设计、分层架构和核心理念。

| 文档 | 说明 |
|------|------|
| [系统概述](./architecture/overview.md) | 分层架构、数据管线、性能优化策略 |
| [ECS 设计](./architecture/ecs.md) | Entity-Component-System 架构的详细定义 |
| [数据管线](./architecture/pipeline.md) | 数据流从压缩格式到渲染管线的全生命周期 |
| [坐标系统](./architecture/coordinate.md) | Septopus 左手系与网格对齐逻辑 |
| [性能优化](./architecture/performance.md) | 性能优化策略和资源回收机制 |

---

## ⚙️ 核心系统 (`systems/`)

引擎各核心模块的详细实现说明。

| 文档 | 说明 |
|------|------|
| [框架核心](./systems/framework.md) | Engine 入口、SceneManager、Scheduler、状态机 |
| [地块系统 (Block)](./systems/block.md) | 基础空间数据单元与无缝加载 |
| [附属物系统 (Adjunct)](./systems/adjunct.md) | 插件化的组件加载机制 |
| [玩家与运动 (Player)](./systems/player.md) | 状态流转、虚拟化身及控制逻辑 |
| [物理与碰撞 (Physics)](./systems/physics.md) | 射线检测、阻拦器(Stop)与坠落算法 |
| [事件与触发器 (Trigger)](./systems/trigger.md) | 全局事件总线与实体响应包围盒 |
| [渲染管线 (Render)](./systems/render.md) | Three.js 资源加载、解包编排与生命周期 |
| [特效与动画 (Animation)](./systems/animation.md) | 数据驱动的声明式帧同步动画组件 |
| [世界与环境 (Environment)](./systems/environment.md) | 宇宙架构、参数化天气与时间体系 |

---

## ✨ 特色功能 (`features/`)

Septopus World 的独创功能和协议设计。

| 文档 | 说明 |
|------|------|
| [SPP-Core 语义协议](./features/spp-core.md) | 弦粒子极简协议，空间语义塌陷的核心定义 |
| [弦粒子系统](./features/spp.md) | 引擎侧实现：构型定义、展开算法、主题系统、构建流程 |
| [弦粒子二进制协议](./features/spp-protocol.md) | 链上二进制格式：字节布局、RLE 压缩、编解码器 |
| [AI 集成](./features/ai-integration.md) | AI 驱动的 3D 游戏开发工作流 |
| [时间维度](./features/time-dimension.md) | 区块链时间驱动的世界演化：老化、生长、天气、季节 |
| [背包系统](./features/inventory.md) | 物品拾取、存储、交易与随机生成 |
| [系统效率分析](./features/efficiency.md) | 存储成本、运行性能、三层架构效率估算 |

---

## 📖 开发指南 (`guides/`)

帮助开发者快速上手引擎生态。

| 文档 | 说明 |
|------|------|
| [快速开始](./guides/getting-started.md) | 引擎引导启动流程与核心初始化说明 |
| [创建附属物](./guides/creating-adjunct.md) | 如何编写自定义组件并关联模型动画 |
| [编写插件](./guides/creating-plugin.md) | 如何开发连接外部协议或 UI 的系统级组件 |
| [TypeScript 重构计划](./guides/ts-refactor.md) | 从 JS 迁移到 TS 及 SPP 协议集成的实施路径 |

---

## 📋 API 参考 (`api/`)

| 文档 | 说明 |
|------|------|
| [类型定义](./api/types.md) | 全部 TypeScript 接口和枚举定义 |

---

## 📝 版本记录 (`changelog/`)

| 版本 | 说明 |
|------|------|
| [v1.0.0](./changelog/v1.0.0.md) | 初始版本 |
| [v1.1.0](./changelog/v1.1.0.md) | 功能更新 |

---

## 相关文档目录

| 目录 | 面向读者 | 说明 |
|------|---------|------|
| [`/protocol/`](../protocol/README.md) | 生态开发者 | SPP 协议规范（中英双语） |
| [`/backup/document/`](../backup/document/) | 非技术参与者 | 合约说明、治理文档（原始备份） |

---

## 推荐阅读顺序

1. **入门** → [系统概述](./architecture/overview.md) → [快速开始](./guides/getting-started.md)
2. **深入引擎** → [ECS 设计](./architecture/ecs.md) → [地块系统](./systems/block.md) → [附属物](./systems/adjunct.md)
3. **理解核心创新** → [SPP-Core](./features/spp-core.md) → [弦粒子系统](./features/spp.md)
4. **扩展阅读** → [时间和环境](./systems/environment.md) → [物理逻辑](./systems/physics.md)
5. **性能与成本** → [效率分析](./features/efficiency.md)

---

## 归档文档 (Legacy Content)

包含历史文档原始文件，仅供参考：

- `backup/docs_old/` — 初期架构文稿
- `engine/src/septopus/docs/` — 原始 JS 引擎的开发文档 (将逐步清理)
