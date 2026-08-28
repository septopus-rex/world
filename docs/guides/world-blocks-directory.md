# 虚拟世界全景体验指南：玩法与地块坐标全览 (World & Blocks Directory)

本文档整理了 Septopus 虚拟世界中所有已部署的 **玩法类型、关卡场景、独立地块与核心 Adjunct 能力演示** 及其精确的 **Block 坐标、访问方式与交互指南**，方便开发者与体验者随时进入世界游玩与测试。

---

## 快速进入世界

在本地开发服务运行中（默认端口 `7777`），可在浏览器直接打开以下链接体验不同维度的世界内容：

- **主入口（推荐·全景画廊走廊）**：[`http://localhost:7777`](http://localhost:7777)
- **大型 3×3 九宫格复合密室**：[`http://localhost:7777/?level=escape_room_3x3`](http://localhost:7777/?level=escape_room_3x3)
- **仙剑微缩剧情 RPG《灵草记》**：[`http://localhost:7777/?level=xianjian`](http://localhost:7777/?level=xianjian)
- **全景动力学过山车**：[`http://localhost:7777/?level=coaster`](http://localhost:7777/?level=coaster)
- **3D 跑酷攀爬塔**：[`http://localhost:7777/?level=parkour`](http://localhost:7777/?level=parkour)
- **传送门中枢广场**：[`http://localhost:7777/?level=world`](http://localhost:7777/?level=world)
- **6×6 宏大古风宫殿（流式与 LOD 压力）**：[`http://localhost:7777/?level=palace`](http://localhost:7777/?level=palace)
- **综合陈列展示场**：[`http://localhost:7777/?level=demo`](http://localhost:7777/?level=demo)

---

## 一、六大原生 Adjunct 游戏玩法地块

六大衍生游戏类型已全部以独立地块形式部署，数据位于 `client/core/src/blocks/`，遵循单块自包含或多块拼接规范：

| 玩法分类 | 对应地块文件 | 核心坐标 / 关卡 | 玩法概述与操作指南 |
| :--- | :--- | :--- | :--- |
| **Type 1: 机关解谜 / 密室逃脱** | [`puzzle.block.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/blocks/puzzle.block.json) | 独立地块 `puzzle`<br>(亦可放入任意坐标) | **核心流程**：翻阅前厅密码书（`e4`）获取线索，走上中央压力台触发解谜，升起能量石门（`161 moveZ`），开启宝箱获得龙纹金币（`tpl_1`）。 |
| **Type 2: 3D 平台跳跃 / 跑酷障碍** | [`platformer.block.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/blocks/platformer.block.json) | 独立地块 `platformer`<br>或 `?level=parkour` | **核心流程**：连续飞跃多层浮空跳板，在楔形斜坡（`stop shape:3`）助跑起跳，激活半山腰重生检查点（`player.setSpawn`），登顶夺旗。 |
| **Type 3: 地牢探险 / Roguelite RPG** | [`dungeon.block.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/blocks/dungeon.block.json) | 独立地块 `dungeon` | **核心流程**：与老斥候 NPC 对话接取讨伐任务，穿越毒尖刺走廊（`damage:20`），击败骸骨守卫夺取暗影钥匙（`tpl_2`），解封石门夺取上古龙晶（`tpl_3`）。 |
| **Type 4: 靶场射击 / 波次防守** | [`shooting_gallery.block.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/blocks/shooting_gallery.block.json) | 独立地块 `shooting_gallery` | **核心流程**：与靶场主管 NPC 对话后走入射击台，自动进入 `Game` 射击模式升起 5 具灵能靶标，准星射击靶标实时变红并记录得分。 |
| **Type 5: 沉浸过山车 / 交互展厅** | [`scenic_coaster.block.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/blocks/scenic_coaster.block.json) | 独立地块 `scenic_coaster`<br>或 `?level=coaster` | **核心流程**：发车站台阅读游览指南，踏上乘车点进入 `Game` 模式，动力学接管玩家沿 SPP 样条轨道巡游古代石碑、圣坛与黄金雕像展位。 |
| **Type 6: 碎裂地板 / 派对淘汰赛** | [`party_royale.block.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/blocks/party_royale.block.json) | 独立地块 `party_royale` | **核心流程**：派对裁判开启淘汰赛，悬浮地砖一踩即触发下坠坍塌（`moveZ -15`），考验极限连续飞跃，抵达终点金色安全岛赢得冠军奖杯。 |

---

## 二、大型 3×3（九宫格）复合密室布局

关卡文件：[`client/core/src/levels/escape_room_3x3.level.json`](file:///Users/fuu/Desktop/AI/world/client/core/src/levels/escape_room_3x3.level.json)  
直接访问：[`http://localhost:7777/?level=escape_room_3x3`](http://localhost:7777/?level=escape_room_3x3)

该密室由 9 个独立 16×16 地块矩阵组成（共 48m × 48m 巨型地下遗迹），展示了**跨地块全局状态联动、跨地块道具携带与跨地块远程机关控制**：

```
 北 (Y+)
  ↑
  [2030, 2032] (NW: 高空跳台室)   ──   [2031, 2032] (N: 终极大逃脱圣殿)   ──   [2032, 2032] (NE: 藏宝金库)
        │                                        │                                       │
  [2030, 2031] (W: 军械营守卫)   ──   [2031, 2031] (Center: 中央能量枢纽) ──   [2032, 2031] (E: 炼金工坊)
        │                                        │                                       │
  [2030, 2030] (SW: 密室前厅·起点) ──   [2031, 2030] (S: 机关长廊)        ──   [2032, 2030] (SE: 机关水室)
                                                                                  → 东 (X+)
```

### 九大房间探索指引

1. **西南前厅 `[2030, 2030]`（起点）**：
   - 探险家 NPC 讲解遗迹情报，地面可拾取初始铜钥匙（`tpl_1`）。
   - 可选择东向长廊或北向军械营两条探索分支。
2. **南向机关长廊 `[2031, 2030]`**：
   - 避开地刺伤害陷阱，踩中右侧地砖压力板，远程升起东侧水室大门。
3. **东南机关水室 `[2032, 2030]`**：
   - 水池旁点击排水阀门，水位退去，水底升起关键道具「玄铁钥匙（`tpl_2`）」。
4. **西向军械营 `[2030, 2031]`**：
   - 与骸骨守卫 NPC 展开战斗对话，击败守卫掉落「暗影宝珠（`tpl_3`）」。
5. **西北高空跳台室 `[2030, 2032]`**：
   - 沿多层浮动平台与斜坡跳跃至 4 米高台，踩下天闸拉杆，开启终极圣殿天窗透光。
6. **东向炼金工坊 `[2032, 2031]`**：
   - 调配古法能量药剂，阅览炼金实验日志。
7. **中央能量大殿 `[2031, 2031]`（核心枢纽）**：
   - 四根巨型能量方柱环绕中央祭坛。
   - 需同时持有「玄铁钥匙」与「暗影宝珠」，点击祭坛注入能量，**跨地块升起北面终极圣殿大门（`adj_2031_2032_161_0 moveZ 5`）**！
8. **北向大逃脱圣殿 `[2031, 2032]`（终点）**：
   - 大门敞开，登上终极逃生祭坛，完成九宫格全境解谜大逃脱！
9. **东北藏宝金库 `[2032, 2032]`**：
   - 通关后的荣耀展厅，获取远古金杯与通关纪念。

---

## 三、画廊走廊 20 格能力全景展区

直接访问：[`http://localhost:7777`](http://localhost:7777)（无需加参数，默认入口即在走廊南端 `[2000, 1000]`）

沿走廊一路向北（Y 坐标递增），每一格地块专注展示引擎的一项核心原生能力，每格入口均配有可点击的阅读书（`e4 book`）：

| 序号 | 地块坐标 | 展区主题 | 核心 Adjunct / 机制 | 体验要点 |
| :--- | :--- | :--- | :--- | :--- |
| **①** | `[2000, 1000]` | **几何体与纹理** | `a2 box` / `a6 cone` / `a7 sphere` | 参数化几何网格生成、棋盘格纹理平铺与密度对比。 |
| **②** | `[2000, 1001]` | **智能巡逻 NPC** | `ba npc` (Behavior 状态机) | 士兵 NPC 自主发呆/游走切换，靠近停步，点击对话。 |
| **③** | `[2000, 1002]` | **3D 外部模型** | `a4 module` (.gltf / .glb) | 宝塔、PBR 战损头盔、带骨骼动画的狐狸模型实例复用。 |
| **④** | `[2000, 1003]` | **触发器机关门** | `b8 trigger in` + `161 moveZ` | 踏上蓝色地垫触发隐形体积，前方横墙自动抬升放行。 |
| **⑤** | `[2000, 1004]` | **物品与背包** | `b5 item` + `InventoryComponent` | 点击散落的宝石与药水拾取入包（右侧 🎒），可丢弃或作为开门条件。 |
| **⑥** | `[2000, 1005]` | **可翻页书籍** | `e4 book` | 点击漂浮书卷，页内无弹窗纯 3D 翻页阅读。 |
| **⑦** | `[2000, 1006]` | **任务对话树** | `ba npc` (Dialogue Tree) | 与村民交互，体验带条件分支、标志位修改（`flag`）的剧情树。 |
| **⑧** | `[2000, 1007]` | **3D 空间音频** | `e2 audio` + `sound.play` | 点击红色开关播放音乐，绕大喇叭走动感受真实 3D 距离与方向衰减。 |
| **⑨** | `[2000, 1008]` | **动态视频屏幕** | `e3 video` | 16:9 屏幕材质动态映射，支持循环自动播放。 |
| **⑩** | `[2000, 1009]` | **外链交互看板** | `e1 link` | 点击面板呼出安全跳转至 GitHub 外部网页。 |
| **⑪** | `[2000, 1010]` | **水体与动态光源** | `a5 water` + `a3 light` | 半透明波光水面与一冷一暖两盏泛光/聚光灯照明。 |
| **⑫** | `[2000, 1011]` | **弦粒子 SPP 小屋** | `b6 spp` (basic & terran 风格包) | 纯六面状态紧凑数据展开为装甲小楼；东侧 `[2001, 1011]` 矗立 **11层 44米 SPP 塔楼**，内含折返楼梯可登顶。 |
| **⑬** | `[2000, 1012]` | **运行时换装** | Avatar Pipeline | 点击右上角 👤 在「士兵」与「机器人」化身间无缝换装。 |
| **⑭** | `[2000, 1013]` | **碰撞体形态** | `b4 stop` (box / ball / slope) | 走上楔形斜坡连续爬升，绕圆柱体会顺滑阻挡。 |
| **⑮** | `[2000, 1014]` | **动态生成器** | `b9 spawner` | 每 4 秒仿真时间生成一枚物理球，场上限存 3 颗。 |
| **⑯** | `[2000, 1015]` | **生成式 Motif** | `c2 motif` (arch & stairs) | 单行数据生成拱门与自动分级台阶（一步走上无需起跳）。 |
| **⑰** | `[2000, 1016]` | **样条轨道** | `c1 track` | 5 个控制点 Catmull-Rom 样条管道与导轨。 |
| **⑱** | `[2000, 1017]` | **跨会话留言墙** | `e5 board` | 点击木板留言，内容持久化共享给所有访客。 |
| **⑲** | `[2000, 1018]` | **德州扑克桌** | `game: 44` (Pattern A 外部游戏) | 走近桌子点击进入 Game 模式与外部扑克服务对局。 |
| **⑳** | `[2000, 1019]` | **传送大广场** | `b8 teleport` 传送门矩阵 | 三座传送光门直达：仙剑村（西）、过山车（中）、跑酷塔（东）。 |
| **㉑** | `[2000, 1020]` | **AI 生成世界展区** | `a4 module` (Gaussian Splatting) | 展示本地泼溅测试体与 World Labs Marble 生成的星际神族村庄。 |

---

## 四、经典桌游与物理小游戏地块

各桌面游戏均遵循 **Game 区域门控协议**（走入地块靠近桌台即可进入专属 Game 视角，离开即无残留恢复普通模式）：

| 游戏名称 | 对应地块 | 核心物理 / 逻辑系统 | 玩法特色 |
| :--- | :--- | :--- | :--- |
| **3D 竞技麻将** | `mahjong.block.json`<br>`mahjong3d.block.json` | `MahjongSystem`<br>(离散回合与手牌状态机) | 完整国标/日麻规则，支持看牌、摸打、吃碰杠胡，AI 策略出牌。 |
| **3D 动力学台球** | `pool.block.json` | `PoolSystem`<br>(连续物理与刚体碰撞) | 调节角度与击球力度，白球击打花色球进袋。 |
| **Jenga 物理叠叠乐** | `tumble.block.json` | `TumbleSystem`<br>(Rapier 3D 刚体物理引擎) | 真实物理抽积木，积木受重力、摩擦力影响，考验平衡与抽条手感。 |
| **德州扑克** | `holdem.block.json` | `HoldemBridge`<br>(外部服务器状态同步) | 多人德州扑克对局，底牌加密。 |

---

*文档版本: v1.0 | 适用引擎: Septopus World Engine v0.1.0+*
