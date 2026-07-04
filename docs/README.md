# Septopus World 文档

> 文档分**三层**;找错层是本仓文档最常见的迷路方式:
>
> | 层 | 去哪里 | 回答什么问题 |
> |---|---|---|
> | **协议(规范)** | [`protocol/`](../protocol/README.cn.md)(cn/en 双语,[EN](../protocol/README.md)) | 数据长什么样?换个引擎怎么保证同一个世界?(**发布物**) |
> | **参考实现(本目录)** | `docs/architecture` · `docs/systems` · `docs/guides` · `docs/api` | 本 TS 引擎怎么实现协议? |
> | **过程(非规范)** | [`docs/plan/`](plan/) | 为什么这么设计?做到哪了?(roadmap + 18 篇实现规格) |
>
> 现行版本记录:根 [CHANGELOG.md](../CHANGELOG.md);发版与部署:[deploy/RELEASE.md](../deploy/RELEASE.md)。

## 🧭 先读:世界总览

不确定 Septopus 世界怎么构成、为什么这么设计?先读协议层的
[**overview 总览**](../protocol/cn/overview.md)([EN](../protocol/en/overview.md))
——世界←地块←附属物、时间/天气如何推导、为什么一切都是数据。

## 🚀 上手 (`guides/`)

| 文档 | 说明 |
|------|------|
| [快速开始](./guides/getting-started.md) | 跑起来 + 最小嵌入 + 三种造内容方式 |
| [创建附属物](./guides/creating-adjunct.md) | 扩展新 adjunct 类型(带早期稿注记,以代码为准) |
| [编写插件](./guides/creating-plugin.md) | 系统级扩展(带早期稿注记) |

## 📐 架构 (`architecture/`)

| 文档 | 说明 |
|------|------|
| [系统概述](./architecture/overview.md) | 分层架构、数据管线、性能策略 |
| [ECS 设计](./architecture/ecs.md) | Entity-Component-System 架构 |
| [数据管线](./architecture/pipeline.md) | 压缩格式 → 渲染的全生命周期 |
| [坐标系统](./architecture/coordinate.md) | 轴序与旋转(规范级内容已上提 [protocol/world.md §5](../protocol/cn/world.md)) |
| [性能优化](./architecture/performance.md) | 优化策略与资源回收 |

## ⚙️ 系统 (`systems/`)

adjunct · animation · block · environment · framework · game-mode-entry ·
physics · player · render · trigger —— 各引擎系统的行为说明(部分带
「历史设计稿」横幅,横幅内注明现行实现入口)。

## 🧩 专题 (`features/`)

SPP 弦粒子(spp-core/spp-protocol/spp)、AI 集成、动态 adjunct、背包、
时间维度、效率。

## 🗺️ 计划与规格 (`plan/`,非规范)

| 文档 | 说明 |
|------|------|
| [路线图](./plan/STANDALONE_ENGINE_ROADMAP.md) | 链剥离记录 + 旧引擎退役 + P1–P5 |
| [可玩化清单](./plan/PLAYABLE_CHECKLIST.md) | 从技术 demo 到可玩产品的 gap 追踪 |
| [游戏系统缺口](./plan/GAME_SYSTEMS_BACKLOG.md) | F1 调度 · F2 NPC · F3 战斗 · F4 对话 |
| [specs/*](./plan/specs/) | 18 篇实现规格(状态注记在各文件头;**设计定稿+实现追踪,非协议**) |

## 🗄️ 其它

- [`api/types.md`](./api/types.md) — TS 重构期类型设计稿(带历史横幅)
- [`legacy/`](./legacy/README.md) — 旧引擎时代归档(旧 changelog、旧入门等)
- 链上存储文档已随链剥离归档至 `chain/docs/`(不在版本库内)
