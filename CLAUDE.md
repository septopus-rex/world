# Septopus World

独立 3D 虚拟世界引擎（TypeScript ECS）+ 无链 PWA 客户端。链已完全解耦——`engine/src` 与 `client/desktop` 零 `@solana` 依赖；链作为可选发布插件存在，默认不装。

> 链剥离已完成（2026-06，审计确认），详见 `docs/plan/STANDALONE_ENGINE_ROADMAP.md`。
> `chain/`（Solana 合约）与旧 `app/`（链耦合前端）已移出 git 追踪、封存在磁盘；旧 JS 引擎已归档到 `engine/backup/`。
> **旧引擎 parity 已补齐（2026-06）：可退役。** 新引擎覆盖或超越旧 JS 引擎全部能力；旧引擎中 tube 几何 / texture·morph 动画 / lightning / linger 实为空壳 stub，已在新引擎真正实现。**有意不移植**（非缺失）：多链 API（已解耦）、触屏/移动端输入（超出桌面 PWA 声明范围）、card/news/manual 信息页（属 React 客户端层）。**完整 2D 地图页**原列"有意不移植"，**现已解除**（3D 迁移确认成功后重新纳入计划，视口窗口化流式、复用块数据通道，非全局索引；设计规格见 `docs/plan/specs/2d-map.md`，参考旧引擎 `control_2d.js`+`render_2d.js`）。

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
│   │   │   ├── protocol/            # CollapseCodec（SPP 二进制编解码）
│   │   │   ├── factories/ utils/(Coords) types/
│   │   ├── render/              # Three.js 渲染层（唯一允许 import Three.js 的位置）
│   │   │   ├── RenderEngine.ts      # 渲染引擎抽象 + 骨骼动画管理
│   │   │   ├── ResourceManager.ts   # 模型/纹理加载（load-once + instance-many）
│   │   │   ├── MeshFactory.ts       # 几何体 + 材质工厂（带缓存）
│   │   │   ├── RenderPipeline.ts    # 渲染管线
│   │   │   └── loaders/             # ModelLoader（GLTF/FBX/OBJ/DAE）
│   │   └── plugins/adjunct/     # adjunct 定义（box/wall/cone/sphere/water/light/trigger/module）
│   ├── tests/               # vitest：unit / systems / integration / scenarios（见 tests/README.md）
│   └── backup/              # 旧 JS 引擎（septopus/，已归档；gitignore）
├── client/desktop/          # React + Vite PWA — 无链 3D 客户端
├── deploy/                  # dev.sh / build.sh：启动/构建 client/desktop
├── docs/                    # 架构与计划文档
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
- **数据流**：`IDataSource`（本地 mock/草稿，可换链）→ Raw → STD（`CollapseCodec`）→ RenderData → Three.js。
- **坐标系**：Septopus（X东 Y北 Z上）↔ Engine/Three（X右 Y上 Z前，北 = −Z）；转换见 `core/utils/Coords.ts`。
- **链可选**：通过 `IChainPublisher` 注入发布；纯模式零 `@solana` 依赖。

## 关键入口

- `engine/src/Engine.ts` — 引擎外观；`bootWorld()`、`start()`（rAF 循环）、`step(dt)`（确定性逐帧）、`injectBlock()`、`setEditMode()`。渲染器可经 `services.renderer` 注入（测试用 NullRenderEngine）。
- `engine/src/core/World.ts` — ECS 世界、系统编排、主循环。
- `client/desktop/src/lib/DesktopLoader.ts` — 客户端数据装载器（实现 `IDataSource`，目前喂本地 mock）。
- `client/desktop/src/App.tsx` — React 前端入口。

## 编辑 / Adjunct

- 编辑经 `EditSystem`（**palette 放置(add)** / select / move / set / delete / undo）→ `DraftStore`（write-behind 内存缓存 + IndexedDB 持久化，另有 `loadMeta/saveMeta` 世界级元数据通道存背包；启动时 `Engine.hydrateDrafts()` 注水，`ExportService` 提供 JSON 导出/导入）。
- adjunct 按 type-id 注册于 `core/services/AdjunctRegistry.ts`：`a1` wall · `a2` box · `a3` light · `a4` module（3D 模型）· `a5` water · `a6` cone · `a7` ball（sphere）· `b4` stop · `b5` item（可拾取物品）· `b6` particle（弦粒子，展开为标准 adjunct）· `b8` trigger · `e1` link（可点击 URL/QR 面板，点击经 `interact.primary` 由客户端 `window.open`）。module 经 `render/ResourceManager` + `render/loaders/ModelLoader` 加载外部模型，占位→swap 模式、按 id 去重实例化；骨骼动画由 `RenderEngine.startAnimation/setAnimationState`（idle/walk/run/air 状态机 + crossfade，CharacterController 按速度驱动）驱动。
- **SPP 动画协议**（`AnimationSystem`）：timeline 步驱动 move/rotate/scale/opacity/color/**texture(UV 滚动)**/**morph(顶点 blendshape)**；非 transform 覆盖（opacity/color/uvOffset/morph）由 `VisualSyncSystem` 经 `RenderEngine.updateObjectAppearance/setTextureOffset/setMorphInfluences` 落到 handle。**几何**：`MeshFactory` 支持 box/sphere/cylinder/cone/plane/grid + **tube**（Catmull-Rom 沿控制点挤出，轨道/管道/导轨）。
- **背包/物品**（P0–P2 已落地，规格 `docs/plan/specs/inventory-local-first.md`）：`ItemRegistry`（模板 + seed 确定性推导属性）→ b5 adjunct → `ItemSystem` 原子拾取/丢弃（背包变更 + block raw 重序列化进 draft 同帧完成）；trigger 动作经 `world.actuator`（`IActuator`/`LocalActuator`，可注入）执行，动作面 adjunct/flag/bag/player/sound/system（bag·player 仅 Game 模式），JSONLogic 条件可读 `inventory.*`。
- **模式**：`Engine.setMode`（Normal/Edit/Game/Ghost/**Observe**）；Ghost = noclip 飞行（Space 升/Shift 降）+ 隐藏 avatar；Observe = 冻结玩家、相机绕目标轨道（拖拽旋转、W/S 缩放、恒朝目标），见 `CharacterController.processObserve` + `RenderEngine.setMainCameraLookAt`。**Game 进入是区域门控**（非自由开关，规格 `docs/systems/game-mode-entry.md`）：block 头部字段 `block.game`（raw[4]）声明"可玩"→ `GameZoneSystem` 每帧派生 `world.gameZoneActive` + 发 `game.zone_enter/exit` → `World.setMode(Game)` 守卫（非 zone 拒绝，`force` 仅引擎/测试绕过）；进入需显式动作（客户端 `enter-game` 确认按钮 / 数据驱动 `player.enterGame` actuator 动作），离开 zone 自动退回 Normal（载客的 `CoasterSystem` 经 `world.rideActive` 冻结 zone 追踪，轨道跨块不甩出）；客户端切换器**不含自由 GAME 按钮**，`mode`/`gameZoneActive` 镜像引擎事件（引擎为真相源）。**会话持久化**：`globalFlags` + oneTime 消耗（`sessionTriggerFired`）随 DraftStore meta 进 IndexedDB，`hydrateDrafts` 还原（背包 + **玩家位置** `'player'` 同通道；位置由 `CharacterController.processPersistence` 节流写、仅 Normal/Game）。
- **原生在场游戏（Pattern B）**：`PoolSystem`/`MahjongSystem`/`ShootingRangeSystem`/`TumbleSystem`——System 持逻辑、棋子即 adjunct 实体、点击经 `interact.primary` 触发动作（规格 `docs/plan/specs/native-in-world-games.md`，记忆 `native-in-world-game-pattern.md`）。**生命周期区域门控**（复用上条 Game 契约）：块标 `block.game=1`（纯可玩标记，非外部 app id 42/43），`configure` 只**登记(arm)**，每帧 `syncSession` 按「`mode===Game` 且本块＝`world.activeGameBlock`」spawn/teardown——**走出 block（1 格）即自动退回 Normal 拆局**（比 5×5 块驱逐更早，根除悬空实体），armed config 跨驱逐保留→重入即新局（街机柜模型，无中途存档）。**进入＝trigger 承载（已实现 `b601422`）**：游戏富声明在 **game trigger**（`b8`+`enterGame` 带 `exitPolicy`，一块可多台＝一排扭蛋机），`block.game=1` 是粗粒度"此处可玩"门控位；退出按 per-game **`exitPolicy` 三档**（`ephemeral` 走出即拆 / `confirm` 弹框确认 / `persistent` 存档重入），**不新增第二个 SystemMode**（`mode===Game` 仍是唯一玩法门）。**Tumble（叠叠乐）= 第 4 个 B 案例、首个真实刚体物理**：引入 `@dimforge/rapier3d-compat`（headless WASM，落在 `core/`，引擎首个 Three.js 之外的运行时依赖）；`TumbleSystem` 跑**每局独立的 scoped rapier world**（仅本塔 ~45 块 + 静态地面，进入建/退出 `.free()`，玩家与其余实体**不**变刚体），在 engine/Three 空间模拟（重力 −Y），逐帧把 body 位姿写回 `TransformComponent`——位置直写、四元数→Euler-XYZ（`quatToEulerXYZ`，core 内手算匹配 `THREE.Euler`）驱动**旋转**（pool 只同步位置，倒塌必须同步旋转）。坑：rapier 睡眠体在抽块后须 `wakeUp()`、`setEntityColor` 要等 mesh 出现后再上色（延迟 `pendingColor` 排空）。**运行时改色**经 `core/utils/Appearance.ts setEntityColor`（写 `MeshComponent.colorOverride`→`VisualSyncSystem`→`RenderEngine.updateObjectAppearance` clone-on-write 隔离材质，不染共享材质邻居）。**三种托管模式**：A 外部 app（GameRuntime+HUD，逻辑可服务端跑，id 42/43）·B 原生 System（本条）·C 纯数据驱动（authored 块数据 + 通用 Trigger/Actuator/Flag/Health，零专用代码，**跑酷/coaster = `AuthoredLevel` JSON** 于 `client/desktop/src/levels/*.level.json`，引擎只留词汇 `core/services/AuthoredLevel.ts`；旧 `core/levels/*.ts` 生成器已退役删除）；选型口诀**先 C 不行再 B、需服务端权威才 A**。
- **相机摔落手感**：硬着陆按落差触发相机抖屏 + 下沉（`_camShake` 衰减包络，仅叠加到相机、不污染玩家 transform）——旧引擎 `camera/fall` 的现代化（旧 `linger` 为衰减回位）。
- **天气闪电**：雷雨（rain + grade≥1）按 grade 缩放的确定性定时器触发全场闪光（环境光/太阳强度尖峰，`EnvironmentSystem.updateLightning`）。
- **玩法回路**：`HealthSystem`（player:damage/heal/fell → died/respawned，重生回出生点）+ 客户端 HP 条；**音频** `RenderEngine.playSpatialSound`（PositionalAudio，按 URL 去重缓冲）+ `ResourceManager.getAudioUrl`；**Block LOD** `BlockLODSystem`（`world.performance.lodNear`，远块隐藏 adjunct 网格、仿真照常）；阴影：单太阳光 shadowMap，视锥逐帧锚定玩家。
- **事件队列**（PR-1..3 已落地，`core/events/`）：`world.events` 帧作用域双缓冲队列（emit 不跑回调、系统拉 reader、边界回调仅在 step 尾 flushBoundary 按 (frame,seq) 全序派发、EntityId+稳定键双键定向）。已迁通道：interact.* / item.* / inventory.* / block.need / block.loaded（每块一次，boot gate 按 `blk:x_y` 定向）/ player.state / system.mode / edit.*；旧总线仅余 `player:*` 生命周期与 `audio:played`（待 PR-4/5）。Engine 门面双总线订阅 + LEGACY_EVENT_MAP 别名（dev 告警一次）。
- **编辑器创作闭环**：Edit 模式左上 palette（9 类可放置，`core/edit/AdjunctDefaults.ts` 给默认 raw），点击表面放置（`EditTask 'add'` → `spawnAdjunct` 复用），undo=删除；module 需资源选择器暂不在列。**移动平台跟随**：玩家脚下支撑 solid 的帧位移传递（骑乘 moveZ 升降）；solid 缓存每帧原地刷新位置（修复触发器移动后碰撞箱滞留旧位姿）。
- **弦粒子 SPP**（M1+M2 已落地，规格 `docs/plan/specs/spp-integration.md`）：b6 raw `[origin, cells, theme]`（开发期明文）→ `core/spp/Expander.ts` 纯函数展开（basic 主题 solid/doorway/window、相邻消除、CellTrigger→b8）→ BlockSystem 产出**独立标准 adjunct 实体**（碰撞/触发器/LOD 原生）；derived 实体带 `derivedFrom`，`BlockSerializer` 只保留 b6 源行。CollapseCodec（L2 二进制）随 M3 接入。v1 不支持 cell rotation。
- 动态/链上加载的 adjunct 代码经 `AdjunctSandbox`（Web Worker 沙箱 + 静态 `validateCode` 过滤）+ `AdjunctLoader`（已迁 TS，**暂未接入运行时**，随链相关功能启用）。

## 测试

- `engine/tests/`（vitest，node 环境）：`unit/`（CollapseCodec、Coords、adjunct transforms/sandbox/registry/resource-manager）、`integration/`（headless-boot）、`systems/`·`scenarios/`（部分 `todo`）。**务必读 `engine/tests/README.md` 的"局限性"**（无 GPU/浏览器、确定性、scenarios 待补等）。
- 真 WebGL / 像素 / 输入（L4）用 Playwright，在 `client/desktop/e2e/`（已搭：boot/movement/fall-through/trigger/avatar/persistence/inventory/engine-features/editor-platform/spp；`npm run test:e2e`，SwiftShader 软渲染 + `engine.step(dt)` 确定性驱动）。

## 文档索引

- `docs/plan/STANDALONE_ENGINE_ROADMAP.md` — 开发路线图（链剥离记录 + 旧引擎退役 + 后续 P1–P5）。
- `docs/plan/PLAYABLE_CHECKLIST.md` — **可玩化落地清单**（从技术 demo 到用户可玩的 gap 追踪 + 首迭代；内容/产品视角）。
- `docs/plan/GAME_SYSTEMS_BACKLOG.md` — **游戏引擎系统缺口清单**（引擎原语视角：F1 调度/生成 · F2 NPC/AI · F3 战斗 · F4 对话任务；逐个处理。联网=外部已定，game-mode 已定）。
- `docs/plan/specs/phase0-engine-consolidation.md` — 引擎收敛规格。
- `docs/plan/specs/coaster-via-spp.md` — **用 SPP 搭过山车**设计稿（连通→theme 几何 + CoasterSystem 运动；未落地）。
- `docs/plan/specs/2d-map.md` — **2D 世界地图**设计规格（解除"有意不移植"；视口窗口化按需流式、复用 `block.need` 块通道、非全局索引；参考旧引擎 `control_2d.js`+`render_2d.js` 的逐块顶面俯视投影；**规划中**）。
- `protocol/cn|en/avatar-animation.md` — **虚拟化身动画协议**（形象/动作/状态三层分离；规范基准 VRM 1.0 humanoid 骨架 + VRMA）。**v1 状态契约已落地（2026-07）**：状态集 idle/walk/run/air + 阈值派生（IDLE_MAX 0.5 / WALK_MAX=walk×1.2）+ 剪辑名相等契约 + 回退链进引擎，正则启发式降级为不合规素材兜底；**形象/动作分离（v2 重定向）与 VRM 原生（v3）未做**（动作仍绑死在 avatar GLB）。
- `protocol/cn|en/item.md` — **物品协议（规范级）**：实例=`{templateId, seed}`，mulberry32 PRNG + 稀有度 roll + 属性抽取顺序逐位钉死（跨引擎同 seed 同物品）；模板=世界内容（引擎零内置，demo 目录 `core/mocks/ItemTemplates.ts`）。天气/时间确定性派生同理规范于 `protocol/cn|en/world.md §3.1`（hash 切片语义）。
- `protocol/cn|en/game.md §9` — **游戏会话与验证协议**：会话=「(seed, 操作序列) 源 + 确定性重放」（局面/结果不持久化）；成就真实性=**服务器签名收据**（裸 hash 只证完整性；防伪须签名 + 服务器权威计数；local-first 单机不设防，跨信任边界才验证）；棋牌发牌=seed 推导 + commit-reveal（不存快照），隐藏信息 ⇒ Pattern A。缺口（YAGNI，有服务器需求再落）：Pattern B 局终上报 seam、收据字段约定。
- `docs/architecture/{overview,ecs,coordinate,pipeline,performance}.md`、`docs/systems/*.md`、`docs/features/spp*.md`（弦粒子 SPP）。

## 开发注意事项

- 引擎是 **TypeScript ECS**（`engine/src`）——**唯一开发基准**。旧 JS 引擎（VBW、`Septo.launch`、`world.js`、`framework.js`）**已于 2026-06 正式退役**（parity 补齐后，详见文件顶部说明）：归档在 `engine/backup/`，**只作历史/特性参考（触屏·移动端·2D 地图页·多链 API 的源码对照），永不作为基准、不在其上继续开发；勿删归档**。后续一切引擎开发只改 `engine/src`。
- 链已解耦：`engine` 与 `client/desktop` 均无 `@solana` 依赖。合约在 `chain/`（本地存档，Solana Devnet：`4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2`）。
- 包管理器分包：**engine 用 yarn，client/desktop 用 npm**。
- 引擎运行时依赖：除 Three.js 外，新增 `@dimforge/rapier3d-compat`（Tumble 刚体物理，headless WASM）——属 `core/` 可用的纯数学库，**不**破"Three.js 只在 render"边界；客户端经 `@engine` 源码别名间接解析，无需在 client 单独安装。
- 仿真循环：`World` 构造不自动启动；生产端调 `Engine.start()`（rAF），测试用 `Engine.step(dt)` 确定性步进。
- **提交策略：仅在用户明确要求时提交 git，不主动提交。**

## 层级边界（严格执行）

**Three.js 只允许在 `engine/src/render/` 内 import。** `core/`、`plugins/adjunct/` 均不得直接 import Three.js。

| 层 | 可以用 Three.js？ | 说明 |
|---|---|---|
| `engine/src/render/` | ✅ 合法 | 渲染层的唯一职责 |
| `engine/src/core/` | ❌ 禁止 | 通过 `renderEngine.*` 方法间接操作 |
| `engine/src/plugins/adjunct/` | ❌ 禁止 | 用 `MeshFactory.create()` / `RenderHandle`（`any`） |

**验证命令**：`grep -r "from 'three'" engine/src/core engine/src/plugins` 应无输出。
