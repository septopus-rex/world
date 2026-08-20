# 原生在场游戏 —— 缺口与落地（Native In-World Games）

> **用途**：追踪「直接在 3D 里玩游戏」这条 **Pattern B（原生在场：System 持逻辑、游戏对象即 adjunct 实体）** 从「核心交互回路跑通」到「真人可玩」的剩余缺口。
> **由来**：用四个案例对抗性验证了这条缝——`PoolSystem`（连续物理）+ `MahjongSystem`（离散回合）+ `ShootingRangeSystem`（一击一反应/运行时改色）+ `TumbleSystem`（叠叠乐/Jenga，**真实刚体物理**）。核心回路已证明通用（对象即 adjunct、System 持逻辑、点击→动作、确定性、`derivedFrom` 防序列化、`destroyAdjunct` 防网格泄漏）。本文记录这些案例**没触及**或刚补上的部分。
>
> **Tumble（第 4 案，2026-06-30）—— 这条缝撑得住"引入一个物理库"**：抽积木塔，点击抽块看塌不塌。选型上由 hand-rolled 阈值模型升级为真·刚体（`@dimforge/rapier3d-compat`，引擎首个 Three.js 之外的运行时依赖）——倒塌的涌现手感**就是**玩法，值这个依赖。要点：rapier 是 headless WASM 数学库，落 `core/` **不**破渲染层边界；每局跑**独立 scoped world**（仅本塔 ~45 块 + 地面，进入建/退出 `.free()`，引擎其余实体不变刚体）；首次需要把刚体**旋转**同步到 mesh（pool 只同步位置）——`TransformComponent.rotation` 是 Euler，core 内手算四元数→Euler-XYZ（`quatToEulerXYZ` 匹配 `THREE.Euler`）。三个坑：rapier 睡眠体抽块后须 `wakeUp()`、`setEntityColor` 须等 mesh 出现后再上色（延迟 `pendingColor`）、yaw=90° 是 XYZ-Euler 万向锁奇点→"倾倒"判定改用四元数算上轴夹角（`snapshot.maxTilt`）。验证：engine `tests/systems/tumble.test.ts`（4）+ e2e `tumble3d.spec.ts`（trigger 进入建 45 块直立木塔→抽支撑→倒塌 maxY 1.99→0.92、maxTilt→π；截图 `tumble3d-standing|toppled.png`）。
> **三种托管模式**（别混）：**A 外部 app**（GameSetting + GameRuntime + IGameApi + HUD，逻辑零引擎依赖、可服务端跑）·**B 原生 System**（本文，System 持逻辑、对象即 adjunct）·**C 纯数据驱动**（authored 块数据 + 通用 Trigger/Actuator/Flag/Health，**零专用代码**）。**跑酷 = C**（`client/core/src/levels/parkour.level.json` + `core/services/AuthoredLevel.ts`，已落地+测；原 `core/levels/parkour.ts` 生成器已退役、冻结为 JSON；移动闯关/机关/门禁类用 C 就够，不该写 System）。选型口诀：**先问能不能 C，不能再上 B，需要服务端权威才上 A**。
> **配套**：内容寻址/资源见 `specs/mock-ipfs-resource.md`；可玩化总清单见 `PLAYABLE_CHECKLIST.md`；记忆 `native-in-world-game-pattern.md`。
> **更新**：2026-08-20 —— **#4 已结**：四个原生游戏的 armed config 全部改成 `Map<"x_y",…>` 每块一份 + 「逐字节相同的重复声明不重置进行中的一局」守卫；同日 `CoasterSystem` 从世界单例改为锚定 `world.activeGameBlock`（详见 `coaster-via-spp.md §10`）。2026-07-03 —— **#3 校正已实现**：trigger 承载进入 + per-game `exitPolicy` 三档已落地（b601422，`core/services/Actuator.ts` `asExitPolicy` + e2e `game-trigger.spec.ts`）；`gameId` 路由仍未做。2026-06-30（晚）—— **#3 设计校正**：经讨论确认「写在 block 上的区域门控」**层放错了**——一块只能一个游戏（放不下一排扭蛋机），且把"哪里能玩"和"玩什么+在哪+参数"挤在一层。**校正为**：游戏富声明迁到 **game trigger**（`enterGame` 带 `gameId`/`origin`/`exitPolicy`，一块可多台），block 只留**粗粒度"此处可玩"位**；退出做成 per-game **`exitPolicy` 三档**（`ephemeral` 走出即拆＝现状 / `confirm` 弹框防误触 / `persistent` 存档重入）。**不新增第二个 SystemMode**（玩法门控不变）。文档已按此校正（本文 #3 + `game-mode-entry.md`），**代码已跟进（2026-07，见本行首）**。2026-06-30（早）—— #3 单块 ephemeral 落地（区域门控 Game、复用 GameZoneSystem，反转早先「不挂 Game、在场」决策）+ 打靶第三案例 + 运行时改色（#1 子项 ✅）。2026-06-29 创建。改一项就勾一项并更新本行。

## 图例

| 标记 | 含义 |
|---|---|
| ✅ | 已完成（落地 + 验证） |
| 🟡 | 方案已定，未实现 |
| 🔲 | 待办 |
| ❌ | 有意不做（附理由） |

---

## 推进顺序（按「挡不挡得住真人玩」）

1. ✅ **可读对象**（#1）—— 麻将牌面（slot-7 内容寻址）+ **运行时改色**（打靶）均已落地。
2. ✅ **生命周期绑定**（#3）—— `ephemeral` 单块版**已落地**（区域门控 Game、走出即拆）；trigger 声明 + `exitPolicy` 三档 + block 降粗位**已实现**（2026-07，b601422；`gameId` 路由仍未做，见下）。
3. **更丰富的场内输入**（#2）—— 让台球真正「在场可玩」，而非靠键盘/API。
4. 之后：HUD 外壳（#6，打靶/麻将/台球各有 HUD，仍缺通用外壳）、每实例化（#4）、玩家绑定/多人（#5）。

---

## #1 对象无法表达自己的状态 🚧 麻将牌面 ✅ · 运行时改色 ✅ / 球号·动态文字仍开放

**现状（已核）**：
- `MeshFactory` 几何只有 grid/wirebox/sphere/plane/cylinder/cone/tube/light/box —— **无任何 glyph/canvas/text 路径**。麻将牌是一模一样的奶白盒子（分不清一万/九筒），台球是没号的彩球。
- 运行时改色缺（原缺口 1）：选中高亮、死子变暗做不到（color 在 mesh build 时烤死）。
- 无 hover/选中反馈：RaycastInteractionSystem 有 hover，但对象无法反映「我被瞄准/选中」。

**影响**：能看出「这是个游戏」，但**读不出牌局**。对麻将致命。

**方案（定）—— 复用 a2 box 纹理槽 + 内容寻址，不造新轮子**：
- a2 box raw 第 8 槽（slot 7）是纹理：`[size, pos, rot, resource(colour), repeat, animation, stop, texture?]`（见 `MotifExpander.ts:34-50`）。motif 活图板已走「slot7 = 内容 hash → ResourceManager → IpfsRouter → 贴图」。
- 麻将牌（34 种）/球号（0–15）是**固定字形集** → 做成**按 kind 索引的图集（atlas）**：一张 atlas + 每牌不同 UV offset（SPP 已有 `setTextureOffset`），或 34 张小图各自 CID。「string[]+index」在此退化为「asset[]+index/CID」。
- `MahjongSystem.spawnTile` 在 faceUp 时给 raw 补 slot7（该 kind 的牌面 CID/atlas 格），face-down 不补。**顺带绕过运行时改色**——贴了图就不靠改色区分。
- **边界**：IPFS 现为可选后端（链已解耦），抽象是 `IpfsRouter`，必须在纯本地 CAS provider 下也能跑（本来就是）。**固定字形**用预制图集完美；**任意动态文字**（实时分数、玩家名）仍需另一条 text→canvas 贴图路，不在本项内。

**子任务**：
- [x] 牌面资产生成 + 注入 CAS（`client/core/src/scenes/mahjongFaces.ts`：34 种 canvas→PNG→`engine.ipfs.put`→CID）。**2026-08-19 重画成真牌面**：筒/索是**纯矢量**（同心钱纹、竹节，1索是鸟）——这两门本来就是图案，零字体依赖，占全副牌的三分之二；萬与字牌需要 CJK 字形，走系统字体并**检测是否解析成功**（`hasCjk`：比较「萬」与 notdef 的 advance），缺字体时那 8 种退回拉丁标记，降级但不出豆腐块。画布 192×256 = 牌面物理比 0.24×0.34 m，`material.fit` 才不会把字压扁。附带 kind 34 = **牌背**（`TILE_BACK_INDEX`），暗牌不再是一排纯色方块。
- [x] `MahjongSystem.spawnTile` 在 faceUp 时写 slot7 = `faceCids[kind]`（`MahjongConfig.faceCids`，DesktopLoader 生成+缓存后注入）。
- [x] e2e：top-down 截图肉眼可读（数字+花色+风/箭），数据断言 14 明牌带 CID / 39 暗牌空白 / CID 经 CAS 解析。`test-results/mahjong3d-readable-faces.png`。
- [x] **关键修复**：`TextureScale.applyBoxWorldUV`（尺寸派生 UV 平铺，为墙/地设计）会把 0.24×0.36m 小牌面 UV 缩到 0..0.12，只采样到字形左下角空白→牌看着空白。新增 `material.fit`（`MeshFactory` 跳过平铺、用自然 0..1 UV 贴满整面，几何缓存键含 `:fit`）；牌面 spawn 后置 `material.fit=true`。**任何"贴满整图"的标签/贴花 box（招牌、二维码、motif 活图板）都该用 `fit`**。
- [x] **运行时改色/高亮（打靶案例落地）**：新增 `core/utils/Appearance.ts` `setEntityColor(world,eid,color)` —— gameplay System 一行改一个 adjunct 的颜色：写 `MeshComponent.colorOverride` + 标 `dirty` → `VisualSyncSystem` 推到 handle（`RenderEngine.updateObjectAppearance`）。**坑（已修）**：纯色 box/sphere 共享缓存材质，原地 `setHex` 会**染一片**；改 `updateObjectAppearance` 为 **clone-on-write 隔离**（`isolateMaterial`，并清 `userData.shared` 使 clone 随 mesh 释放——连带修掉 `setObjectOpacityIsolated` 那条 clone 继承 `shared=true` 的潜在泄漏）。数据驱动落点（非 core 直调 renderEngine）→ headless 可断言 `colorOverride`、e2e 断言真材质色。`ShootingRangeSystem` 命中翻红、litTime 后翻绿复位（无 destroy/respawn）。
- [ ] 球号（a7 球面）：贴图绕球面是 decal/UV 问题（非 slot-7 直贴），单列。
- [ ] 任意动态文字（实时分数/玩家名）：text→canvas 贴图路（仍开放）。

**关键文件**：麻将牌面：`render/MeshFactory.ts`(`fit`/`getGeometry`)、`render/TextureScale.ts`、`core/types/Adjunct.ts`(`MaterialConfig.fit`)、`core/systems/MahjongSystem.ts`(`faceCids`/slot7)、`client/core/src/scenes/mahjongFaces.ts`、`client/core/src/lib/loader/GameBridge.ts`(`injectMahjongFaces`，订阅 `game.declare`)。运行时改色：`core/utils/Appearance.ts`、`core/components/VisualizationComponents.ts`(`MeshComponent.colorOverride/opacityOverride`)、`core/systems/VisualSyncSystem.ts`、`render/RenderEngine.ts`(`isolateMaterial`)、`core/systems/ShootingRangeSystem.ts`。验证：engine `mahjong.test.ts`(9) + `shooting.test.ts`(8) + e2e `mahjong3d.spec.ts`(3) + `shooting3d.spec.ts`(1，真实点击→绿变红、其余不染)。

## #3 生命周期绑定（load / evict / persist）✅ ephemeral 单块版 ✅ / trigger 声明 + exitPolicy 已实现（2026-07，gameId 路由仍开放）

**曾经的病（已核）**：三个原生游戏当时是 Normal 下「在场」、`block.loaded {once}` 自动 spawn。游戏对象（牌/球/靶）是块的子 adjunct，命随块走；而游戏**状态**住在 System 私有字段 + 一个**游离的 table/range 实体**（`world.createEntity`，无 `parentBlockEntityId`）。玩家走远 → 5×5 窗外块**立即驱逐**（`removeBlock` 无差别销毁子 adjunct，`derivedFrom` 只挡序列化不挡驱逐）→ **对象没了、游离状态残留、System 持悬空 eid**；麻将的 bot 计时器还在内存里**空跑发牌**；而 `once` 钩子已消费 → 走回也不重建 → **半死、无法恢复**。

**方案（已落地 2026-06-30）—— 复用 game-mode-entry 契约，把原生游戏改成区域门控 Game 游戏**：
- **标块**：原生游戏块 `block.game = 1`（纯可玩标记，≠外部 app id 42/43，`GameRuntime` 不启动外部 HUD，只吃区域门控）。`shooting`/`mahjong3d` 场景已设；台球块本就是外部区（43）。
- **System 自管生命周期**：`configure` 改为**登记(arm)**（存 config，不立即 spawn）；每帧 `syncSession` 按「`world.mode===Game` 且玩家在本游戏块」启停——进入 Game 即 `startSession`（spawn），退出/走出块即 `endSession`（free mesh + 销毁状态实体）。三个 System 一致（Pool/Mahjong/Shooting）。
- **更紧的边界根除半死**：「走出 block」（1 格、`GameZoneSystem` 自动退回 Normal）比「块驱逐」（3 格）**更早触发** → 棋子在驱逐前就拆干净，永不残留。armed config 留在 System（跨驱逐保留）→ 重入 Game = 全新一局。
- **明确进入/退出**：站上块出「▶ 进入游戏」（`data-testid="enter-game"`），点击 → `setMode(Game)`（守卫：仅 zone 内）；走出块自动退回 Normal（`exit-game` 亦可）。
- **客户端几乎不改**：仍在 `block.loaded {once}` 上 arm 一次；进/出 Game 全由引擎管（引擎为真相源）。

**代价（有意接受）**：「街机柜」模型——离开即弃局，回来是新一局（无中途存档）。

### 设计校正（2026-06-30 晚）—— ephemeral 单块版只是第一档，声明该迁到 trigger

落地后讨论暴露两点，确认上面的"区域门控写在 block 上"**层放错了**：

1. **"走出即退出"是错的默认**：对打靶/扭蛋这种街机柜，走开＝结束本就对（这是 `ephemeral`）；但它**未被声明**、且对"已玩几分钟的单局麻将"**静默丢局**很难受 → 需要 per-game **`exitPolicy`**（`ephemeral` / `confirm` 弹框 / `persistent` 存档重入）。**不新增第二个 SystemMode**——玩法门控（`mode===Game` 12+ 处）不变，策略只管会话怎么收场。
2. **一块一游戏放不下一排扭蛋机**：`block.game` 标量把"哪里能玩"（粗）和"玩什么+在哪+参数"（细）挤在一层 → 富声明迁到 **game trigger**（`b8` + `enterGame` 带 `gameId`/`origin`/`exitPolicy`，一块可多台），block 只留**粗粒度"此处可玩"位**。现成的 `GameRuntimeSystem` gameId→GameSetting 解析**直接复用**，只换 `gameId` 来源（block → trigger）。**顺带干掉客户端硬编码 arm 坐标**（下方"仍开放"的数据驱动声明随之解决）。

完整校正后的契约见 `docs/systems/game-mode-entry.md`（§1 声明在 trigger、§2 exitPolicy、§8 实现状态与顺序）。

**状态（2026-07 更新，原"仍开放"清单）**：
- ① ✅（部分）`enterGame` 带 `exitPolicy` + game trigger 入口**已实现**（b601422，`core/services/Actuator.ts` `asExitPolicy` + e2e `game-trigger.spec.ts`）；**`gameId`/`params` 路由仍未做**（"一块多游戏"待此项）。
- ② ✅ `exitPolicy` `ephemeral`（声明化）+ `confirm`（弹框防误触）**已实现**（b601422）。
- ③ ✅ `block.game` 已降级为粗粒度"此处可玩"位（富声明在 game trigger）。
- ④ 🟡 `persistent` 档已随 exitPolicy 落地（存档重入，b601422）；**跨多块区域预加载仍开放**（依赖 `coaster-via-spp.md §9.1/M2.5`；`ephemeral` 单块不需要）。

**关键文件**：`core/systems/{Pool,Mahjong,ShootingRange}System.ts`（arm/syncSession/startSession/endSession + playerInBlock）、`core/systems/GameZoneSystem.ts`、`World.setMode` 守卫、`core/services/Actuator.ts`（`enterGame` 带 `exitPolicy` 已实现，`asExitPolicy`；`gameId` 路由待做）、`core/systems/GameRuntimeSystem.ts`（解析管道）、块数据 `client/core/src/blocks/{shooting,pool,tumble,mahjong3d}.block.json`（`raw[4]=1` + b8 game trigger 富声明；**客户端零坐标**）。验证：engine `shooting.test.ts`（zone-gated spawn + 退出 teardown + 重入 fresh）、e2e `shooting3d.spec.ts`（走上块→无棋子+进入提示→进入→spawn→点击变红→**真实走出 block 自动退出+拆除**→走回重入 fresh）。

## #2 输入只有「单击 → 离散动作」🔲

**现状（已核）**：
- 只有 `interact.primary`（一次 raycast 单击挑目标）。麻将打牌够用。
- 台球 `shoot()` 暴露天花板：瞄准需角度+力度，单击给不了 → pool 把击球**甩给键盘/HUD/API，场内无杆法瞄准**。无拖拽、无蓄力、无手势。

**方案（草案）**：场内连续/手势输入通道（drag 向量 + hold 时长），供「拖拽瞄准 + 蓄力」一类玩法；保持 System 不直接读输入（经事件）。

## #4 System 是单例，不是每实例 ✅ 四个原生游戏 + 过山车都已改每块一份（2026-08-20）

**曾经的病（已核）**：每个 System 只有**一个** `config` 字段。四个都从 `game.declare` 自臂，
所以"能放在任意一块"成立，但**放第二台就被最后加载的那块覆盖**——先加载的那台走进去不发牌、
不摆球、不出靶、不搭塔：**零报错的静默死物**，而且哪台活着取决于块加载顺序。

**修法（四个一致）**：`configs = Map<"x_y", Config>` 每块一份 + `live` 记住哪台在玩，
走到另一台换局（街机柜模型，同时只有一局）。**外加一条守卫**：块重新 loaded 会重发
`game.declare`，`configure()` 收到**逐字节相同**的声明必须直接 return——否则玩家在块边缘走一下，
正在打的一局就被静默重置（球重摆、靶归零、塔重建）。麻将 2026-08-19 先踩到，另三个 2026-08-20 补齐。

**「同时只有一个 live 会话」是设计，不是漏网**：`findTable` 仍是 `getEntitiesWith([...Table...])[0]`，
但同一时刻只可能有一局在跑（`world.activeGameBlock` 是唯一锚），所以这个查找取到的就是那一局。
早先的草案「System 改为按实体集合迭代」**不再需要**——要并发多局得先有"多个 activeGameBlock"，
那是多人/多会话议题（#5），不在本项。

**回归**：`integration/mahjong.test.ts`「is placeable」（同一份桌子数据放两个坐标，各自按自己的
seed 发牌，来回走都是新局，全程零宿主调用）· `integration/pool.test.ts` ·
`integration/shooting.test.ts` · `systems/tumble.test.ts` 各两项（「is placeable」+
「identical re-arm 不重置进行中的一局」）。

**过山车是同一族的另一种走法，也已修（2026-08-20）**：`CoasterSystem` 连"单例 config"都算不上——它没有 config，
`buildPath` 扫全世界取**第一条** coaster 轨道、path 跨会话缓存，且**完全不问这是哪个块的局**。
后果不是"放第二台会覆盖"，而是同世界里**任何** Game 区一进去就被弹上轨道（gallery 里那张德州扑克桌
正中此招），且 `rideActive` 冻结 zone 追踪让玩家走不出去。现改为锚定 `world.activeGameBlock`、
只认该块自己的轨道、path 不跨会话缓存，与麻将同构。详见 `coaster-via-spp.md §10`。


## #5 没有「谁在玩」—— 交互无 actor 绑定 🔲

**现状（已核）**：`MahjongSystem.update` 忽略 `ev.actor`，任何人点到 human 手牌都打出；单一本地 `humanSeat` 写死。无坐下认领、无多人占座仲裁、无网络。

**方案（草案）**：座位认领 + 用 `interact.primary` 的 `actor` 做归属校验；多人/网络是更大议题，先做单机座位绑定。

## #6 没有非空间状态的外壳（HUD / 流程 / 相机）🔲

**现状**：轮次/剩牌/分数/力度条/胜负/重开 native 模式无处安放（Pattern A 外部 app 有 HUD 覆盖层）。相机：第一人称 pitch 自动回正（e2e 需 Alt+ArrowDown 锁），无「坐到桌前」相机预设。

**方案（草案）**：客户端通用「游戏 HUD」覆盖层（镜像 System 状态事件）；「坐下」相机预设（复用 Observe 绕目标）。

---

## #7 规则住在 System 里 ✅ 已抽出牌理核（2026-08-19）

**病**：同一款麻将存在于两处——`MahjongSystem`（Pattern B，世界里的 3D 桌）与
`client/core/src/games/mahjong/MahjongGame.ts`（Pattern A，外部 app，也跑在
`services/mahjong`）——而**两边各写了一半规则**：

- 3D 桌**没有和牌判定**（旧注释自陈 `Scope is the SEAM, not legal mahjong: no win
  detection / scoring`），四家摸打到流局为止；
- Pattern A 有和牌判定，但只自摸、无番种、bot 同样摸打。

坐下三十秒就能看出这不是麻将：**不能碰、不能杠、不算番**。这不是"demo 的合理简化"，
是玩法本身缺席——`#1 可读对象`把牌面修到能读了，读出来的却是一局永远不会结束的牌。

**做法**：规则抽成 `engine/src/core/mahjong/`，纯函数、零 import、不碰 ECS/渲染/DOM：

| 文件 | 职责 |
|---|---|
| `Tiles.ts` | 34 种编码（萬/筒/索/風/箭）、花色点数、幺九判定、副露类型 |
| `Rules.ts` | 和牌判定（4 面子+1 将 · 七对 · 十三幺）、**向听数**、待张、吃碰杠合法性 |
| `Score.ts` | 番种识别（国标子集 30 项）+ 番种互斥 + 结算（底分 8 + 番） |
| `Bot.ts` | 按向听选弃牌、进张数破同分、现物防守、副露决策 |

`MahjongSystem` 由 343 行的"发牌+轮转"变成**只管桌子**：座位几何、实体生死、
turn/claim 状态机、bot 计时器。每一个「这手能不能和 / 值多少番 / 这张能不能碰」
都问牌理核。Pattern A 问同一份（相对路径 import——`services/mahjong` 跑裸 tsx，
没有 `@engine` 别名）。

**判据（可复用）**：这段逻辑换个引擎、换个宿主还成立吗？成立就不属于 System。
Pattern B 是"承认的不可移植逃生舱"（见 `GAME_SYSTEMS_BACKLOG.md` 铁律），但逃生舱
装的应该是**桌子**，不是**规则**——规则是纯函数，天然可移植，焊进 System 只是懒。

### 落地时调过的三个参数（别凭直觉改回去）

1. **bot 不能「能吃就吃」**。第一版 `decideClaim` 只要向听改善就叫牌，实测 24 局：
   副露最多 7 副、一局 20–50 手就结束——**真实牌局的三分之一**，且门清番种几乎绝迹。
   现在要求「已副露 / 幺九字牌 / 已近听」才叫，门前清立刻回到多数局。
2. **起胡 2 番**（`MahjongConfig.minFan`，默认 2）。不设的话 1 番"鸡和"满天飞，
   番种系统等于白做。
3. **和牌判定与算分必须同源**：`winValue()` 与 `declareWin()` 走同一个 `scoreHand`。
   否则会出现「胡牌按钮亮了、点下去说番数不够」——玩家读作 bug，且无从解释。

### 顺带修掉的两个视觉错误

- **手牌立起来**（`upright`），面朝各自座位；副露与弃牌平放。此前全部平躺在毡面上，
  第一人称根本看不见自己的牌。整牌只用 `rot[2] = seat × 90°` 转向，**不是按座位交换
  size 分量**——后者会把 `fit` 贴图沿错误的轴拉伸，字全躺下。
- **暗牌有牌背**（`MahjongConfig.backCid`）。此前对家手牌是纯色方块。

**验证**：`engine/tests/unit/mahjong-rules.test.ts`（29 项，牌理核本身：和牌形状、
向听、待张、吃碰杠、番种互斥、结算平账、bot 策略）+ `engine/tests/integration/mahjong.test.ts`
（14 项，含**打完整局**——5 个种子全部产出可验证的和牌，番数≥1、账目平衡、和牌手真的
是和牌手）+ e2e `mahjong3d.spec.ts`（HUD 呼叫按钮、结算面板、真实鼠标点击打牌）。

### 桌子成为可放置的数据（2026-08-20）

`#7` 抽出规则之后还剩最后一根钉子：**麻将桌的坐标写死在客户端**。

```ts
// client/core/src/scenes/mahjong3dScene.ts —— 已删除
export const NATIVE_MAHJONG_BLOCK: [number, number] = [2047, 2048];
engine.on('block.loaded', () => setupMahjong3D(), { key: 'blk:2047_2048', once: true });
```

所以「麻将只能在一个地方玩」**跟能不能动态加载逻辑代码毫无关系**——机制 2026-07 就有了
（`full-data-migration.md` P2：b8 game trigger 带 `game:{kind,…}` → `BlockSystem` 发
`game.declare` → System 自臂），Pool / Shooting / Tumble 三个都接了，**麻将是唯一没跟上的**。
它没跟上的原因是 `faceCids`：34 张牌面要客户端 canvas 生成后注入，于是走了宿主调用那条老路。

**解法是把两件被混在一起的事拆开**：

| | 归属 | 落点 |
|---|---|---|
| 桌子放在哪、几号种子、桌面多高 | **数据** | 块自己的 b8 `game` 声明 |
| 34 张牌面长什么样 | **世界资源** | `Engine.setMahjongFaces`，一次注入、所有桌子共用 |

拆开后：客户端零坐标，`MahjongConfig` 变成每块一份的 Map，同一份块数据放在任意坐标都是一张
能玩的桌子。**牌面异步到达时 `setFaces` 会重刷已发的牌**——否则抢先坐下的玩家整局对着白板。

两个连带效果，都不是设计出来的：
- **e2e 从 23.2 分钟降到 9.6 分钟**。发牌此前要等 35 张 canvas→PNG→CAS 往返，现在不等了。
- **踩到一个缓存陷阱**：牌面注入一度挂在 `GameBridge.wire()`，但那时 `engine.ipfs` 还没起来，
  而生成器缓存自己的 promise —— **问早了就把 `undefined` 永久缓存，牌永远是白板**。改挂
  `block.loaded{once}`（任意块，不是特定块）。

### 场景：中式茶室（`client/core/src/blocks/mahjong3d.block.json`）

此前是「一张方桌 + 四个方凳站在空草地上」。现在是 12×12 m 的中式茶室，用
`oriental.stylepack` 砌：

| 部位 | 用什么 | 为什么不是别的 |
|---|---|---|
| 四个特色面 | SPP：南=月亮门廊(入口) · 北=水墨屏风月亮门 · 东西=雕花菱花窗 | 这四面是**你会看的地方**，值得多部件造型 |
| 八段普通墙 | 单块 a2 砖墙板 | `solid` option 是 5 个 part，八段就是 40 个 mesh 画八面从两米外看毫无差别的墙——**e2e 预算就卡在这里** |
| 顶棚 / 地台 | 各一块 a2 板 | 同理，九个 SPP 顶面 = 45 个 mesh 画一个平顶 |
| 座椅 | `scholar_chair` prefab ×3（东/北/西） | **南面有意留空**——那是玩家站的位置，摆上椅子就把人挡在毡外了 |
| 陈设 | `stone_lantern` + `incense_burner`，**碰撞关掉** | prefab 每个 part 自带 stop=1；纯陈设玩家够不着，却每帧参与碰撞检测 |
| 光 | 桌上暖色吊灯 + 门口/屏风两盏补光 | 有顶棚就是个黑盒子，这不是画面偏好而是必需 |

**生成器一次性跑完即冻结**（`scenes/README.md` 的内容=数据纪律），脚本不入库。要重做
就照上表重写一份：SPP 源是一行 b6（3×3 level-0 cells，`origin [2,2,0.12]`），其余是
普通 authored 行。

### 仍开放

- **一局制**：没有连庄/换风/多局累计，`scores` 每次进桌重置。
- **不能自己开杠之外的选择**：暗杠/加杠会自动列入 offer，但没有"这张不碰"的记忆。
- **无听牌提示的具体张**：HUD 只显示「聽牌 / N 向聽」，不列待张（`waits()` 已有，
  是产品选择不是缺口）。

## 有意不做（非缺失）

- ❌ **完整规则/番种/胜负判定**：当初明确砍掉的 scope——双案例只验证「缝」，不做完整游戏规则。需要时按具体游戏单独实现，不属本缝基础设施。
