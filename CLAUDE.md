# Septopus World

独立 3D 虚拟世界引擎（TypeScript ECS）+ 无链 PWA 客户端。链已完全解耦——`engine/src` 与 `client/desktop` 零 `@solana` 依赖；链作为可选发布插件存在，默认不装。

> 链剥离已完成（2026-06，审计确认），详见 `docs/plan/STANDALONE_ENGINE_ROADMAP.md`。
> `chain/`（Solana 合约）与旧 `app/`（链耦合前端）已移出 git 追踪、封存在磁盘；旧 JS 引擎已归档到 `engine/backup/`。
> **旧引擎 parity 已补齐（2026-06）：可退役。** 新引擎覆盖或超越旧 JS 引擎全部能力；旧引擎中 tube 几何 / texture·morph 动画 / lightning / linger 实为空壳 stub，已在新引擎真正实现。**有意不移植**（非缺失）：多链 API（已解耦）、触屏/移动端输入（超出桌面 PWA 声明范围）、card/news/manual 信息页（属 React 客户端层）。**完整 2D 地图页**原列"有意不移植"，**现已解除并实现 v1（2026-06）**：`client/core/src/components/WorldMap2D.tsx` + `DesktopLoader.fetchMapCell`，视口窗口化流式、复用块数据通道、非全局索引；规格见 `docs/plan/specs/2d-map.md`。

## 项目结构

```
world/
├── engine/                  # 3D 引擎（TypeScript ECS，核心）
│   ├── src/
│   │   ├── Engine.ts            # 引擎外观：new Engine(container, services) + bootWorld/start/step/injectBlock
│   │   ├── core/
│   │   │   ├── World.ts             # ECS 世界 + 系统编排 + 主循环
│   │   │   ├── systems/             # 系统（Physics/Trigger/Block/Edit/VisualSync/Minimap…）
│   │   │   ├── components/          # ECS 组件
│   │   │   ├── services/            # DataSource·DraftStore(IDB)·ExportService·AdjunctSandbox·AdjunctLoader·AdjunctRegistry·IChainPublisher
│   │   │   ├── protocol/            # CollapseCodec（弦粒子 SPP 的 L2 二进制编解码）
│   │   │   ├── factories/ utils/(Coords) types/
│   │   ├── render/              # Three.js 渲染层（唯一允许 import Three.js 的位置）
│   │   │   ├── RenderEngine.ts      # 渲染引擎抽象 + 骨骼动画管理
│   │   │   ├── ResourceManager.ts   # 模型/纹理加载（load-once + instance-many）
│   │   │   ├── MeshFactory.ts       # 几何体 + 材质工厂（带缓存）
│   │   │   ├── RenderPipeline.ts    # 渲染管线
│   │   │   └── loaders/             # ModelLoader（GLTF/FBX/OBJ/DAE）
│   │   └── plugins/adjunct/     # adjunct 定义（19 个内置，见下"编辑 / Adjunct"清单）
│   ├── tests/               # vitest：unit / systems / integration / scenarios（见 tests/README.md）
│   └── backup/              # 旧 JS 引擎（septopus/，已归档；gitignore）
├── client/                  # 无链 3D 客户端（三分：core 共享核 + desktop 7777 + mobile 7778）
│   ├── core/                # 共享核（loader/useEngine/组件/levels·blocks·worlds·stylepacks 数据）
│   ├── desktop/             # 桌面 app（React+Vite PWA，e2e 37+ spec）
│   └── mobile/              # 移动 app（独立 vite/playwright；摇杆+触屏视角+抽屉）
├── deploy/                  # dev.sh / build.sh：启动/构建 client/desktop；RELEASE.md 发版指南
├── docs/                    # 参考实现文档(architecture/systems/guides)+ plan 过程文档;规范在 protocol/
├── chain/                   # Solana 合约（已移出 git 追踪，本地存档）
└── app/                     # 旧链耦合前端（已移出 git 追踪，本地存档）
```

## 常用命令

```bash
# 客户端（桌面 3D PWA）—— 用 npm
cd client/desktop && npm install && npm run dev    # http://127.0.0.1:7777
cd client/desktop && npm run build                 # 静态 PWA → dist/
bash deploy/dev.sh                                 # 等价启动器

# 引擎 —— 用 yarn（有 yarn.lock）
cd engine && yarn install
cd engine && yarn test                             # vitest（watch）
cd engine && yarn test:run                         # 跑一次
cd engine && yarn build                            # tsc
```

## 核心概念

- **Block**：世界的基本单元，4096×4096 网格，每个 Block 16×16 米。
- **Adjunct**：附属物，附着在 Block 上的 3D 对象（墙/水/灯光/触发器等）。
- **ECS**：`World` 持有 registry + 系统；状态即数据（便于 headless 测试）。
- **数据流**：`IDataSource`（纯数据文档/草稿，可换链/IPFS）→ Raw → STD（`CollapseCodec`）→ RenderData → Three.js。**默认世界也是数据（P7，2026-07-08）**：`default.level.json`（9 块 ref + `fallback` 回退地面模板）+ `default.world.json`（世界配置文档）+ `ContentResolver`（名字/CID→内容，本地=import JSON、联网=CAS/IPFS 同形状）；scene 注册表与 MockBlockData 客户端路径已退役，「内容从哪来」只有一个答案：关卡文档。
- **坐标系**：Septopus（X东 Y北 Z上）↔ Engine/Three（X右 Y上 Z前，北 = −Z）；转换见 `core/utils/Coords.ts`。**术语纪律（2026-07-04）**：**SPP 专指弦粒子协议**（String Particle Protocol，独立仓 ff13dfly/spp-protocol）；数据坐标一律称 **Septopus 轴序**，动画称 **Septopus 动画**——不得再写 "SPP 坐标/SPP 动画"（曾混用，协议文档已统一，代码标识符 `septopusToEngine` 等同日对齐）。
- **链可选**：通过 `IChainPublisher` 注入发布；纯模式零 `@solana` 依赖。

## 关键入口

- `engine/src/Engine.ts` — 引擎外观；`bootWorld()`、`start()`（rAF 循环）、`step(dt)`（确定性逐帧）、`injectBlock()`、`setEditMode()`。渲染器可经 `services.renderer` 注入（测试用 NullRenderEngine）。
- `engine/src/core/World.ts` — ECS 世界、系统编排、主循环。
- `client/core/src/lib/DesktopLoader.ts` — 客户端数据装载器（实现 `IDataSource`，喂纯数据文档：`levels/`/`blocks/`/`worlds/` + ContentResolver）。**client 三分（2026-07-08，specs/mobile-client.md）**：`client/core`（共享核：loader/useEngine/共享组件/纯数据内容，无 package.json，双端经 `@core` 源码别名引用）+ `client/desktop`（桌面 app，7777）+ `client/mobile`（移动 app，7778，独立 package.json/vite/playwright；摇杆/触屏视角/底部抽屉）。
- `client/desktop/src/App.tsx` — 桌面壳入口;**双壳(2026-07-08)**:`main.tsx` 按 `?ui=mobile|desktop`/触屏自动检测路由到 `src/mobile/MobileApp.tsx`(移动壳:虚拟摇杆→setMoveIntent、画布拖拽=引擎原生触屏视角、底部抽屉),两壳共用 `lib/useEngine`+loader 核与全部交互组件(specs/mobile-client.md;e2e `mobile.spec.ts` 触屏视口)。

## 编辑 / Adjunct

- 编辑经 `EditSystem`（**palette 放置(add)** / select / move / set / delete / undo）→ `DraftStore`（write-behind 内存缓存 + IndexedDB 持久化，另有 `loadMeta/saveMeta` 世界级元数据通道存背包；启动时 `Engine.hydrateDrafts()` 注水，`ExportService` 提供 JSON 导出/导入）。
- adjunct 按 type-id 注册于 `core/services/AdjunctRegistry.ts`：`a1` wall · `a2` box · `a3` light · `a4` module（3D 模型）· `a5` water · `a6` cone · `a7` ball（sphere）· `b4` stop（隐形碰撞体,**slot 5 三形状**:box AABB / ball 圆柱·圆形足迹绕行 / slope 楔形坡·step-over 通道可走、任意竖直轴 yaw=raw ry,2026-07 恢复旧引擎 ball 语义并新增 slope,`MovementCollider.footprintOverlap/topYAt`）· `b5` item（可拾取物品）· `b6` spp（弦粒子源，展开为标准 adjunct；2026-07-06 由 `particle` 正名）· `b8` trigger（slot 6 可声明**传送锚点** `{name, when?}`——`player.teleport` 的合法目的地，2026-07-04）· `b9` spawner（定时生成器，F1）· `ba` npc（自主 agent，F2；slot 6 `interact`=点击攻击动词、slot 7 `touch`=随体接触伤害，2026-07-04）· `c1` track（tube 轨道，coaster）· `c2` motif（生成式内容）· `e1` link（可点击 URL/QR 面板，点击经 `interact.primary` 由客户端 `window.open`）· `e2` audio（空间音频源）· `e3` video（视频屏幕）· `e4` book（可翻页文字面板，slot 7 `pages`=内联 `string[]` 或 IPFS CID，点击经 `interact.primary` 由客户端 `BookReader` 翻页；对话树的无生命线性孪生，2026-07-05）——共 **19 个内置**。module 经 `render/ResourceManager` + `render/loaders/ModelLoader` 加载外部模型，占位→swap 模式、按 id 去重实例化；骨骼动画由 `RenderEngine.startAnimation/setAnimationState`（idle/walk/run/air 状态机 + crossfade，CharacterController 按速度驱动）驱动。
- **Septopus 动画协议**（`AnimationSystem`）：timeline 步驱动 move/rotate/scale/opacity/color/**texture(UV 滚动)**/**morph(顶点 blendshape)**；非 transform 覆盖（opacity/color/uvOffset/morph）由 `VisualSyncSystem` 经 `RenderEngine.updateObjectAppearance/setTextureOffset/setMorphInfluences` 落到 handle。**几何**：`MeshFactory` 支持 box/sphere/cylinder/cone/plane/grid + **tube**（Catmull-Rom 沿控制点挤出，轨道/管道/导轨）+ **wedge**（楔形坡,slope stop 的视觉孪生,与 `MovementCollider.topYAt` 同一平面方程）。
- **背包/物品**（P0–P2 已落地，规格 `docs/plan/specs/inventory-local-first.md`）：`ItemRegistry`（模板 + seed 确定性推导属性）→ b5 adjunct → `ItemSystem` 原子拾取/丢弃（背包变更 + block raw 重序列化进 draft 同帧完成）；trigger 动作经 `world.actuator`（`IActuator`/`LocalActuator`，可注入）执行，动作面 adjunct/flag/bag/player/sound/system + `delay`/`spawn`/`despawn`（F1）+ `damage`/`projectile`（F3）共 **11 种**（bag·player·damage·projectile 仅 Game 模式），JSONLogic 条件可读 `inventory.*`；player 方法含 setSpawn/enterGame/exitGame/damage/heal/**teleport**（锚点制传送,任意模式,见 `specs/teleport-portal.md`）。
- **模式**：`Engine.setMode`（Normal/Edit/Game/Ghost/**Observe**）；Ghost = noclip 飞行（Space 升/Shift 降）+ 隐藏 avatar；Observe = 冻结玩家、相机绕目标轨道（拖拽旋转、W/S 缩放、恒朝目标），见 `CameraRig.processObserve`（经 CharacterController 委托）+ `RenderEngine.setMainCameraLookAt`。**Game 进入是区域门控**（非自由开关，规格 `docs/systems/game-mode-entry.md`）：block 头部字段 `block.game`（raw[4]）声明"可玩"→ `GameZoneSystem` 每帧派生 `world.gameZoneActive` + 发 `game.zone_enter/exit` → `World.setMode(Game)` 守卫（非 zone 拒绝，`force` 仅引擎/测试绕过）；进入需显式动作（客户端 `enter-game` 确认按钮 / 数据驱动 `player.enterGame` actuator 动作），离开 zone 自动退回 Normal（载客的 `CoasterSystem` 经 `world.rideActive` 冻结 zone 追踪，轨道跨块不甩出）；客户端切换器**不含自由 GAME 按钮**，`mode`/`gameZoneActive` 镜像引擎事件（引擎为真相源）。**会话持久化**：`globalFlags` + oneTime 消耗（`sessionTriggerFired`）随 DraftStore meta 进 IndexedDB，`hydrateDrafts` 还原（背包 + **玩家位置** `'player'` 同通道；位置由 `CharacterController.processPersistence` 节流写、仅 Normal/Game）。
- **原生在场游戏（Pattern B）**：`PoolSystem`/`MahjongSystem`/`ShootingRangeSystem`/`TumbleSystem`——System 持逻辑、棋子即 adjunct 实体、点击经 `interact.primary` 触发动作（规格 `docs/plan/specs/native-in-world-games.md`，记忆 `native-in-world-game-pattern.md`）。**生命周期区域门控**（复用上条 Game 契约）：块标 `block.game=1`（纯可玩标记，非外部 app id 42/43），`configure` 只**登记(arm)**，每帧 `syncSession` 按「`mode===Game` 且本块＝`world.activeGameBlock`」spawn/teardown——**走出 block（1 格）即自动退回 Normal 拆局**（比 5×5 块驱逐更早，根除悬空实体），armed config 跨驱逐保留→重入即新局（街机柜模型，无中途存档）。**进入＝trigger 承载（已实现 `b601422`）**：游戏富声明在 **game trigger**（`b8`+`enterGame` 带 `exitPolicy`；**尚不带 `gameId`/`origin` 路由**，「一块多台＝一排扭蛋机」待 gameId 落地），`block.game=1` 是粗粒度"此处可玩"门控位；退出按 per-game **`exitPolicy` 三档**（`ephemeral` 走出即拆 ✅ / `confirm` 弹框确认 ✅ 全链路已接 LeaveGameDialog / `persistent` 存档重入 🔲 暂按 ephemeral 兜底），**不新增第二个 SystemMode**（`mode===Game` 仍是唯一玩法门）。**Tumble（叠叠乐）= 第 4 个 B 案例、首个真实刚体物理**：引入 `@dimforge/rapier3d-compat`（headless WASM，落在 `core/`，引擎首个 Three.js 之外的运行时依赖）；`TumbleSystem` 跑**每局独立的 scoped rapier world**（仅本塔 ~45 块 + 静态地面，进入建/退出 `.free()`，玩家与其余实体**不**变刚体），在 engine/Three 空间模拟（重力 −Y），逐帧把 body 位姿写回 `TransformComponent`——位置直写、四元数→Euler-XYZ（`quatToEulerXYZ`，core 内手算匹配 `THREE.Euler`）驱动**旋转**（pool 只同步位置，倒塌必须同步旋转）。坑：rapier 睡眠体在抽块后须 `wakeUp()`、`setEntityColor` 要等 mesh 出现后再上色（延迟 `pendingColor` 排空）。**运行时改色**经 `core/utils/Appearance.ts setEntityColor`（写 `MeshComponent.colorOverride`→`VisualSyncSystem`→`RenderEngine.updateObjectAppearance` clone-on-write 隔离材质，不染共享材质邻居）。**三种托管模式**：A 外部 app（GameRuntime+HUD，逻辑可服务端跑，id 42/43）·B 原生 System（本条）·C 纯数据驱动（authored 块数据 + 通用 Trigger/Actuator/Flag/Health，零专用代码，**跑酷/coaster = `AuthoredLevel` JSON** 于 `client/core/src/levels/*.level.json`，引擎只留词汇 `core/services/AuthoredLevel.ts`；旧 `core/levels/*.ts` 生成器已退役删除）；选型口诀**先 C 不行再 B、需服务端权威才 A**。
- **相机摔落手感**：硬着陆按落差触发相机抖屏 + 下沉（`_camShake` 衰减包络，仅叠加到相机、不污染玩家 transform）——旧引擎 `camera/fall` 的现代化（旧 `linger` 为衰减回位）。
- **昼夜与天气闪电**：动态日光已恢复（2026-07-03，`EnvironmentSystem.DAYLIGHT`：晨昏带 smoothstep 渐变替代 isDay 二值跳变 + 视觉太阳角/强度按 chase 速率追赶时钟跳变——链历法跳变滑行不弹跳；**阴影仍关**，待 shadow bias 调参，见 RenderEngine 注释）；雷雨（rain + grade≥1）按 grade 缩放的确定性定时器触发全场闪光（环境光/太阳强度尖峰，`updateLightning`）。
- **出生防卡死**：出生/传送/重生落入固体内时 `MovementCollider.popOutIfEmbedded` 深嵌救援自动弹上固体顶面（rising-edge 告警一次；行走子步 ≤0.08m < 0.1 触发余量，正常移动永不误触）。
- **玩法回路**：`HealthSystem`（player:damage/heal/fell → died/respawned，重生回出生点）+ 客户端 HP 条；**音频** `RenderEngine.playSpatialSound`（PositionalAudio，按 URL 去重缓冲）+ `ResourceManager.getAudioUrl`；**Block LOD** `BlockLODSystem`（`world.performance.lodNear`，远块隐藏 adjunct 网格、仿真照常）；阴影：单太阳光 shadowMap，视锥逐帧锚定玩家。
- **事件队列**（PR-1..3 已落地，`core/events/`）：`world.events` 帧作用域双缓冲队列（emit 不跑回调、系统拉 reader、边界回调仅在 step 尾 flushBoundary 按 (frame,seq) 全序派发、EntityId+稳定键双键定向）。已迁通道：interact.* / item.* / inventory.* / block.need / block.loaded（每块一次，boot gate 按 `blk:x_y` 定向）/ player.state / system.mode / edit.*；旧总线仅余 `player:*` 生命周期与 `audio:played`（待 PR-4/5）。Engine 门面双总线订阅 + LEGACY_EVENT_MAP 别名（dev 告警一次）。
- **编辑器创作闭环**：Edit 模式左侧 palette（**16 类直接可放置**，`core/edit/AdjunctDefaults.ts` 给默认 raw；**module 按 `world.moduleCatalog` 每模型一钮**——demo 3 模型共 19 钮；track 不入 palette，coaster 走关卡 JSON；按钮超过视口高度自动换列），点击表面放置（`EditTask 'add'` → `spawnAdjunct` 复用），undo=删除。**移动平台跟随**：玩家脚下支撑 solid 的帧位移传递（骑乘 moveZ 升降）；solid 缓存每帧原地刷新位置（修复触发器移动后碰撞箱滞留旧位姿）。
- **弦粒子 SPP**（**完整协议已落地 2026-07-06，A–E 五工作流**，规格 `docs/plan/specs/spp-protocol-full.md`；早期 M1+M2 见 `spp-integration.md`）：b6 raw `[origin, cells, theme]`（开发期明文）→ `core/spp/Expander.ts` **纯递归**展开 → BlockSystem 产出**独立标准 adjunct 实体**（碰撞/触发器/LOD 原生）；derived 带 `derivedFrom`，`BlockSerializer` 只留 b6 源行。**能力**：① cell 面既可 resolved `faces` 也可 `faceOptions`(叠加态)→ 引擎 mulberry32 确定性**坍缩**(seed=块+cell+面)；② `refinement` **递归细化**(子继承父面/内部默认 Open/细者拥有跨层平面消双墙/LOD `maxLevel`·`budget` 门控)；③ theme = **StylePack**(数据化、可 CID/URL、内置 basic/brick/garden + `world.styleOverride` 秒换风格，`Engine.registerStylePack/setStyleOverride`，客户端 SPP 沙盘带风格切换器)；④ **L2 二进制** `CollapseCodec.encodePayload`(raw+RLE) + `core/spp/SppL2.ts` 桥(已坍缩 chunk ↔ L2)。`ParticleCell`/`ParticleFace` 是协议正确名(弦粒子=单胞元);v1 不支持 cell rotation、L2 不含 superposition/refinement(按定义即已坍缩)。
- 动态/链上加载的 adjunct 代码经 `AdjunctSandbox`（Web Worker 沙箱 + 静态 `validateCode` 过滤）+ `AdjunctLoader`（已迁 TS，**暂未接入运行时**，随链相关功能启用）。

## 测试

- **CI**：`.github/workflows/ci.yml`——push/PR 跑 引擎单测+tsc+Three.js 层级边界+client 构建；全量 e2e 每日定时（cron）+ 手动 dispatch（约 1.5h，失败上传 Playwright 报告）。
- `engine/tests/`（vitest，node 环境）：`unit/`（CollapseCodec、Coords、adjunct transforms/sandbox/registry/resource-manager）、`integration/`（headless-boot）、`systems/`·`scenarios/`（部分 `todo`）。**务必读 `engine/tests/README.md` 的"局限性"**（无 GPU/浏览器、确定性、scenarios 待补等）。
- 真 WebGL / 像素 / 输入（L4）用 Playwright，在 `client/desktop/e2e/`（已搭 **~37 个 spec**：boot/movement/fall-through/trigger/avatar/persistence/inventory/engine-features/editor-platform/spp/coaster/map2d/game-trigger/ai-authoring/rpg-xianjian/portal-travel 等；`npm run test:e2e`，SwiftShader 软渲染 + `engine.step(dt)` 确定性驱动）。

## 文档索引

> **三层文档模型(2026-07-04 定形)**:`protocol/`(**规范**,cn/en 双语,协议 v0.1 随引擎版本——核心是 `adjunct-types.md` 18 型逐槽位规范 + `determinism.md` PRNG/钉点/一致性验收 + trigger 动作词汇 + world §5 坐标旋转契约 + block §3 raw 五元组;规范变更须双语同步)→ `docs/`(**参考实现**)→ `docs/plan/`(**过程**,非规范)。旧引擎时代文档已归档 `docs/legacy/`(含旧 changelog、旧 VBW 入门);`guides/getting-started.md` 已重写对准现行 Engine API。

- `docs/plan/STANDALONE_ENGINE_ROADMAP.md` — 开发路线图（链剥离记录 + 旧引擎退役 + 后续 P1–P5）。
- `docs/plan/PLAYABLE_CHECKLIST.md` — **可玩化落地清单**（从技术 demo 到用户可玩的 gap 追踪 + 首迭代；内容/产品视角）。
- `docs/plan/GAME_SYSTEMS_BACKLOG.md` — **游戏引擎系统缺口清单**（引擎原语视角：F1 调度/生成 · F2 NPC/AI · F3 战斗 · F4 对话任务；逐个处理。联网=外部已定，game-mode 已定）。**F 系列统一设计模式已预决策（2026-07-02，见该文档同名节）**：authored 源(adjunct)→运行时派生实体 · 定义(模板/文档)→实例(不持久化) · 条件=JSONLogic/效果=actuator · 定时=仿真时间/门控=世界时间进条件。F1 定时器跑 dt 累积（链高度历法只作条件源）；F2 NPC=spawner adjunct+运行时活体；F3 定义数据化+实例世界空间跨块（静态伤害体积现有 trigger 已可做）；F4 对话树=纯数据文档（走树状态机，零新执行原语，锚点=可交互物能力非独立 adjunct）。
- `docs/plan/specs/combat-damage.md` + `dialogue-quests.md` — **F3 战斗 / F4 对话 v1(已实现 2026-07-02)+ v1.1(2026-07-04)**:F3 = `damage`/`projectile` actuator 动作(仅 Game 模式)+ ba 行 hp 槽 + NPC 死亡(onDeath 动作=掉落 spawn b5;authored 死体隐藏保留防 draft 丢行,派生真 despawn)+ `ProjectileSystem`(直线/球测/TTL)+ **玩家攻击动词**(ba slot 6 `interact`={when?/cooldown?/actions},点击无对话 agent 经 actuator 执行;`damage` 新增 target `'self'`)+ **随体接触伤害**(ba slot 7 `touch`={damage/interval/radius},NPCSystem 按 distToPlayer 打点,follow 追上就咬);F4 = ba 行 dialogue 槽(nodes/options/JSONLogic when/actuator actions/to)+ `DialogueSystem` 走树(interact 启动、单例、NPC 对话定身)+ `Engine.dialogueState/chooseDialogue/endDialogue`+ **客户端对话 UI**(`DialogueUI.tsx` 纯视图镜像 dialogue.* 事件);任务=flags 配方(有意不加原语)。**首个完整 RPG 实证:仙剑微缩「灵草记」**(`client/core/src/levels/xianjian.level.json` 纯数据关卡:村庄对话接任务→slope 云梯上山→trigger 进 Game 战妖狼→掉落采药→回村交任务→spawn 奖励,零任务代码;headless `xianjian-quest.test.ts` + e2e `rpg-xianjian.spec.ts` 全程通关+重载存续)。
- `docs/plan/specs/npc-agents.md` — **F2 NPC/自主 agent v1(已实现 2026-07-02)**:ba NPC adjunct(pos/visual/behavior/seed)+ 行为=数据状态机(move 原语 stay/wander/follow/flee/return + JSONLogic 转移 npc.* 上下文 + enter 动作走 actuator)+ 确定性 wander(mulberry32 uniform-disk 协议公式)+ authored 行=home 锚点(游走不入 draft);寻路/避障/视线=v2。
- `docs/plan/specs/scheduler-and-spawn.md` — **F1 调度/定时/生成(已实现 2026-07-02)**:actuator 三动作(delay 嵌套 / spawn inline 模板 / despawn)+ b9 spawner adjunct + 生成物复用 `derivedFrom` + 定时器跑仿真时间、不持久化 + `ScheduleSystem`(LiveSystem 后)。
- `docs/plan/specs/phase0-engine-consolidation.md` — 引擎收敛规格。
- `docs/plan/specs/coaster-via-spp.md` — **用 SPP 搭过山车**（**已实现 2026-06**：`adjunct_track`(c1) + `core/spp/CoasterTheme.ts` 连通→theme 几何 + `CoasterSystem` 沿轨运动；关卡 `client/core/src/levels/coaster.level.json` + e2e `coaster.spec.ts`）。
- `docs/plan/specs/spp-recursive-refinement.md` — **SPP 递归细化 + 面继承 + motif 叶子填充（设计,未实现 2026-07-05）**：把内容生成分层——**SPP 分空间**（粗 4m cell 布局 + 面 open/close = 区域接口，子 cell 2/1m 按隐式父包含 `⌊pos/2⌋` **继承父面**作边界、细者拥有共享平面消跨层双墙）+ **motif 拼物件**（叶子 cell `fill:{template}` 填内部内容，seed 钉死）；**AI 只在"粗 cell + 接口拓扑 + 语义 fill + 逻辑放置"低维语义层作业**（裸逐面 cell 是 LLM 高门槛，几何一致性下沉给继承规则/模版）；**LOD 门控展开深度**（maxLevel/预算不入 CID、同源同 CID）。补齐 `Expander.ts` 现缺的父子/跨层/递归/LOD；确定性钉点见文 §7，稳定后抽进 protocol/。路线 R1–R4（父子继承→LOD 预算→叶子填充→AI 分层 e2e）。
- `docs/plan/specs/ai-authoring.md` — **AI 造物**（自然语言→生成文档→预览→建造）**v1 已实现（2026-07-03，千问实证：村庄+五层楼两任务全绿）**：`GenerationDoc.ts` 契约两端同源校验 → 生成器目录=**motif 模板**（house/road/building，c2 行展开预算豁免，building 内置可走 L 型楼梯、headless 爬楼实测）→ `services/ai-gateway/`（mock/qwen provider，校验回炉）→ 客户端 `AuthorChat.tsx`+loader aiPreview/aiBuild（预览不入 draft，建造走 draftStore）；e2e `ai-authoring.spec.ts` mock 进 CI、导出 PROVIDER=qwen 真打;LLM 零代码输出、与人写内容同安检链。
- `docs/plan/specs/2d-map.md` — **2D 世界地图**（**v1 已实现 2026-06**：`WorldMap2D.tsx` + `DesktopLoader.fetchMapCell` 视口窗口化按需流式、复用块数据通道、非全局索引 + e2e `map2d.spec.ts`；逐块顶面俯视投影参考旧引擎 `control_2d.js`+`render_2d.js`）。
- `docs/plan/specs/teleport-portal.md` — **传送/传送门(spec+v1 同日实现 2026-07-04)**:传送门=配方非新 adjunct(b8 'in' trigger+`player.teleport` 动作+任意视觉);**动作只认锚点不认裸坐标**(b8 slot 6 `{name, when?}`,无锚点的块机制上不可达);双侧许可=出发侧 trigger conditions+到达侧 anchor.when(JSONLogic);目的块未加载走 `dataSource.view` 按需取 raw,落地复用流式跟随/悬停/popOut 三重安全网;2D 地图锚点标记+点击快速旅行走**同一动作通道**(已流式 cell 才显示=天然"已发现");事件 `teleport.done/denied`;定位=游戏性装置非安全装置(local-first 不设防,服务器时代同一份数据复用为权威校验);测试 `portal-teleport.test.ts`(5)+e2e `portal-travel.spec.ts`。**演示中枢 `?level=world`(2026-07-05)**:`scenes/worldHubScene.ts` 程序化组合 hub[2026,705]+demo[2048,2048]+迁址 xianjian[2030,705] 于**一个数据源**,西/东门 walk-in 传送门串联,证明"传送=同世界内机制"(跨块经 view 解析);不动默认 `/` 与 `?level=xianjian`;e2e `world-hub.spec.ts`。
- `protocol/cn|en/avatar-animation.md` — **虚拟化身动画协议**（形象/动作/状态三层分离；规范基准 VRM 1.0 humanoid 骨架 + VRMA）。**v1 状态契约已落地（2026-07）**：状态集 idle/walk/run/air + 阈值派生（IDLE_MAX 0.5 / WALK_MAX=walk×1.2）+ 剪辑名相等契约 + 回退链进引擎，正则启发式降级为不合规素材兜底；**多 avatar 可选 + 运行时换装已落地（2026-07-04）**：`Engine.setAvatar`/`EntityFactory.swapAvatar`（复用加载路径、旧模型释放引用、重算 scale-to-1.8/footOffset、重启状态机）+ 客户端 `AvatarPicker.tsx`（DraftStore meta 持久化）+ demo 目录 soldier(33,名称相等契约)/robot(34,正则回退)两套素材；e2e `avatar-select.spec.ts` 验两套动作契约+身体参数(height≈1.8/footOffset)+重载持久；`Engine.avatarInfo()` 调试面（clips/state/activeClip/height/footOffset）。**形象/动作分离（v2 重定向）与 VRM 原生（v3）未做**（动作仍绑死在各 avatar GLB）。
- `protocol/cn|en/item.md` — **物品协议（规范级）**：实例=`{templateId, seed}`，mulberry32 PRNG + 稀有度 roll + 属性抽取顺序逐位钉死（跨引擎同 seed 同物品）；模板=世界内容（引擎零内置，demo 目录 `core/mocks/ItemTemplates.ts`）。天气/时间确定性派生同理规范于 `protocol/cn|en/world.md §3.1`（hash 切片语义）。
- `protocol/cn|en/game.md §9` — **游戏会话与验证协议**：会话=「(seed, 操作序列) 源 + 确定性重放」（局面/结果不持久化）；成就真实性=**服务器签名收据**（裸 hash 只证完整性；防伪须签名 + 服务器权威计数；local-first 单机不设防，跨信任边界才验证）；棋牌发牌=seed 推导 + commit-reveal（不存快照），隐藏信息 ⇒ Pattern A。缺口（YAGNI，有服务器需求再落）：Pattern B 局终上报 seam、收据字段约定。
- `deploy/RELEASE.md` — **发版指南(2026-07-04)**:全仓一个 SemVer(client+engine package.json 与 tag 锁步,workflow 有守卫)、打 `vX.Y.Z` tag 即自动发版(`.github/workflows/release.yml`:校验→构建→GitHub Release,说明截取 `CHANGELOG.md` 对应段、附 PWA dist zip + version.json)**并同 tag 自动部署 GitHub Pages**(`deploy-pages.yml`,`https://septopus-rex.github.io/world/`,`VITE_BASE=/world/` 子路径构建;一次性设置 Settings→Pages→Source=GitHub Actions);功能追踪三层=conventional commits → CHANGELOG(链接 specs)→ 运行时版本注入(HUD 角标/meta/version.json);**运行时资源路径须经 `BASE_URL` 前缀**(demoScene `asset()` 先例),写死 `/assets/...` 会在子路径部署下 404。
- `docs/architecture/{overview,ecs,coordinate,pipeline,performance}.md`、`docs/systems/*.md`、`docs/features/spp*.md`（弦粒子 SPP）。

## 开发注意事项

- 引擎是 **TypeScript ECS**（`engine/src`）——**唯一开发基准**。旧 JS 引擎（VBW、`Septo.launch`、`world.js`、`framework.js`）**已于 2026-06 正式退役**（parity 补齐后，详见文件顶部说明）：归档在 `engine/backup/`，**只作历史/特性参考（触屏·移动端·2D 地图页·多链 API 的源码对照），永不作为基准、不在其上继续开发；勿删归档**。后续一切引擎开发只改 `engine/src`。
- 链已解耦：`engine` 与 `client/desktop` 均无 `@solana` 依赖。合约在 `chain/`（本地存档，Solana Devnet：`4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2`）。
- 包管理器分包：**engine 用 yarn，client/desktop 用 npm**。
- 引擎运行时依赖：除 Three.js 外，新增 `@dimforge/rapier3d-compat`（Tumble 刚体物理，headless WASM）——属 `core/` 可用的纯数学库，**不**破"Three.js 只在 render"边界；客户端经 `@engine` 源码别名间接解析，无需在 client 单独安装。
- 仿真循环：`World` 构造不自动启动；生产端调 `Engine.start()`（rAF），测试用 `Engine.step(dt)` 确定性步进。
- **内容=数据纪律（2026-07-08，P2 定形，规矩见 `client/core/src/scenes/README.md`）**：**世界内容禁止写成 TS**——关卡=`src/levels/*.level.json`、单块=`src/blocks/*.block.json`、风格包=`src/stylepacks/*.stylepack.json`；原生游戏配置在块数据的 b8 game trigger（`enterGame params[0].game={kind,…}`→`game.declare`→System 自臂，loader 无 setupX 镜像）；同块引用用块相对 id `adj_~_~_…`；种子写死的生成器跑一次**冻结成 JSON** 后删除（demo/maze/hub/各游戏家具先例）。`scenes/` 只剩常量清单/组合胶水/工具与代码即行为。动机：块数据须可上链、可被第二引擎（`reference/` Rust 差分裁判）干净房间复现（`docs/plan/specs/full-data-migration.md` + `bevy-reference-engine.md`）。
- **提交策略：仅在用户明确要求时提交 git，不主动提交。**

## 层级边界（严格执行）

**Three.js 只允许在 `engine/src/render/` 内 import。** `core/`、`plugins/adjunct/` 均不得直接 import Three.js。

| 层 | 可以用 Three.js？ | 说明 |
|---|---|---|
| `engine/src/render/` | ✅ 合法 | 渲染层的唯一职责 |
| `engine/src/core/` | ❌ 禁止 | 通过 `renderEngine.*` 方法间接操作 |
| `engine/src/plugins/adjunct/` | ❌ 禁止 | 用 `MeshFactory.create()` / `RenderHandle`（`any`） |

**验证命令**：`grep -r "from 'three'" engine/src/core engine/src/plugins` 应无输出。
