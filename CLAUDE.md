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
│   │   └── plugins/adjunct/     # adjunct 定义（21 个内置，清单见 protocol/cn/adjunct-types.md）
│   ├── tests/               # vitest：unit / systems / integration / scenarios（见 tests/README.md）
│   └── backup/              # 旧 JS 引擎（septopus/，已归档；gitignore）
├── client/                  # 无链 3D 客户端（三分：core 共享核 + desktop 7777 + mobile 7778）
│   ├── core/                # 共享核（loader/useEngine/组件/levels·blocks·worlds·stylepacks 数据）
│   ├── desktop/             # 桌面 app（React+Vite PWA，e2e 57 spec）
│   └── mobile/              # 移动 app（独立 vite/playwright；摇杆+触屏视角+抽屉）
├── deploy/                  # dev.sh / build.sh：启动/构建 client/desktop；RELEASE.md 发版指南
├── docs/                    # 参考实现文档(architecture/systems/guides)+ plan 过程文档;规范在 protocol/
├── chain/                   # Solana 合约（已移出 git 追踪，本地存档）
└── app/                     # 旧链耦合前端（已移出 git 追踪，本地存档）
```

## 常用命令

```bash
# 客户端 —— 用 npm(desktop 7777 · mobile 7778,共享 client/core)
bash deploy/dev.sh                                 # 仪表盘:双端一起起(推荐)
bash deploy/dev.sh desktop|mobile                  # 单端前台
bash deploy/dev.sh lan                             # 真机联调(0.0.0.0 + 内网 IP)
bash deploy/dev.sh --chain                         # 链上启动模式:只起 IPFS 网关→自动发版→开 /boot?name=septopus
bash deploy/publish-chain.sh                       # 仅发版(网关已在跑时,改代码/数据后重发)
cd client/desktop && npm run dev                   # 或手动单起
cd client/desktop && npm run build                 # 静态 PWA → dist/

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
- **数据流**：`IDataSource`（纯数据文档/草稿，可换链/IPFS）→ Raw → STD（`CollapseCodec`）→ RenderData → Three.js。**默认入口=功能展厅(2026-07-09)**:裸地址(无 `?level`)进 gallery 走廊(①–⑳,尽头传送广场直达仙剑/过山车/跑酷);旧综合演示区(游戏桌等)= `?level=demo`——两者同属"默认世界族"(**软出生**:出生点取活动关卡 start,持久化位置仍然赢;authored 关卡才强制出生)。**默认世界也是数据（P7，2026-07-08）**：`default.level.json`（9 块 ref + `fallback` 回退地面模板）+ `default.world.json`（世界配置文档）+ `ContentResolver`（名字/CID→内容，本地=import JSON、联网=CAS/IPFS 同形状）；scene 注册表与 MockBlockData 客户端路径已退役，「内容从哪来」只有一个答案：关卡文档。
- **坐标系**：Septopus（X东 Y北 Z上）↔ Engine/Three（X右 Y上 Z前，北 = −Z）；转换见 `core/utils/Coords.ts`。**术语纪律（2026-07-04）**：**SPP 专指弦粒子协议**（String Particle Protocol，独立仓 ff13dfly/spp-protocol）；数据坐标一律称 **Septopus 轴序**，动画称 **Septopus 动画**——不得再写 "SPP 坐标/SPP 动画"（曾混用，协议文档已统一，代码标识符 `septopusToEngine` 等同日对齐）。
- **链可选**：经 `IChainPublisher` 注入发布，纯模式零 `@solana` 依赖。内容走 CAS：`services/ipfs`（7789）是 dev 网关，**CID 与引擎 `Cid.ts` 同源**（真 CIDv1）；客户端取字节顺序 = 进程内 MemoryCas → dev 网关 → 公网只读层，**router 逐次重哈希校验**。浏览器开 `/boot?name=septopus` 即从链上启动完整 3D 世界（比特币锚 → ROOT_CID → shim 验封套 → 按 CID 拉世界配置）。
  > **决策红线：一切动态加载（app / 内容 / adjunct 代码）都沿 boot-chain 的「锚 → envelope → CID 递归」方式走**，不要为某类资源另开加载路径。规范 `protocol/cn|en/boot-chain.md` + `envelope.md`。
- **外部服务（`services/`，拓扑与细节见 `docs/systems/services.md`）**：`deploy/dev.sh` 仪表盘统一起停十个——desktop 7777 / mobile 7778 / holdem 7784 / pool 7785 / board 7786 / mahjong 7787 / ai-gw 7788 / ipfs 7789 / worldlabs 7790 / ai-build 7791（`lan` 真机联调；新增服务照 `services.md` 的四处登记）。三条定式：
  - **两通道，按方向分工**：**HTTP = 请求/响应（`IGameApi` 缝）· WS = 服务器推送（`ILiveSource` 缝）**，同端口开在一起。客户端连接一律收编在 `client/core/src/net/`（`ServiceHub`/`HttpChannel`/`ReconnectingSocket`），别在组件里自己 fetch。
  - **一游戏一服务**：每个 Pattern-A 游戏独立进程（生产 = 各运营方各自的服务器），共性在 `services/lib/game-host.ts`，故每服务本体只有 7–8 行；**跨游戏调用物理 404**，隔离靠进程边界不靠约定。
  - **在线/离线行为同源**：`ProbedGameApi` 懒探测端点，在线走 HTTP、离线回退页面内 loopback——断网照玩，只是没有权威。

## 关键入口

- `engine/src/Engine.ts` — 引擎外观；`bootWorld()`、`start()`（rAF 循环）、`step(dt)`（确定性逐帧）、`injectBlock()`、`setEditMode()`。渲染器可经 `services.renderer` 注入（测试用 NullRenderEngine）。
- `engine/src/core/World.ts` — ECS 世界、系统编排、主循环。
- `client/core/src/lib/DesktopLoader.ts` — 客户端数据装载器（实现 `IDataSource`，喂纯数据文档：`levels/`/`blocks/`/`worlds/` + ContentResolver）。**client 三分（2026-07-08，specs/mobile-client.md）**：`client/core`（共享核：loader/useEngine/共享组件/纯数据内容，无 package.json，双端经 `@core` 源码别名引用）+ `client/desktop`（桌面 app，7777）+ `client/mobile`（移动 app，7778，独立 package.json/vite/playwright；摇杆/触屏视角/底部抽屉）。
- `client/desktop/src/App.tsx` — 桌面壳入口（`main.tsx` 只管桌面，另有 `?tool=stylepack` 分支进 StylePack 编辑器）。**移动壳是独立 app**：`client/mobile/src/MobileApp.tsx`（7778，自己的 vite/playwright；虚拟摇杆→setMoveIntent、画布拖拽=引擎原生触屏视角、底部抽屉）。两壳共用 `lib/useEngine` + loader 核与全部交互组件（specs/mobile-client.md；e2e `mobile.spec.ts` 触屏视口）。
- `client/core/src/components/page/` — **2D 页面栈(2026-07-20,规矩与 e2e 句柄见该目录 `README.md`)**:3D 世界之上的每个 2D 界面都是这个栈上的**一页**(地图/地块详情/配置/确认框),`PageProvider`(只给 context)+`PageHost`(surface,z-50)+`usePages()`。push 子页是在**同一 surface 内往里走**(iOS 式「‹」返回,容器不变形),**被埋的页保持挂载**(`visibility:hidden`)——返回地图时平移/缩放/已流式格子原样还在,不重拉;代价是跑循环的页要用 `usePageActive()` 自己 idle。形态由**栈底页**定,`variant:'auto'`(默认)= 宽屏(≥768px)居中卡片·窄屏底部抽屉,故双端共用一份页面定义;`padded:false` 换的是布局模式(满幅 flex 列、不滚动)而不只是内边距,画布页必须用它 + 固定高度档。定义一页 = 导出返回 `PageSpec` 的工厂(`mapPage(loader)`/`blockDetailPage(...)`),调用方不必知道它长什么样。**`pages.confirm()` 是 `window.confirm` 的唯一替代**(原生对话框是红线,还卡 rAF、e2e 驱动不了)。首个用例:2D 地图页 → 点地块 → 详情页 → 原始数据页(e2e `map2d.spec.ts` + 组件自身契约 `page-stack.spec.ts`)。

## 编辑 / Adjunct

- 编辑经 `EditSystem`（**palette 放置(add)** / select / move / set / delete / undo）→ `DraftStore`（write-behind 内存缓存 + IndexedDB 持久化，另有 `loadMeta/saveMeta` 世界级元数据通道存背包；启动时 `Engine.hydrateDrafts()` 注水，`ExportService` 提供 JSON 导出/导入）。
- **adjunct 共 21 个内置**，按 type-id 注册于 `core/services/AdjunctRegistry.ts`：`a1` wall · `a2` box · `a3` light · `a4` module（3D 模型）· `a5` water · `a6` cone · `a7` ball · `a8` sign · `b4` stop（隐形碰撞体，slot 5 三形状 box/ball/slope）· `b5` item · `b6` spp（弦粒子源）· `b8` trigger（slot 6 可声明传送锚点）· `b9` spawner · `ba` npc · `c1` track · `c2` motif · `e1` link · `e2` audio · `e3` video · `e4` book · `e5` board。**逐型逐槽位语义一律以 `protocol/cn|en/adjunct-types.md` 为准**（含 `resource` 三形态：数字 id / URL / `<cid>.<ext>`，见 §4），本文件不复述。module 的模型加载走 `render/ResourceManager` + `loaders/ModelLoader`，占位→swap、按 id 去重实例化，**格式无关**（含高斯泼溅；格式→loader 路由与 `SplatMesh` 不可 clone 的坑见 `docs/systems/render.md §2`）；骨骼动画由 `RenderEngine.startAnimation/setAnimationState`（idle/walk/run/air + crossfade，CharacterController 按速度驱动）。
- **Septopus 动画协议**（`AnimationSystem`，规范 `protocol/cn|en/animation.md`）：timeline 步驱动 move/rotate/scale/opacity/color/texture(UV 滚动)/morph(blendshape)；非 transform 覆盖由 `VisualSyncSystem` 经 `RenderEngine.updateObjectAppearance/setTextureOffset/setMorphInfluences` 落到 handle。**几何基元**见 `protocol/cn|en/adjunct.md §6`（box/sphere/cylinder/cone/plane/grid/tube/wedge；**wedge 必须与 `MovementCollider.topYAt` 同一平面方程**）。
- **背包/物品**（规格 `docs/plan/specs/inventory-local-first.md`，实例规范 `protocol/cn|en/item.md`）：`ItemRegistry`（模板 + seed 确定性推导属性）→ b5 adjunct → `ItemSystem` **原子**拾取/丢弃（背包变更 + block raw 重序列化进 draft 同帧完成）。trigger 动作经 `world.actuator`（`IActuator`/`LocalActuator`，可注入）执行，动作面 adjunct/flag/bag/player/sound/system + `delay`/`spawn`/`despawn` + `damage`/`projectile` 共 **11 种**（bag·player·damage·projectile 仅 Game 模式），JSONLogic 条件可读 `inventory.*`；player 方法含 setSpawn/enterGame/exitGame/damage/heal/**teleport**（锚点制，任意模式，见 `specs/teleport-portal.md`）。
- **模式**：`Engine.setMode`（Normal/Edit/Game/Ghost/**Observe**）；Ghost = noclip 飞行 + 隐藏 avatar；Observe = 冻结玩家、相机绕目标轨道。**Game 进入是区域门控、不是自由开关**（`block.game` raw[4] → `GameZoneSystem` → `World.setMode` 守卫，`force` 仅引擎/测试绕过；进入需显式动作，离开 zone 自动退回 Normal）——**引擎是真相源，客户端切换器不含自由 GAME 按钮**，完整契约见 `docs/systems/game-mode-entry.md`。**会话持久化**：`globalFlags` + oneTime 消耗随 DraftStore meta 进 IndexedDB，`hydrateDrafts` 还原（背包与**玩家位置**同通道；位置由 `CharacterController.processPersistence` 节流写、仅 Normal/Game）。
- **原生在场游戏（Pattern B）**：`PoolSystem`/`MahjongSystem`/`ShootingRangeSystem`/`TumbleSystem`——System 持逻辑、棋子即 adjunct 实体、点击经 `interact.primary` 触发动作。**生命周期区域门控**：`configure` 只登记(arm)，每帧 `syncSession` 按「`mode===Game` 且本块＝`world.activeGameBlock`」spawn/teardown，走出 block 即拆局（街机柜模型，无中途存档）；游戏富声明在 **game trigger**（`b8`+`enterGame` 带 `exitPolicy` 三档），`block.game=1` 只是粗粒度"此处可玩"门控位。**Tumble = 首个真实刚体物理**：`@dimforge/rapier3d-compat`（headless WASM，落在 `core/`），每局独立 scoped rapier world，逐帧把 body 位姿写回 `TransformComponent`（**倒塌必须同步旋转**，pool 只同步位置）。以上细节与踩过的坑（rapier 睡眠体须 `wakeUp()`、`setEntityColor` 要等 mesh 出现、yaw=90° 万向锁）见 `docs/plan/specs/native-in-world-games.md`。**运行时改色**经 `core/utils/Appearance.ts setEntityColor`（clone-on-write 隔离材质，不染共享材质邻居）。
- **三种游戏托管模式**：A 外部 app（GameRuntime+HUD，逻辑可服务端跑）· B 原生 System（上条）· C 纯数据驱动（authored 块数据 + 通用 Trigger/Actuator/Flag/Health，零专用代码，跑酷/coaster = `client/core/src/levels/*.level.json`）。**选型口诀：先 C，不行再 B，需服务端权威才 A。**
- **相机**：硬着陆按落差触发抖屏 + 下沉（`_camShake` 衰减包络，仅叠加到相机、不污染玩家 transform）；**一/三人称切换是推轨不是硬切**，且 **observe 轨道锚点有意不跟随眼高修正**——两条都见 `docs/systems/player.md §3`（回归测试 `engine/tests/systems/camera-rig.test.ts`）。
- **昼夜与天气**：`EnvironmentSystem.DAYLIGHT` 晨昏带 smoothstep 渐变；雷雨按 grade 缩放的确定性定时器触发全场闪光。**日内时钟与链历法是拆开的**：太阳时/分/秒由本地 dt 连续推进，链高度只跳"日历日期"这个整数——理由见 `protocol/cn|en/world.md §3.1/§3.2`（若让链高度驱动时分秒，「1 区块=1 天」会使其恒为零、太阳冻结）。
- **出生防卡死**：落入固体内时 `MovementCollider.popOutIfEmbedded` 自动弹上固体顶面（行走子步 ≤0.08m < 0.1 触发余量，正常移动永不误触）。
- **玩法回路**：`HealthSystem`（player:damage/heal/fell → died/respawned）+ 客户端 HP 条；**音频** `RenderEngine.playSpatialSound` + `ResourceManager.getAudioUrl`；**Block LOD** `BlockLODSystem`（远块隐藏 adjunct 网格、仿真照常）；**阴影**默认关、`Engine.setShadows(on)` 运行时开，`Engine.perfInfo()` 出 draw calls/triangles——**开启时踩过的两处坑（模型 cast/receive 标记、阴影相机 texel 密度导致的条带 acne）见 `docs/architecture/performance.md`，再遇条带别去调 bias**。
- **事件队列**（`core/events/`，设计 `docs/plan/specs/event-bus-design.md`）：`world.events` 帧作用域双缓冲队列——emit 不跑回调、系统拉 reader、边界回调仅在 step 尾按 (frame,seq) 全序派发。旧总线仅余 `player:*` 生命周期与 `audio:played`；Engine 门面双总线订阅 + LEGACY_EVENT_MAP 别名（dev 告警一次）。
- **编辑器创作闭环**：Edit 模式左侧 palette（`core/edit/AdjunctDefaults.ts` 给默认 raw；module 按 `world.moduleCatalog` 每模型一钮；track 不入 palette，coaster 走关卡 JSON），点击表面放置（`EditTask 'add'` → `spawnAdjunct` 复用），undo=删除。**移动平台跟随**：玩家脚下支撑 solid 的帧位移传递；solid 缓存每帧原地刷新位置（否则触发器移动后碰撞箱滞留旧位姿）。
- **弦粒子 SPP**（完整协议已落地，规格 `docs/plan/specs/spp-protocol-full.md`）：b6 raw `[origin, cells, theme]` → `core/spp/Expander.ts` 纯递归展开 → BlockSystem 产出**独立标准 adjunct 实体**（碰撞/触发器/LOD 原生）；derived 带 `derivedFrom`，`BlockSerializer` 只留 b6 源行。四项能力：叠加态确定性**坍缩**（mulberry32，seed=块+cell+面）· `refinement` 递归细化 · theme=**StylePack**（数据化可 CID/URL，`world.styleOverride` 秒换风格）· **L2 二进制**（`CollapseCodec` + `core/spp/SppL2.ts` 桥）。注意 `a1` 墙无贴图槽，**贴图墙体必须走 `parts` 组合发 a2+贴图槽**（terran 风格包即此，texture.md §8）。
- 动态/链上加载的 adjunct 代码经 `AdjunctSandbox`（Web Worker 沙箱 + 静态 `validateCode` 过滤）+ `AdjunctLoader`（已迁 TS，**暂未接入运行时**，随链相关功能启用）。

## 测试

- **CI**：`.github/workflows/ci.yml`——push/PR 跑 引擎单测+tsc+Three.js 层级边界+client 构建；全量 e2e 每日定时（cron）+ 手动 dispatch（约 1.5h，失败上传 Playwright 报告）。
- `engine/tests/`（vitest，node 环境）：`unit/`（CollapseCodec、Coords、adjunct transforms/sandbox/registry/resource-manager）、`integration/`（headless-boot）、`systems/`·`scenarios/`（部分 `todo`）。**务必读 `engine/tests/README.md` 的"局限性"**（无 GPU/浏览器、确定性、scenarios 待补等）。
- **内容门禁（2026-07-21）**：`unit/content-conformance.test.ts` 逐文件校验 `client/core/src/{blocks,levels,stylepacks,assets}` 全部内容 JSON（槽位类型、资源引用形态、trigger 动作集、manifest 引用完整性，含反例自检）；`unit/resource-contract.test.ts` 钉死资源缝语义（a1 槽 3=颜色索引不出贴图、a2 槽 7=贴图、ResourceManager 直连白名单不含宿主相对路径）。**测试红了改内容，别改测试/引擎迁就内容**；跨工具守则同步写在根部 `AGENTS.md`（GEMINI.md 指向它）——起因：外部 AI 曾把 `/assets/*.png` 硬编码进风格包并反转 a2 槽 7 语义。
- 真 WebGL / 像素 / 输入（L4）用 Playwright，在 `client/desktop/e2e/`（已搭 **57 个 spec**：boot/movement/fall-through/trigger/avatar/persistence/inventory/engine-features/editor-platform/spp/coaster/map2d/game-trigger/ai-authoring/rpg-xianjian/portal-travel/worldlabs-panel/palace 等；`npm run test:e2e`，SwiftShader 软渲染 + `engine.step(dt)` 确定性驱动）。

## 文档索引

> **三层文档模型**：`protocol/`（**规范**，cn/en 双语，**变更须双语同步**）→ `docs/`（**参考实现**）→ `docs/plan/`（**过程**，非规范）。旧引擎时代文档归档在 `docs/legacy/`。
>
> **本节是索引不是摘要**——只给"去哪读"，细节一律以目标文档为准；要改哪块先读那份文档，别照这里的一句话动手。

**规范 `protocol/cn|en/`**（协议 v0.1 随引擎版本）

- `adjunct-types.md` — 21 型逐槽位规范（**改 adjunct 数据格式必读**；§4 = module 的 `resource` 三形态）。
- `determinism.md` — PRNG / 钉点 / 一致性验收（跨引擎复现的根契约）。
- `world.md` — §3.1 天气历法确定性派生（**只到"日"这一级**）· §3.2 参考链绑定=比特币（1 区块 = 1 Septopus 日）· §5 坐标旋转契约。
- `block.md` §3 — raw 五元组。`adjunct.md` §6 — 几何基元语义。`animation.md` — Septopus 动画。
- `item.md` — 物品实例=`{templateId, seed}`，属性抽取顺序逐位钉死（跨引擎同 seed 同物品）。
- `avatar-animation.md` — 形象/动作/状态三层分离，基准 VRM 1.0 + VRMA；状态集 idle/walk/run/air + 剪辑名相等契约。声明制体格在 `player.md §3.1`（**物理归世界、视觉归 avatar**；碰撞胶囊不读声明）。运行时换装入口 `Engine.setAvatar`/`EntityFactory.swapAvatar` + 客户端 `AvatarPicker.tsx`，调试面 `Engine.avatarInfo()`。**形象/动作分离(v2)与 VRM 原生(v3)未做**。
- `texture.md` — 贴图跨引擎契约（世界尺度 `size` + 纹素密度基准 512 px/m + 尺寸驱动 UV）。**设计尚未落地引擎代码**，§9 记迁移与勘误。
- `game.md §9` — 会话=「(seed, 操作序列) + 确定性重放」；成就真实性须**服务器签名收据**（裸 hash 只证完整性）；隐藏信息 ⇒ 只能 Pattern A。
- `boot-chain.md` + `envelope.md` — 全链启动（锚 → ROOT_CID → shim 验封套 → 世界配置）。

**过程 `docs/plan/`**

- `STANDALONE_ENGINE_ROADMAP.md` — 路线图（链剥离 + 旧引擎退役 + 后续 P1–P5）。
- `PLAYABLE_CHECKLIST.md` — 可玩化 gap 追踪（内容/产品视角）。
- `GAME_SYSTEMS_BACKLOG.md` — 引擎原语缺口（F1 调度 · F2 NPC · F3 战斗 · F4 对话）。**F 系列统一设计模式**（authored 源→运行时派生 · 定义→实例不持久化 · 条件=JSONLogic/效果=actuator · 定时=仿真时间）见该文档同名节。
- `specs/` — 逐特性规格：`scheduler-and-spawn`(F1) · `npc-agents`(F2) · `combat-damage`+`dialogue-quests`(F3/F4，**任务=flags 配方，有意不加原语**) · `spp-protocol-full` · `spp-recursive-refinement`（分层生成，状态见其 §9） · `coaster-via-spp` · `ai-authoring` · `2d-map` · `teleport-portal`（**动作只认锚点不认裸坐标**） · `palace-stress-level`（流式压力测试 + 全 adjunct 收纳架） · `native-in-world-games` · `inventory-local-first` · `mobile-client` · `event-bus-design` · `full-data-migration` + `bevy-reference-engine`（第二引擎差分裁判）。

**参考实现 `docs/`**

- `architecture/{overview,ecs,coordinate,pipeline,performance}.md`（`performance.md` 记阴影踩坑）· `systems/*.md`（**`services.md` 外部服务拓扑/端口/连接层** · `player.md` 相机与体格 · `render.md` 模型加载 · `game-mode-entry.md` Game 门控）· `features/spp*.md` · `guides/getting-started.md`。
- `client/core/src/components/page/README.md` — 2D 页面栈用法。`client/core/src/scenes/README.md` — 内容=数据纪律。`engine/tests/README.md` — 测试局限性。
- `deploy/RELEASE.md` — 发版（全仓一个 SemVer，打 `vX.Y.Z` tag 即自动发版 + 部署 Pages）。

## 开发注意事项

- 引擎是 **TypeScript ECS**（`engine/src`）——**唯一开发基准**。旧 JS 引擎（VBW、`Septo.launch`、`world.js`、`framework.js`）**已于 2026-06 正式退役**（parity 补齐后，详见文件顶部说明）：归档在 `engine/backup/`，**只作历史/特性参考（触屏·移动端·2D 地图页·多链 API 的源码对照），永不作为基准、不在其上继续开发；勿删归档**。后续一切引擎开发只改 `engine/src`。
- 链已解耦：`engine` 与 `client/desktop` 均无 `@solana` 依赖。合约在 `chain/`（本地存档，Solana Devnet：`4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2`）。
- 包管理器分包：**engine 用 yarn，client/desktop 用 npm**。
- 引擎运行时依赖：除 Three.js 外，新增 `@dimforge/rapier3d-compat`（Tumble 刚体物理，headless WASM）——属 `core/` 可用的纯数学库，**不**破"Three.js 只在 render"边界；客户端经 `@engine` 源码别名间接解析，无需在 client 单独安装。另有 `@sparkjsdev/spark`（高斯泼溅渲染，2026-07-14）——严格限定在 `engine/src/render/` 内（`SparkRenderer`/`SplatMesh`/`SplatLoader`/`PackedSplats` 均为 THREE.Object3D/Mesh 子类，随场景走），不破边界；`client/desktop` 曾锁定的 three@0.177.0 缺 Spark 依赖的 `three/addons/*` 导出别名，已升至 0.183.1(与引擎对齐) + vite 别名补丁。
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
