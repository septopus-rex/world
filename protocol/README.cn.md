[English](README.md) | **中文**

# Septopus 世界协议

Septopus 世界协议定义一个**跨引擎、纯数据的 3D 世界**:世界、地块、附属物、
交互与玩法全部是带确定性钉点的纯数据。任何实现本协议的引擎,必须把同一份数据
解成同一个世界——本仓库的 TypeScript 引擎(`engine/src`)是**参考实现**,
而非定义本身。

- **版本**:协议 **v0.1**(随引擎发行版 `v0.1.0` 对齐)。协议变更记录在根
  [CHANGELOG](../CHANGELOG.md),且必须**同时**落到 `cn/` 与 `en/`。
- **一致性验收**:见 [determinism 确定性](cn/determinism.md)——基准 PRNG、
  推导钉点与验收清单。

## 术语约定(规范)

- **SPP 专指 String Particle Protocol(弦粒子协议)**——空间坍缩/展开协议,
  独立维护于 [ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol),
  引擎经 b6 particle 附属物消费。
- 数据坐标系一律称 **Septopus 轴序 / Septopus 系**(X东 Y北 Z高)——**不得**
  写作 "SPP 坐标/轴序";属性时间轴称 **Septopus 动画**协议。
- 历史注记:早期文档与部分代码标识符曾把 "spp" 混作 Septopus 坐标的缩写
  (如 `sppToEngine`),文档与标识符已于 2026-07-04 统一(`septopusToEngine` 等)。

## 文档三层

| 层 | 位置 | 性质 |
|---|---|---|
| **协议(规范)** | `protocol/cn` · `protocol/en` | 规范——跨引擎契约 |
| **参考实现** | [`docs/`](../docs/) | 本 TS 引擎的实现细节 |
| **过程** | [`docs/plan/`](../docs/plan/) | 路线图与设计规格(非规范) |

## 索引

**第一次来?先读 [overview 总览](cn/overview.md)** —— 一页讲清 Septopus 世界的构成与设计缘由。

| 文档 | 内容 |
|---|---|
| [**overview 总览**](cn/overview.md) | **全景:世界←地块←附属物、时间/天气推导、为什么数据驱动** |
| [world 世界](cn/world.md) | 世界网格/领主/生态;**§3.1 时间与天气推导、§5 坐标与旋转契约(规范)** |
| [block 地块](cn/block.md) | 地块资产语义;**§3 raw 五元组(规范)** |
| [adjunct 附属物](cn/adjunct.md) | 附属物架构、生命周期、装载管线 |
| [**adjunct-types 类型槽位**](cn/adjunct-types.md) | **19 个内置类型的逐槽位规范(规范核心)** |
| [trigger 触发器](cn/trigger.md) | 事件+条件+动作词汇(**含全部 actuator 动作、传送锚点**) |
| [**determinism 确定性**](cn/determinism.md) | **PRNG 基准、推导钉点、一致性验收清单** |
| [item 物品](cn/item.md) | 物品实例 = (模板, seed) 确定性推导(规范级) |
| [game 游戏](cn/game.md) | 游戏会话/模式;**§9 会话与验证协议(规范级)** |
| [animation 动画](cn/animation.md) | Septopus 数据驱动动画时间轴 |
| [avatar-animation 化身动画](cn/avatar-animation.md) | 形象/动作/状态三层契约(VRM 基准) |
| [player 玩家](cn/player.md) | 玩家能力面与运动语义 |
| [resource 资源](cn/resource.md) | 资源寻址(id/CID/URL)与加载语义 |
| [framework 框架](cn/framework.md) | 引擎组织参考(偏实现) |
| [ui 界面](cn/ui.md) | 宿主 UI 事件面(偏实现) |

## 相关

- **SPP(String Particle Protocol,弦粒子协议)**——语义空间组织协议,独立维护于
  [ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol)。
- 参考引擎与 PWA 客户端:本仓库——见根 [README](../README.md) 与
  [Releases](https://github.com/septopus-rex/world/releases)。
