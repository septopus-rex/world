# Septopus World Protocol · 世界协议

**EN** — The Septopus World Protocol defines a **cross-engine, pure-data 3D world**:
worlds, blocks, adjuncts, interactions and gameplay are all plain data with pinned
deterministic semantics. Any engine that implements this protocol must resolve the
same data into the same world — the TypeScript engine in this repository
(`engine/src`) is the **reference implementation**, not the definition.

**中文** — Septopus 世界协议定义一个**跨引擎、纯数据的 3D 世界**:世界、地块、
附属物、交互与玩法全部是带确定性钉点的纯数据。任何实现本协议的引擎,必须把同一份
数据解成同一个世界——本仓库的 TypeScript 引擎(`engine/src`)是**参考实现**,
而非定义本身。

- **Version 版本**:protocol **v0.1**(aligned with engine release `v0.1.0`;
  changes are recorded in the root [CHANGELOG](../CHANGELOG.md) and must land in
  **both** `cn/` and `en/`).
- **Conformance 一致性**:see [determinism](cn/determinism.md)([EN](en/determinism.md))
  — the base PRNG, the derivation pins, and the acceptance checklist.

## Terminology · 术语约定(规范)

- **SPP** 在本仓**专指** **String Particle Protocol(弦粒子协议)**——空间坍缩/展开
  协议,独立维护于 [ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol),
  引擎经 b6 particle 附属物消费。**SPP is reserved exclusively for the String
  Particle Protocol** (spatial collapse/expansion; consumed via the b6 adjunct).
- 数据坐标系一律称 **Septopus 轴序 / the Septopus frame**(X东 Y北 Z高)——
  **不得**写作 "SPP 坐标/轴序"。动画时间轴称 **Septopus 动画**。
  The data frame is always called the **Septopus axis order / frame**
  (X east, Y north, Z up) — never "SPP coordinates"; the timeline is the
  **Septopus animation** protocol.
- 历史注记:早期文档与部分代码标识符曾把 "spp" 混作 Septopus 坐标的缩写
  (如 `sppToEngine`),文档已于 2026-07-04 统一;代码标识符以同日改名对齐。

## Documentation tiers · 文档三层

| 层 Tier | 位置 Location | 性质 Nature |
|---|---|---|
| **Protocol 规范** | `protocol/cn` · `protocol/en` | Normative — the cross-engine contract 跨引擎契约 |
| **Reference impl. 参考实现** | [`docs/`](../docs/) | How THIS engine implements it 本引擎的实现细节 |
| **Process 过程** | [`docs/plan/`](../docs/plan/) | Roadmap & design specs (non-normative) 设计与实现追踪 |

## Index · 索引

| 文档 | EN | 内容 Contents |
|---|---|---|
| [world 世界](cn/world.md) | [en](en/world.md) | 世界网格/领主/生态;**§3.1 时间与天气推导、§5 坐标与旋转契约(规范)** |
| [block 地块](cn/block.md) | [en](en/block.md) | 地块资产语义;**§3 raw 五元组(规范)** |
| [adjunct 附属物](cn/adjunct.md) | [en](en/adjunct.md) | 附属物架构、生命周期、装载管线 |
| [**adjunct-types 类型槽位**](cn/adjunct-types.md) | [en](en/adjunct-types.md) | **18 个内置类型的逐槽位规范(规范核心)** |
| [trigger 触发器](cn/trigger.md) | [en](en/trigger.md) | 事件+条件+动作词汇(**含全部 actuator 动作、传送锚点**) |
| [**determinism 确定性**](cn/determinism.md) | [en](en/determinism.md) | **PRNG 基准、推导钉点、一致性验收清单** |
| [item 物品](cn/item.md) | [en](en/item.md) | 物品实例 = (模板, seed) 确定性推导(规范级) |
| [game 游戏](cn/game.md) | [en](en/game.md) | 游戏会话/模式;**§9 会话与验证协议(规范级)** |
| [animation 动画](cn/animation.md) | [en](en/animation.md) | Septopus 数据驱动动画时间轴 |
| [avatar-animation 化身动画](cn/avatar-animation.md) | [en](en/avatar-animation.md) | 形象/动作/状态三层契约(VRM 基准) |
| [player 玩家](cn/player.md) | [en](en/player.md) | 玩家能力面与运动语义 |
| [resource 资源](cn/resource.md) | [en](en/resource.md) | 资源寻址(id/CID/URL)与加载语义 |
| [framework 框架](cn/framework.md) | [en](en/framework.md) | 引擎组织参考(偏实现) |
| [ui 界面](cn/ui.md) | [en](en/ui.md) | 宿主 UI 事件面(偏实现) |

## Related · 相关

- **SPP (String Particle Protocol)** — the semantic-space organization protocol,
  maintained independently at [ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol).
- Reference engine & PWA client: this repository — see the root [README](../README.md)
  and [Releases](https://github.com/septopus-rex/world/releases).
