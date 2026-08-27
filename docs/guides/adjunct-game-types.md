# Septopus 附属物（Adjunct）游戏类型设计与开发指南

> **定位**：本文档系统梳理了基于 Septopus 引擎 21 种附属物类型（`protocol/cn/adjunct-types.md`）及触发器协议（`protocol/cn/trigger.md`）可开发的 6 种主流游戏类型，指导创作者以**“纯数据驱动（JSON-First）”**的方式构建丰富多样的 3D 虚拟世界玩法。

---

## 目录

1. [设计理念与核心原则](#1-设计理念与核心原则)
2. [六大游戏类型深度解析](#2-六大游戏类型深度解析)
   - [类型一：机关解谜 / 密室逃脱 (Escape Room & Puzzle Dungeons)](#类型一机关解谜--密室逃脱-escape-room--puzzle-dungeons)
   - [类型二：3D 平台跳跃 / 跑酷障碍赛 (3D Platformer & Parkour)](#类型二3d-平台跳跃--跑酷障碍赛-3d-platformer--parkour)
   - [类型三：轻量地牢探险 / Roguelite 动作 RPG (Dungeon Crawler & RPG)](#类型三轻量地牢探险--roguelite-动作-rpg-dungeon-crawler--rpg)
   - [类型四：靶场射击 / 波次防守 (Shooting Gallery & Wave Defense)](#类型四靶场射击--波次防守-shooting-gallery--wave-defense)
   - [类型五：沉浸式过山车 / 导览列车与交互展厅 (Scenic Coaster & Museum)](#类型五沉浸式过山车--导览列车与交互展厅-scenic-coaster--museum)
   - [类型六：派对物理淘汰 / 碎裂地板生存 (Party Royale & Fall Down)](#类型六派对物理淘汰--碎裂地板生存-party-royale--fall-down)
3. [类型选型与对比矩阵](#3-类型选型与对比矩阵)
4. [数据驱动的最佳实践与工程红线](#4-数据驱动的最佳实践与工程红线)

---

## 1. 设计理念与核心原则

Septopus 引擎遵循 **“内容 = 数据”** 的设计哲学：
- **零引擎脚本**：所有关卡、玩法、机关、怪物行为与任务均在 JSON（`.level.json` / `.block.json`）中声明，引擎只负责解释和执行。
- **状态机与逻辑驱动**：通过 `b8` 触发器的 `in` / `out` / `hold` / `touch` 事件，搭配 `JSONLogic` 条件守卫与 `flags` 全局状态，完成图灵完备的场景逻辑闭环。
- **资源安全与确定性**：材质、模型、音视频均采用数字 ID 或 IPFS CID 内容寻址，保证多端渲染与回放一致性。

---

## 2. 六大游戏类型深度解析

---

### 类型一：机关解谜 / 密室逃脱 (Escape Room & Puzzle Dungeons)

密室逃脱与机关谜题是 Septopus 触发器系统**最天然的契合点**。

#### 1. 核心依赖 Adjunct
| Adjunct 类型 | 槽位 / 功能 | 玩法职责 |
|---|---|---|
| `0x00b8` **trigger** | `in` / `out` / `hold` / `touch` | 压力板、光线感应、点击暗格、蓄力开关 |
| `0x00b8` **actions** | `adjunct` (`moveZ`/`rotateY`), `flag`, `delay` | 机关门升降、暗门旋转、时钟延迟、状态串联 |
| `0x00e4` **book** | `pages`, `title` | 散落的日记、古籍线索、密码提示 |
| `0x00a8` **sign** | `texture`, `opacity` | 墙面壁画、符文线索、地面指示 |
| `0x00b5` **item** / `bag` | `templateId`, `seed` | 钥匙、法杖、机械齿轮收集与消耗 |
| `0x00e2` **audio** | 3D 空间音效 | 机关开启轰鸣声、密码正确提示音 |

#### 2. 核心机制设计
- **多开关与与非门（AND/OR 逻辑）**：通过多个 `touch` 或 `in` 节点向 `flags` 写入布尔值，最终闸门通过 JSONLogic `{"and": [{"var": "flags.switch_a"}, {"var": "flags.switch_b"}]}` 进行守卫。
- **限时奔跑机关（Timer Gate）**：踩中压力板（`hold` 事件）触发闸门开启（`moveZ: 3.0`），并通过 `delay` 动作在 5 秒后自动复位（`moveZ: -3.0`）。
- **旋转解谜（Dial Puzzle）**：点击立柱执行 `rotateY: 1.5708`（90度），当四个立柱的角度标志与线索书（`e4 book`）记录一致时触发通关。

#### 3. 范例结构 (密室钥匙门)
```json
{
  "type": "in",
  "oneTime": true,
  "conditions": { ">=": [{ "var": "inventory.tpl_golden_key" }, 1] },
  "actions": [
    { "type": "bag", "target": "tpl_golden_key", "method": "take", "params": [1] },
    { "type": "adjunct", "target": "adj_~_~_161_0", "method": "moveZ", "params": [3.2] },
    { "type": "sound", "target": 101, "method": "play", "params": [0.8] },
    { "type": "flag", "target": "dungeon_gate_open", "method": "", "params": [true] }
  ],
  "fallbackActions": [
    { "type": "system", "target": "", "method": "log", "params": ["大门紧锁，需要一把黄金钥匙。"] }
  ]
}
```

---

### 类型二：3D 平台跳跃 / 跑酷障碍赛 (3D Platformer & Parkour)

利用物理系统、斜坡地形与动画系统构建敏捷与操作挑战。

#### 1. 核心依赖 Adjunct
| Adjunct 类型 | 槽位 / 功能 | 玩法职责 |
|---|---|---|
| `0x00a2` **box** / `a1` | 槽 5 `animation` | 左右平移浮台、上下升降踏板、旋转摆锤 |
| `0x00b4` **stop** | 槽 5 `shape: 3` (楔形坡) | 斜坡滑道、助跑跳台、连续爬坡阶梯 |
| `0x00b8` **trigger** | `player.setSpawn` | 跑酷阶段性检查点（Checkpoint） |
| `0x00b8` **trigger** | `player.damage` | 掉落熔岩/毒水/尖刺即刻扣血并重生 |
| `0x00a5` **water** | 半透明无碰撞几何体 | 视觉水体/毒液池 |

#### 2. 核心机制设计
- **移动跳台网络**：配置不同周期与相位的平移动画（`animation.timeline`），玩家必须把握起跳时机。
- **塌陷地板（Falling Platforms）**：踏上地板那一帧（`in` 事件）触发 `delay: 0.6s`，随后执行 `moveZ: -10` 坠落，数秒后复位。
- **上升熔岩（Rising Lava）**：一个大面积的危险方块沿 Z 轴缓慢匀速上升，玩家需在被熔岩吞没前爬上终点。

---

### 类型三：轻量地牢探险 / Roguelite 动作 RPG (Dungeon Crawler & RPG)

深度发挥 NPC 数据状态机、对话树、战斗与掉落系统。

#### 1. 核心依赖 Adjunct
| Adjunct 类型 | 槽位 / 功能 | 玩法职责 |
|---|---|---|
| `0x00ba` **npc** | `behavior` 状态机 (`states`, `move`, `transitions`) | 巡逻、警戒追击、残血逃跑、归位 |
| `0x00ba` **npc** | `hp`, `interact`, `touch`, `onDeath` | 怪物受击扣血、接触伤害、击杀掉落与触发 |
| `0x00ba` **npc** | `dialogue` 对话树 (`nodes`, `options`, `when`) | NPC 任务发布、剧情分支、商人兑换 |
| `0x00b9` **spawner** | `interval`, `maxAlive`, `template` | 刷怪笼、野外怪物定时刷新 |
| `0x00b8` **trigger** | `projectile`, `damage`, `teleport` | 陷阱暗箭、远程法球弹幕、关卡传送门 |

#### 2. 核心机制设计
- **仇恨与警戒巡逻**：
  ```json
  "states": {
    "patrol": {
      "move": { "kind": "wander", "speed": 1.2, "radius": 4 },
      "transitions": [{ "when": { "<": [{ "var": "npc.distToPlayer" }, 5.0] }, "to": "chase" }]
    },
    "chase": {
      "move": { "kind": "follow", "speed": 2.5, "stopAt": 0.8 },
      "transitions": [{ "when": { ">": [{ "var": "npc.distToPlayer" }, 8.0] }, "to": "patrol" }]
    }
  }
  ```
- **Boss 机制与阶段转换**：Boss 死亡触发 `onDeath` 动作，生成终极宝箱（`spawn`）并打开下一层传送门（`teleport` 锚点）。
- **任务与对话流转**：通过对话选项中的 `actions` 设置 `flags.quest_1_state = "finished"`，并在条件满足时给予奖励道具（`bag.give`）。

---

### 类型四：靶场射击 / 波次防守 (Shooting Gallery & Wave Defense)

利用射线交互、生成器与投射物系统打造射击与守城体验。

#### 1. 核心依赖 Adjunct
| Adjunct 类型 | 槽位 / 功能 | 玩法职责 |
|---|---|---|
| `0x00b9` **spawner** | 动态派生实体 | 按波次周期性生成靶标或进攻怪物 |
| `0x00b8` **trigger** | `touch` (主交互射线) | 射击准星点击命中判定 |
| `0x00b8` **trigger** | `projectile` | 投掷伤害体（箭矢、炮弹、激光法球） |
| `0x00b8` **trigger** | `delay` + `flag` 计数器 | 60 秒倒计时、波次推进与积分统计 |

#### 2. 核心机制设计
- **移动靶场**：`spawner` 生成带有移动动画的靶子，玩家点击靶子（`touch` 事件）触发加分并销毁靶子（`despawn`），打中红心靶获得额外奖励。
- **基地防线守护**：怪物持续向目标点行进，玩家通过触发地刺机关（`moveZ`）、滚石陷阱或远程投射武器击退敌军。

---

### 类型五：沉浸式过山车 / 导览列车与交互展厅 (Scenic Coaster & Museum)

基于样条轨道与空间音视频打造的高观赏性沉浸体验。

#### 1. 核心依赖 Adjunct
| Adjunct 类型 | 槽位 / 功能 | 玩法职责 |
|---|---|---|
| `0x00c1` **track** | `path` (Catmull-Rom 样条控制点) | 过山车轨迹、导览游览轨道 |
| `0x00e2` **audio** | `refDistance`, `loop`, `volume` | 3D 空间环境音效、定点解说语音 |
| `0x00e3` **video** | 视频播放纹理 | 动态宣传屏、故事背景影片 |
| `0x00a4` **module** | 3D 模型 (GLB/GLTF/泼溅) | 高精度展品、建筑地标 |
| `0x00a8` **sign** | 0..1 UV 整面无光照贴图 | 展品介绍铭牌、方向导航牌 |

#### 2. 核心机制设计
- **情境联动过山车**：列车驶入特定路段时，触发沿途触发器（`in`），动态调整光照颜色（`a3 light`）、播放雷电音效并启动两侧机械动画。
- **交互式艺术展厅**：展品旁放置 `e4 book` 供观众翻阅历史档案，配合空间导览语音（`e2 audio`）实现声画同步。

---

### 类型六：派对物理淘汰 / 碎裂地板生存 (Party Royale & Fall Down)

利用动态位移、方块销毁与物理碰撞打造多人欢乐淘汰赛。

#### 1. 核心依赖 Adjunct
| Adjunct 类型 | 槽位 / 功能 | 玩法职责 |
|---|---|---|
| `0x00a2` **box** | 独立平台网格 | 多层蜂巢地板单元 |
| `0x00b8` **trigger** | `in` + `delay` + `moveZ` / `despawn` | 踩踏延迟碎裂/坠落逻辑 |
| `0x00b8` **trigger** | `damage` | 底部淘汰区判定 |
| `0x00a2` **box** | 旋转动画 | 旋转扫荡大棒（Sweeper） |

#### 2. 核心机制设计
- **踩空淘汰赛 (Hex-a-Gone)**：场地由 3~5 层六边形/方形地砖构成，玩家踏入地砖触发闪烁并在 0.8 秒后让方块下坠消失，存活时间最长者获胜。
- **大棒扫荡转盘**：中心立轴驱动两根长臂水平旋转，随时间转速加快，玩家必须看准时机跳跃躲避。

---

## 3. 类型选型与对比矩阵

| 游戏类型 | 核心 Adjunct 组合 | 纯数据(JSON)实现度 | 核心玩法乐趣 | 推荐指数 |
| :--- | :--- | :---: | :--- | :---: |
| **机关解谜 / 密室逃脱** | `b8` (trigger) + `flags` + `e4` (book) + `b5` (item) | **100%** | 智力挑战、探秘沉浸感 | ⭐⭐⭐⭐⭐ |
| **3D 平台跳跃 / 跑酷障碍** | `a1/a2` (anim) + `b4` (slope) + `b8` (setSpawn/damage) | **100%** | 操作技巧、敏捷通关 | ⭐⭐⭐⭐⭐ |
| **轻量地牢探险 / Roguelite** | `ba` (npc) + `b9` (spawner) + `b8` (projectile/bag) | **100%** | 战斗成长、任务剧情 | ⭐⭐⭐⭐☆ |
| **靶场射击 / 波次防守** | `b9` (spawner) + `touch` / `projectile` + `flags` | **100%** | 反射神经、策略防守 | ⭐⭐⭐⭐☆ |
| **沉浸式过山车 / 导览展厅** | `c1` (track) + `e2` (audio) + `a4` (module) + `a8` (sign) | **100%** | 视觉享受、故事叙事 | ⭐⭐⭐⭐☆ |
| **派对生存 / 碎裂地板** | `b8` (delay/moveZ) + `a2` (rot anim) | **95%** | 竞技淘汰、多人欢乐 | ⭐⭐⭐☆☆ |

---

## 4. 数据驱动的最佳实践与工程红线

在开发上述游戏关卡时，必须严格遵守仓库规范与协议约束：

1. **世界地块优先（Block-First，严禁随意开辟 `?level=xxx`）**：
   - 附属物玩法与机关原型必须作为**独立地块**（`client/core/src/blocks/<name>.block.json`）开发，或放置在统一虚拟世界的具体坐标块中。
   - **严禁为每一个小玩法/原型单独新增 `?level=<name>` 路由分支**。随意开辟单独 level 路由会绕过世界的地块流式加载（Streaming）、LOD、跨地块联动与传送机制，导致与虚拟世界主干架构产生严重漂移。

2. **内容即数据（禁止写 TS 逻辑）**：
   - 玩法内容必须保存在 `blocks/*.block.json`（或整体世界文档）中。
   - 禁止为特定游戏定制引擎侧门，所有功能均通过协议已有槽位与触发器动作组合实现。

3. **资源引用规范**：
   - **严禁**在 JSON 中使用 `"/assets/xxx.png"` 相对路径。
   - 贴图/模型必须先在 `client/core/src/assets/demo.manifest.json` 中注册获取**数字 ID**，或使用 `<cid>.<ext>` 内容寻址。

4. **标准 7 槽位语义与调色板**：
   - 标准几何类型（`a1`、`a5`、`a6`、`a7`）的 `raw[3]` 是**颜色/材质索引**（0=默认，1..31=内建调色板，≥256=十六进制颜色），**不能塞贴图 ID**。
   - 需要贴图的面必须使用 `0x00a2` (box) 的 **槽 7** 或 `0x00a8` (sign) 的 **槽 3**。

5. **块相对寻址（Portability）**：
   - 触发器动作目标推荐使用块相对 ID：`adj_~_~_{type十进制}_{idx}`，保证关卡块无论复制放置到何处，机关依然正常联动。

6. **门禁验证**：
   - 完成内容编辑后，必须运行全套门禁测试：
     ```bash
     cd engine && yarn test:run
     ```
   - 确保 `content-conformance.test.ts` 与 `resource-contract.test.ts` 均为绿色。

---

*文档版本: v1.1 | 适用引擎版本: Septopus Engine v0.1.0+*

