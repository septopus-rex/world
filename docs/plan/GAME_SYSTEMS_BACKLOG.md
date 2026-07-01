# 游戏引擎系统缺口清单（Game Systems Backlog）

> **用途**：从**游戏引擎原语**的角度（不是内容/产品角度），列出「要让引擎能承载游戏内容」还缺的**大块子系统**，逐个处理。在大规模填内容之前，把这些地基打稳，避免 authored 内容事后返工。
>
> **与其它文档的分工**：
> - `PLAYABLE_CHECKLIST.md` = **内容/产品可玩化**（世界数据来源、创作→分享闭环、创作工具、首发玩法）——「让用户玩起来」。
> - **本文** = **引擎子系统原语**（调度、生成、NPC、战斗、对话）——「游戏需要的引擎能力是否存在」。
> - `specs/*.md` = 各子系统落地时的详细规格（本文每项落地时新开一份）。
>
> **已锁定的范围决策（不再纠结）**：
> - ❌ **联网 / 多人 = 交给外部**。引擎保持**单机权威、本地确定性**；同步/复制由**外部层**负责（如同链已解耦）。引擎侧不建 netcode——只需保证 `step(dt)` 确定性、事件队列、`IActuator` 注入点这些**接缝**留着，外部层接得上即可。所以「本地 vs 同步」对引擎的答案统一为：**引擎只管本地**。
> - ✅ **Game mode 方式已定**（不重做）：三种托管 A 外部 app / B 原生 System / C 纯数据；zone 门控 + trigger 承载进入 + per-game `exitPolicy`。见 `docs/systems/game-mode-entry.md`、`specs/native-in-world-games.md`、记忆 `native-in-world-game-pattern.md`。

## 图例
| ✅ 已就绪 · 🟡 部分/进行中 · 🔲 待办 · ⏸️ 暂缓 · ❌ 有意不做（附理由） |

---

## 设计铁律：数据即逻辑，引擎是解释器

> Septopus 主目标——**数据表达所有逻辑**：定义一套**引擎无关的指令集**（原语词汇 + 数据 schema），每个引擎（TS 现在 / UE 未来）都是这套指令集的一台 **VM**。逻辑写在数据里（用指令集编排），引擎只实现原语。现在的 `Trigger`/`Actuator`/`JSONLogic`/`Health`/`Flag` + 纯数据的 parkour 已经是这个形态。

所以 **F1~F4 不是引入新逻辑，是给指令集加新原语**。每个 Fx 必须守：

1. **协议/数据词汇优先**：先定引擎无关的 schema + 原语语义（沉淀进 `protocol/`），TS 实现只是**一台合规 VM**——不是「先写 TS 再补文档」。
2. **落 Pattern C（可移植原语），不落 Pattern B**。Pattern B = 逻辑焊在 TS System，是**承认的不可移植逃生舱**（Pool/Mahjong/Shooting/Tumble 已是）；F1~F3 若建成新的 Pattern-B System，就**背离主目标**。
3. **「同效果」= 行为等价，非逐位相同**：F1（调度/生成）可精确一致；F2/F3（AI/物理相邻）数据表达 **intent**，各引擎用自己的 solver realize → 观感一致但不 bit-identical。spec 里要写清这个现实边界。

**红线（反模式）**：
- 把 F1~F3 建成新的 Pattern-B 原生 System（游戏逻辑焊 TS）。
- 把「从 seed 确定性推导」的公式**只写在 TS 里**——同 seed 到了 UE 会得到不同结果，**除非公式进协议、或推导结果 baked 进数据**。（这一条正是审查现有实现要盯的重灾区，见下方审查结论。）

---

## 现有实现审查（对照铁律，2026-07）

按「数据即逻辑」审查现有功能。冲突分三类：

**A. 干净对齐（可移植脊）✅** —— 主目标在最要紧处成立：
adjunct（raw→std→render，plugin=原语类型）· trigger/actuator/JSONLogic 条件/flag/health（原语词汇）· SPP 粒子 b6（Expander 纯函数展开）· SPP 动画 timeline（数据驱动 move/rotate/scale/opacity/color/texture/morph）· 背包拾取/丢弃机制 · 持久化 · 编辑 · 渲染 · A/V 媒体 adjunct · 模式 · 事件队列。

**B. 已知/有意的不可移植岛（Pattern A/B 逃生舱）—— 冲突但自觉** ⚠️：
`PoolSystem`/`MahjongSystem`/`ShootingRangeSystem`/`TumbleSystem`（游戏逻辑焊 TS）+ `GameRuntimeSystem`（Pattern A 外部 app）。选型口诀「先 C 不行再 B」已认这是逃生舱；**移植到 UE = 逐个重写**。不是意外，记录在案即可。

**C. 灰区 / 潜在可移植性风险（真正的审查价值）—— 看着数据驱动、实则 TS-implementation-defined**：

- [ ] 🔲 **C1 · seed→派生（重灾区）**：`ItemRegistry`（`mulberry32` PRNG 推 rarity/属性）+ `MotifExpander`（`makeRng`+per-template TS 展开）。**纯确定、无 Math.random**——但「identical anywhere」的 anywhere = **任何 TS runtime**，算法定义在 TS，**UE 换个 PRNG/roll 顺序就得到不同结果**。且故意**不 persist**（省空间/防伪）→ 唯一出路是**把 PRNG + 派生 + 模板几何 specify 进 `protocol/`**（或接受「TS 权威，别的引擎读 baked 结果」）。这是铁律红线的现实标本。
- [ ] 🔲 **C2 · avatar 动画状态映射**：`RenderEngine.ANIM_STATE_PATTERNS`（`/idle|stand|breath/i` 剪辑名正则启发式）——TS 定义的 state→clip 映射，**未落** `protocol/avatar-animation.md` 契约。UE 载同一 GLB 需同款启发式或标准契约才映射一致。
- [ ] 🔲 **C3 · coaster/track 运动**：`CoasterSystem` 沿轨运动逻辑在 TS（轨道几何是数据，运动是 TS）——Pattern-B 味。要么 specify 运动语义为原语，要么归入 B。
- [ ] 🔲 **C4 · 移动手感常量**：`GRAVITY: -9.81*2 // for game feel`、`CONTROL_CONSTANTS`（TURN/AUTO_LEVEL_SPEED）硬编在 `Constants.ts`；部分经 body 参数(config)。UE 用自己的常量→**手感不同**（行为等价 vs 精确）。手感常量宜下沉进 world config(data)。
- [ ] 🔲 **C5 · 环境/相机 juice**：闪电定时（grade 派生）、相机摔落抖屏——TS-specific 表现。多为观感 juice（行为等价可接受）；但「确定性派生」部分（闪电定时）性质同 C1。

### 3D/渲染层契约审查（A1~A6，2026-07 已处理）

以 VM 模型专审渲染层。**架构 VM-ready**（core 渲染无关、Three 只在 render/、仿真跑数据）——冲突不在架构，在「几处空间/显示约定被隐式钉在 Three 上」。核实**既有协议后**发现多数已规范，实际残留 3 处，本次**补进文档 + 代码交叉引用**：

- ✅ **A2 坐标空间 / A3 尺寸-枢轴 / A5 线性插值**：**本就已规范**（`docs/architecture/coordinate.md` §1~3、`protocol/animation.md` §4 插值）。审查一度高估为「未写下」，更正：已在协议。
- ✅ **A1 · 旋转欧拉序+坐标系**：补进 `coordinate.md §3.1`——Adjunct = 引擎系 `XYZ` 序、弧度、绕中心、**不经 heading 换算**（仅玩家 yaw 走）；相机 `YXZ`。代码 `setObjectRotation` 加交叉引用。
- ✅ **A4 · 世界空间 UV 平铺**：补进 `protocol/adjunct.md §6`——`每面 repeat = 面米数 / TILE_METERS(=2)`；`material.repeat` 是叠加乘子。代码 `TextureScale` 加引用。
- ✅ **A6 · box 索引调色板**：`adjunct.md §6` 标为**遗留/非规范**，跨引擎内容存 hex；`basic_box` 代码加注。
- [ ] 🔲 **C2（承上）avatar 状态映射**：仍 open——`ANIM_STATE_PATTERNS` 剪辑名启发式未落 `avatar-animation.md` 契约。是唯一未闭的渲染层契约缺口。

> **像素级差异（着色/光照/tonemapping/阴影/相机/分段数）是合法的行为等价，有意不碰**——协议 §6「同效果边界」已写明。

**审查结论**：核心数据脊(A)干净——主目标在最要紧处成立。冲突集中在 **B（自觉逃生舱，不慌）** 和 **C（潜在陷阱）**。**C1 最该先处理**（seed 派生是 iNFT/物品核心，已在 item+motif 两处，最易被误以为「已可移植」）。**3D 层 A1/A4/A6 本轮已补齐规范**（无需改行为，只写下约定）；C 类**不阻塞 F 系列**（F1 纯调度/生成最干净）；作为独立「协议化」工作项推进，或碰到时补。

---

## 0. 已就绪的引擎地基（基线，不是 gap）

物理（角色控制 + 碰撞/stop + 移动平台 + rapier 特例 Tumble）· 渲染/资源（load-once/instance-many + 引用计数 + 有界缓存 + blob 回收 + **A/V 媒体 adjunct**）· trigger/actuator/JSONLogic 条件 · 背包/物品（b5）· 生命（**挨打侧** damage/heal/respawn）· 5 模式 + zone 门控 Game 进入 · 事件队列（帧作用域）· 持久化（DraftStore + IDB：草稿/flags/位置/背包）· 编辑器（palette 放置/改参/undo）· 空间音频 · 天气/日夜/LOD · 骨骼+SPP 动画 · 错误处理（`core/errors`）。

**结论：单机 authored 内容，引擎地基扎实。** 缺的是下面这些「让内容活起来」的原语。

---

## F1 · 运行时调度 / 定时器 / 通用生成 🔲 —— 地基，最先做

> **现状（核实）**：完全没有。`grep cooldown/scheduler/spawnActor/wave` 全空。actuator 动作是**瞬时**的（`Actuator.ts`）；帧循环**没有一次性任务队列**（`SystemManager.update` 只遍历常驻 system，见与用户讨论）；运行时生成只有原生游戏自己 spawn 棋子 + 掉落物 `ItemDropSystem`，**没有通用 `spawnActor`**。唯一的时间原语是 trigger 的 `hold`。
>
> **为什么最先做**：游戏时时刻刻要「N 秒后刷一波 / 冷却 / 做完 X 过 2 秒做 Y / 敌人 30 秒后重生」。而且它是 **NPC、战斗、任务都要踩着走的依赖**。范围小、零返工风险。

- [ ] 🔲 **Scheduler/Timer 系统**：注册「delay 后执行 / 每 N 秒 / 冷却」的定时回调，`step(dt)` 驱动、确定性、可持久化（存活跨帧）。（对齐之前讨论的「帧循环缺一次性 task 队列」——可先给 `SystemManager` 加个 one-shot 队列，或独立 `ScheduleSystem`。）
- [ ] 🔲 **通用 spawn/despawn API**：运行时创建/销毁标准实体（adjunct 或轻量 actor），复用现有 mesh/碰撞/触发装配；生命周期挂 block/zone（离开即清，复用原生游戏 teardown 的教训——根除悬空实体）。
- [ ] 🔲 **actuator 新动作**：`delay`（定时触发后续动作）、`spawn`（生成一个 authored actor/adjunct）、`despawn`。数据驱动，纯 C 案例也能用。
- [ ] 🔲 单测：确定性定时（固定 dt 下 crossing 一致）、spawn/despawn 生命周期、离 zone 清理。
- [ ] 📄 落地时开 `specs/scheduler-and-spawn.md`。

---

## F2 · NPC / 自主 agent（AI 行为 + 寻路）🔲 —— 最大内容放大器

> **现状（核实）**：完全没有。`grep npc/behaviortree/pathfind/navmesh/agent/enemy` 全空（只有 trigger.ts 命中 "ai" 子串）。现在每个实体不是玩家操控就是玩家触发，**没有任何东西自己动**。
>
> **依赖**：F1（spawn + 定时）。**联网无关**（外部层负责多人；引擎只跑本地权威 NPC，外部层如需可复制）。

- [ ] 🔲 **行为层**：非玩家实体的状态机 / 行为树（idle/patrol/chase/flee/interact）。可先做轻量状态机 System，数据驱动声明。
- [ ] 🔲 **寻路**：navmesh 或 block 网格 A*（世界是 16×16m 网格 + adjunct 障碍，格子 A* 起步最简）。
- [ ] 🔲 **NPC 数据模型**：怎么 author 一个 NPC——新 adjunct 类型？spawn point？绑定行为 + 外观（module 模型 + 动画状态机已就绪）。
- [ ] 🔲 **感知/触发**：NPC 对玩家距离/视线/flag 的反应（复用 trigger/条件思路）。
- [ ] 📄 `specs/npc-agents.md`。

---

## F3 · 战斗 / 伤害框架 🔲 —— 看类型，需 F1

> **现状（核实）**：**半个**。`HealthSystem` 只有**挨打侧**（damage/heal/fell → died/respawned）。`grep projectile/hitbox/hurtbox/melee/weapon/combat` 全空——**没有打人这一侧**。ShootingRange 是定制原生游戏，不是通用框架。
>
> **依赖**：F1（抛射物 = spawn + 定时）。**优先级看游戏类型**：动作/战斗向就大，社交/解谜/探索向可暂缓。

- [ ] 🔲 **伤害-施加侧**：一个实体对另一个造成伤害的通用通道（接到既有 `player:damage` / HealthSystem）。
- [ ] 🔲 **抛射物**：spawn 一个带速度/寿命的实体，命中判定 → 伤害（复用 F1 spawn + 物理）。
- [ ] 🔲 **命中判定**：hitbox/hurtbox 或球体/AABB 重叠（复用 trigger 的容器判定思路）。
- [ ] 🔲 **范围/DoT/击退**（可选，后续）。
- [ ] 📄 `specs/combat-damage.md`。

---

## F4 · 对话 / 任务 / 目标 / 进度 🔲 —— 故事层（即「台词」缺口）

> **现状（核实）**：没有。`grep dialogue/quest/objective` 命中的全是 UI 「dialog 模态」和事件名，**不是会话/任务系统**。进度只能靠 `globalFlags` + JSONLogic 硬编。用户早前提的「台词」正是这块。
>
> **可合流**：对话内容 = 文本/语音/视频，**正好接刚做的 A/V 媒体 adjunct** + UI 层。与 `PLAYABLE_CHECKLIST` G2「目标/进度系统」有重叠——本项做**引擎原语**，那边做**内容 HUD**。

- [ ] 🔲 **对话系统**：节点式会话（文本 + 分支选择 + 触发动作），trigger/interact 启动；可挂 A/V。
- [ ] 🔲 **任务/目标**：objective 追踪（状态：未接/进行/完成），基于 flag + 新增轻量结构；完成触发 actuator 动作。
- [ ] 🔲 **进度存档**：接 DraftStore meta（flags/位置/背包已在同通道，任务状态并入）。
- [ ] 🔲 客户端 UI：对话框 / 目标 HUD（与 `PLAYABLE_CHECKLIST` G2 协同）。
- [ ] 📄 `specs/dialogue-quests.md`。

---

## 处理顺序

1. **F1（调度 + 生成）** ——先做，地基，解锁 F2/F3，零返工。
2. **F2（NPC/AI）** —— 内容放大器，依赖 F1。
3. **F3（战斗）/ F4（对话任务）** —— 顺序按**首发玩法类型**定（动作向先 F3，叙事/社交向先 F4）；两者都可在 F1 之上增量建。

> 每项落地：先在 `specs/` 开规格（核实现状→定方案，像 error-handling / av-media 那样），再实现 + 测试 + 本文勾选。**不主动提交，按批 /git。**
