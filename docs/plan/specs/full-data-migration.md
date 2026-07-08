# 全数据化迁移 — 上链与跨引擎复现

> 状态:草案 v0.1（2026-07-08）。过程/规划文档（`docs/plan/`），非规范。
> 规范落点见每节末的 → `protocol/` 指向;稳定后相应条目并入 `protocol/`。

## 0. 为什么要做这件事

当前引擎的世界内容有相当一部分**不在块数据里**,而是由客户端 TypeScript（`client/desktop/src/scenes/*.ts`、`DesktopLoader` 的镜像几何、`DEMO_ASSETS` 清单）在运行时生成。这在单引擎单机是能跑的,但它**堵死了两条路**:

1. **上链**:链上只存数据。若世界要靠客户端代码才能拼出来,那"同一份数据必解出同一个世界"就不成立——链上拿到的块是空的或不完整的。
2. **跨引擎复用**:我们在评估用 Rust 的 **bevy** 做第二个解析引擎。一个干净房间引擎只会读「块数据 + 协议」,它不会执行我们的 TS。凡是"配置外的隐藏处理",在 bevy 里就是缺失的世界。

所以目标不是"少写点代码",而是一条**硬约束**:

> **每个 block 的数据结构一致;一个 adjunct 的配置包含它的全部行为;引擎不做配置外的隐藏处理。**

## 1. 北极星与验收标准（干净房间复现）

**验收 = clean-room reproduction。** 第二个引擎实现(bevy/Rust)+ 本仓 `protocol/` 规范 + 一份块/关卡数据,产出的世界与行为**逐点等价**于现引擎,且第二引擎**不含任何本项目的运行时代码**。

可度量成三条:

- **AC-1 内容完备**:任何被渲染/可交互/影响仿真的东西,都能从块数据(+ 数据引用的资源/其它块)推导。客户端读块 = 世界,不再有"块之外还得跑一段生成"。
- **AC-2 行为完备**:一个 adjunct 的语义行为(碰撞形状、触发事件→动作、生成、对话、NPC 行为、可拾取、可点击意图……)全在它的 raw(+ 协议原语)里,引擎按规范执行,不掺私有默认或私有分支。
- **AC-3 确定性可复现**:所有"源→派生"与随机(SPP 坍缩/motif 生成/item 抽属性/NPC 游走/天气时间)是**协议内的确定性算法 + 钉死的种子**,两个引擎跑同一份数据得到**逐字节可比**的派生结果(golden vectors + 状态哈希)。

**"复现"的边界**(见 §6):要求复现的是**世界状态与语义行为**,不是像素级观感。相机抖动、粒子、阴影质量、LOD 策略、UI 呈现允许各引擎不同。

## 2. 目标不变量

| # | 不变量 | 含义 |
|---|---|---|
| **I1** | 块结构一致 | 每块都是同一 canonical schema（现为 5 槽 `[elevation, status, adjuncts, animations, game]`,`normalizeBlockRaw`/`validateBlockRaw`），带版本号;不再有 `{x,y,raw}` / bare raw / AuthoredLevel / on-chain 记录 四种口径打架 |
| **I2** | adjunct 配置 = 完整行为 | 一个 adjunct 的所有语义行为从它的 raw + 协议可推导;引擎无配置外分支 |
| **I3** | 生成即规范 | SPP/motif 等"源→派生"是协议内确定性算法,种子钉点;不是引擎私有代码 |
| **I4** | 无隐藏合成 | 引擎不凭空造数据里没有的东西（如 auto-ground）;要么写进数据,要么把规则升为规范并写默认值 |
| **I5** | canonical 序列化 | 字节确定的编码 → 稳定 CID → 上链复现;每个 adjunct 类型都有版本化编解码 |
| **I6** | 引用可移植 | 块内引用按"所在块"相对解析、跨块按名解析;不烤绝对块坐标 |
| **I7** | 世界状态 vs 引擎观感分层 | 必须复现的是世界状态/语义;观感(抖屏/粒子/阴影/LOD)允许各异,且在协议里明确标注 |

## 3. 缺口清单（"配置外的隐藏处理"审计）

这是迁移的靶子。每条 = 一处现在**不在数据里 / 不在规范里 / 引擎私自处理**的地方。

### A. 内容不在块数据里（客户端代码生成）
| 缺口 | 现在藏在哪 | 为何挡上链/跨引擎 |
|---|---|---|
| A1 场景内容 | `scenes/*.ts`:`demoScene`(默认出生块)、`worldHubScene`(组合)、`refineScene`、games(pool/mahjong/shooting/tumble/maze/sandbox) | 第二引擎读这些块 = 空块（`levelSceneProvider` 对未授权坐标返回 `EMPTY_BLOCK`；无 `?level` 时走 `MockBlockData`+注册表） |
| A2 镜像几何 | `DesktopLoader.buildPoolBalls/…`,注释直说"geometry **matches** poolScene/shootingScene/mahjong3dScene" | 棋子布局在客户端代码,不在数据;两份真相要对齐 |
| A3 资产清单 | `demoScene.DEMO_ASSETS`（id→文件/类型/repeat）+ `avatarCatalog` 的 per-model facing 修正 | 第二引擎不知道 id 27 = pyramid.gltf、facing 该修多少 |

### B. 生成/行为未规范化或不可跨引擎复现
| 缺口 | 现状 | 备注 |
|---|---|---|
| B1 motif 模板算法 | house/road/building/maze 等生成器是客户端/引擎代码,**算法未进 `protocol/`** | 换引擎会生成**不同几何**。反面对照:**SPP 展开已在协议内**（`core/spp/Expander.ts` 纯函数 + 坍缩种子=块+cell+面），是正确范例 |
| B2 刚体物理 | `TumbleSystem` 用 `@dimforge/rapier3d-compat` | 跨引擎**逐帧刚体复现极难**（不同 solver + 浮点非决定性）。单列,见 P6 |
| B3（正面参照）| item seed 派生、NPC wander PRNG、weather/time 派生 | **已在 `protocol/`**（item.md、world.md §3.1、determinism.md）;证明这条路走得通 |

### C. 隐藏合成状态（引擎凭空造数据里没有的东西）
| 缺口 | 证据 | 
|---|---|
| C1 auto-ground | `BlockSystem` 在没有"oz<0 的 box"时**自动合成地面**（`hasGround`）。stylepack 预览要塞一个 z=−1000 的 "ground-suppressor" 才能骗过它——这正是"配置外隐藏处理"的活样本 |
| C2 mock 附带物 | `MockBlockData` 附带 `BatonSpin/HoverFlow/AlertFlash` 动画 + pillar + 默认 ground,冻结时一起烤进数据（`gallery.level.json` 92KB 里每块都带） |
| C3 隐式默认 | raw 里没写的槽位取引擎默认值——第二引擎的默认可能不同 |

### D. 引用不可移植
| 缺口 | 现状 |
|---|---|
| D1 块内绝对引用 | 触发器动作 target = `adj_{x}_{y}_{type}_{idx}`,烤了绝对块坐标（`resolveAdjunct` 按绝对 id 查）。语义本是"我这块的第 I 个",却写成绝对 → 一 relocation/引入就断 |
| D2 传送 hint 坐标 | 传送**已经名字制**(`execTeleport` 先 `findLiveAnchor(name)`);仅剩"目的块 hint 坐标"是绝对,可升为全局按名索引 |

### E. 序列化 / 容器不统一
| 缺口 | 现状 |
|---|---|
| E1 canonical 二进制 | 仅 SPP 有 L2 编解码（`CollapseCodec`/`SppL2`）;**全 adjunct 类型缺**版本化 canonical 编码 → CID 不稳、上链无一致解码 |
| E2 块容器多形 | `{x,y,raw}`（legacy）/ bare raw / `AuthoredLevel` / 未来 on-chain per-block 记录 —— 需要一个 canonical 关系与转换 |

### F. 表现/交互分层未在协议划清
| 缺口 | 现状 | 目标 |
|---|---|---|
| F1 交互呈现 | link→`window.open`、book→`BookReader`、video→`VideoTexture`、audio→`PositionalAudio` 都在客户端 | 协议明确:**数据声明意图**(link+url / book+pages / video+source / audio+source),**呈现由各引擎自定**;别把"呈现方式"误当"必须复现的行为" |
| F2 引擎观感 | 相机抖屏、粒子、阴影、LOD 策略、天气闪电视觉 | 明确列为**非规范**（I7）,各引擎可不同 |

## 4. 分阶段迁移

每阶段都带**验收**。顺序按"先补地基/最硬,再搬内容,最后动默认世界"。

### P0 · 规范基线 + 一致性夹具
把散在代码里的隐性契约固化进 `protocol/`,并搭 conformance 骨架。
- 补齐:canonical block schema（版本号 + 槽位默认值,I1/C3）、`protocol/adjunct-types.md` 逐槽位补全每个类型的**行为语义**(I2)、`determinism.md` 收编所有种子钉点(I3)、引用模型(I6)、观感非规范清单(I7)。
- 建 **golden vectors**:`(block raw | level doc) → 期望派生实体集 + 世界状态哈希 + 关键事件序列`,存 `engine/tests/golden/`。
- 建 **conformance harness**:headless 跑数据 → 导出状态哈希,供第二引擎对拍。
- **验收**:现引擎对全部 golden vectors 自洽;CI 加"新 adjunct 类型必须有 golden + 协议槽位"门禁。

### P1 · 引用可移植（缺口 D，最硬的地基）
- ✅ **块相对 target 已落地(2026-07-08)**:`Actuator.rewriteRelativeTarget` 把 `adj_~_~_{type}_{idx}`
  按触发实体自己的块(`sourceEntity`→`parentBlockEntityId`→`BlockComponent{x,y}`)解析成绝对 id;
  绝对/数字 target 原样透传,无发起块则留原样(解析落空 → null,安全)。`adjunct`+`damage` 动作已接。
  协议已记:`trigger.md` 动作表 + `adjunct-types.md §0`。
  - **验收 ✅**:`engine/tests/integration/block-relative-target.test.ts`——同一份带触发门的内容
    inject 到两个不同块,各自开**自己**那面墙、互不串扰;绝对 target 仍工作。513 引擎测试全绿无回归。
- ✅ **`include(ref, offset, overlay)` 组合原语已落地(2026-07-08)**:`AuthoredLevel.include[]`
  + `levelSceneProvider` 递归解析——own 块优先,include 把子关卡按 `offset` 平移(只移块键、内容
  逐字节照搬,靠块相对引用保正确)、`overlay` 把额外 adjunct 组并入指定块(到达锚点/返回门),
  merge 时深克隆不污染源文档。worldHub 那类"hub+搬址子关卡+注入门"从此可纯数据表达。
  - **验收 ✅**:`engine/tests/unit/level-include.test.ts`(4):own 优先 / 偏移+overlay 合并 / 未授权→空块 / 源不被污染。517 引擎测试全绿。
- ✅ **`worldHubScene` 已用 `include` 重写为纯数据(2026-07-08)**:删掉 `demoBlockRaw`/`xianjianBlocks`/`foldPortal`/`pushGroup` 的命令式克隆-平移-注入,换成 own hub 块 + demo/xianjian 两个 `include`(各带 overlay 锚点+返回门)。**`world-hub.spec.ts` e2e 全绿**(出生→西门传送演示场景→返回→东门传送仙剑村,行为逐帧一致)。include 原语的首个真实落地。
- 🔲 **待续**:传送锚点升为全局按名索引(`hint` 降级为可选);`despawn`/`sound` 其余 adjunct 目标接入。

### P2 · 内容入数据（缺口 A）
- `refineScene` → 冻结成 `refine.level.json`（本就是一行 b6 + 引擎 Expander,近白送）。
- `demoScene` 静态半 → `demo.level.json`;保留 `DEMO_ASSETS`→ 迁成 **manifest 数据文件**（A3）,`stampTestScene` 重接成"加载数据"。
- **原生游戏布局入块数据 + System/loader 从块数据读初始布局 + 删 `DesktopLoader` 镜像几何**（A2）。先挑最简单的 shooting 做实证,跑通"布局进数据 → System 读数据 → 删镜像"这条链,再推广。
- **进展(2026-07-08)**:
  - ✅ **refine 冻结**:`refineScene.ts` 删除 → `src/levels/refine.level.json`(spp-refine e2e 绿)。
  - ✅ **`game.declare` 数据驱动链**:b8 game trigger 的 `enterGame params[0].game = {kind,…}` 即富声明;BlockSystem 块初始化时发 `game.declare` 事件,匹配的游戏 System 拉 reader 自臂(`configure` from data)。**shooting / pool / tumble 三个已接**,loader 的 `setupShooting3D/setupPool3D/setupTumble3D` 镜像全删(headless `game-declare.test.ts` + shooting3d/pool3d/tumble3d e2e 全绿)。mahjong3d 暂缓:牌面=客户端生成图片异步 ingest CAS(host 资源关注点),待资源清单数据化后回收。
  - ✅ **demoScene 内容 → `src/levels/demo-block.json`**:先把触发器目标全改**块相对**(`adj_~_~_…`,trigger e2e 5/5 绿)→ 冻结 → 出生块 registry / `stampTestScene` / worldHub demo-embed 三处消费者共用一份 JSON(克隆服务);`demoScene.ts` 311→62 行只剩资产清单+常量(boot/inventory/book/world-hub/engine-features/persistence e2e 全绿)。
  - ✅ **maze → `src/blocks/maze.block.json`**:carveMaze 的种子是写死的 → 按「一次性生成→冻结」准则冻结(49 个 b6 胞元源行 + 大理石装饰;引擎加载时照常展开、只存源);`mazeScene.ts` 只剩常量(maze e2e 4/4 绿)。**P3 注**:maze 不做 motif 模板——motif 现只发 a2 且派生行不再二次展开(嵌套源展开是新原语,YAGNI);要参数化迷宫时再议。
  - ✅ **剩余家具全部冻结 + 防复发规矩(2026-07-08)**:shooting/pool/tumble/mahjong/mahjong3d/hub
    六块家具冻结为 `src/blocks/*.block.json`(game 标志原样保留:pool=43、mahjong=42 外部 app id);
    五个 scene 文件收缩为纯常量,worldHub 的 `hubBlockRaw()` 退役(hub 块=数据,`portal()` 只服务
    include overlay 的返回门);registry 全部改为 JSON 克隆服务。**规矩落两处**:
    `client/desktop/src/scenes/README.md`(诱惑点,内容放哪/本文件夹只允许常量清单·组合胶水·工具)
    + 根 CLAUDE.md 开发注意事项(内容=数据纪律)。`scenes/` 从此零世界内容。
  - ✅ **数据目录约定(2026-07-08)**:一种数据一个文件夹 + 后缀标类型(沿 stylepacks 先例)——
    `src/levels/*.level.json`(关卡文档:出生点+多块+include)· `src/blocks/*.block.json`
    (单块 raw:可复位、被 registry/stamp/include 复用的内容,现有 demo/maze)·
    `src/stylepacks/*.stylepack.json`(风格包)。拆分粒度规则:**有复用才拆块文件**——
    gallery 走廊是一个可走关卡,保持一份 level 文档,不拆 13 个块文件。
- **验收**:对应 `?level=` 在**空 DesktopLoader 内容代码**下仍复现;golden vectors 通过。

### P3 · 生成规范化（缺口 B1）
- 把 motif 模板算法（house/road/building）写进 `protocol/`（确定性 + 种子钉点 + golden）。
- **maze 作为 motif 模板**落地,证明"程序化内容也能一行数据 `[origin,'maze',seed,{w,h}]` 调用引擎原语",退役 `mazeScene` 的客户端生成。
- **验收**:两个引擎对同一 motif 数据行产出逐字节相同派生实体。

### P4 · 去隐藏合成（缺口 C）
- **auto-ground** 二选一:要么授权数据显式带 ground,要么把"无 ground 时合成 XxY 地面"升为**协议规则并写死参数**（C1）。
- 数据授权脱离 `MockBlockData` 附带物,冻结只留真实内容（C2）。
- 所有未写槽位的默认值在协议里钉死（C3）。
- **验收**:grep 客户端无"往块里塞数据/私有默认/私有几何";冻结产物无 mock 附带物。

### P4.5 · 内容网络层已落地(2026-07-08,services/ipfs)
- **dev IPFS 网关**:file-CAS over HTTP,**CID 直接 import 引擎 `Cid.ts` 计算(零漂移)**;
  启动时把共享内容树(core 的 levels/blocks/worlds/stylepacks + public 资产)种入 CAS 并建
  name→cid 索引;路由 `/v0/health` `/v0/names` `/v0/name/<n>` `/ipfs/<cid>` `/v0/add`(CORS)。
- **客户端分层**:`HttpCasProvider`(client/core)启动时静默探测网关,在线则
  `world.ipfs.addProvider()` 挂为**最低优先级**——进程内 MemoryCas 仍是一级缓存/离线兜底
  (local-first 承诺不破),未命中才走网络;router 对每次 get **重哈希完整性校验**。
  换真 IPFS 网关 = 换 base URL,其余不动。
- **验收 ✅**:`e2e/ipfs-gateway.spec.ts`——种子名→CID→浏览器内经 router 跨进程取回→引擎侧
  重哈希通过→字节解析回 garden;伪 CID 全层未命中即抛(无静默垃圾);浏览器 put/get 回环同 CID。
  网关进 desktop playwright webServer(e2e 环境确定)+ deploy/dev.sh 第 4 行服务。
- **待续**:名字索引接 ContentResolver(关卡/块按名走网络,需 loader 异步化构造)、
  资源管线优先网关取资产、真 IPFS provider。

### P5 · canonical 序列化 + 上链形态（缺口 E）
- 每个 adjunct 类型给 canonical 编解码（扩展 L2 模式）+ 版本号;定义 block on-chain 记录形态与 `AuthoredLevel` 的关系。
- CID 稳定性测试:同数据 → 同 CID;跨引擎解码一致。
- **验收**:一份块经"编码→CID→解码"round-trip 后 golden 不变;第二引擎能解码同一 CID。

### P6 · 物理策略（缺口 B2）
决定 tumble 一类刚体内容的跨引擎策略,三选一并写进协议:
- (a) **位级确定物理**(比初估乐观):rapier 有 `enhanced-determinism` 特性,在符合 IEEE-754-2008 的平台上做到**位级跨平台确定**。我们 Tumble 用的就是 rapier(`@dimforge/rapier3d-compat`),bevy 侧 `bevy_rapier` 包的是同一个 rapier → **同 rapier 版本 + enhanced-determinism + 固定步 + 同 broad-phase/solver 配置**下有望逐帧复现。真风险 = **WASM vs native 的浮点行为** + 版本锁定,须实测确认;
- (b) **记录-回放**:把仿真结果作为派生数据落盘(局面不再实时跨引擎算);
- (c) **明确标注**:此类为"引擎观感,不保证跨引擎逐帧一致",仅保证入局/结算的语义(§6/I7)。
- **验收**:协议对物理复现层级有明确承诺,并有对应 conformance 项(或明确豁免)。先跑一个 rapier(WASM)↔ rapier(native)同初态对拍,确认 (a) 是否成立,再定档。

### P7 · 默认世界 → level 文档 + 退役 scenes 注册表 ✅(2026-07-08)
- ✅ **词汇 A `fallback`**:`AuthoredLevel.fallback?: BlockRaw | {ref}` — 未授权坐标服务声明的
  回退块模板(逐坐标深克隆,防串块别名);"无限标准地面"从 MockBlockData 隐藏合成变成数据声明。
- ✅ **词汇 B `ref` + `ContentResolver`**:块条目 `{x,y,ref}`、include `{ref,offset,overlay}`、
  fallback `{ref}` 皆可按名/CID 引用;`levelSceneProvider(level, resolve?)` **构造时急切解析**
  (`resolveAuthoredLevel`:解析→深克隆→验证,悬空 ref 抛错快败)。本地 host = import JSON 的
  名字表;联网 host 换 CAS/IPFS 路由,**关卡数据一字不改**。
- ✅ **`default.level.json`**:默认世界 = 9 个块 ref(demo/maze/五游戏/sandbox/dynamic)+
  `fallback` ref + 出生点;**`default.world.json`**(`src/worlds/`):世界配置文档化
  (avatar=33/facing=0 直接烤入,`world()` 纯服务克隆,MockWorldNormal 客户端路径退役)。
- ✅ **sceneBlock 收敛 + 注册表退役**:三岔路(levelProvider/registry/MockBlockData)→ 一条
  `levelProvider.block(x,y)`;`buildSceneRegistry`/`sceneRegistry` 删除;sandbox/dyn 的
  builder 也冻结退役(`blocks/sandbox|dynamic|fallback.block.json`),两文件只剩工具逻辑与
  沙箱代码常量(代码即行为通道)。
- ✅ **语义保持**:默认世界「**恢复位置优先于 start**」经 `isDefaultWorld`/`authoredStart` 门
  保住(authored 关卡仍每次强制落点)——persistence e2e 验证。
- **验收**:引擎 526 单测全绿(+4 fallback/ref 词汇测);12-spec 宽幅 e2e 批
  (boot/streaming/persistence/trigger/inventory/maze/shooting3d/sandbox/dynamic/map2d/avatar/edit)。
- 🔲 **余项**:worldHubScene 的 include 组装胶水(等 world.level.json 直接写 ref 后消失,依赖
  把 hub/xianjian 也注册进 ContentResolver——机械小步);mahjong3d 牌面 host 调用(资源清单数据化)。

### P8 · 第二引擎（差分裁判）——应尽早并行,不是最后才做
> **实现细节独立成文**:[`bevy-reference-engine.md`](./bevy-reference-engine.md)（无头一致性内核的架构、状态哈希口径、golden 格式、crate 结构、里程碑 B0–B6）。本节只给它在迁移里的位置。

第二引擎是"数据是否完备"的差分裁判(differential oracle):凡是"只看协议+数据、在第二引擎里实现不出来"的地方,就当场逮住一个隐藏处理。所以它是 **P0–P4 的拉动器**,应尽早启动,不要留到最后当验收章。

**分两层,别绑在一起:**
1. **无头一致性内核(纯 Rust,先做,甚至不依赖 bevy)**:实现 protocol 的解码 + SPP/motif 展开 + 碰撞/触发/actuator 语义 + 状态哈希,跑 P0 的 golden vectors。这才是证明"数据完备"的东西,只是完整引擎的一小块。
2. **bevy runtime(后做,可选)**:等内核对拍通过,把它塞进 **bevy 0.19**(Rust data-driven ECS,与本引擎 ECS 心智直接对应)做可玩的第二客户端,接管渲染/输入/观感。

**关键纪律:比对在数据/状态层,不在帧仿真层。** bevy ECS 默认并行、系统执行顺序非确定(须显式 `.before/.after` + fixed timestep),所以**不要**追求 bevy 并行调度与本引擎逐帧对齐;比 `块数据 → 展开实体 → 状态哈希`,两边都可控且确定(与本引擎 `step(dt)` 确定性驱动同一纪律)。

- **验收(总)**:第二引擎(先内核)对全部 golden vectors 状态哈希一致 = AC-1/2/3 达成。

## 5. 一致性 / Conformance

- **Golden vectors**:`(数据) → (派生实体集 + 世界状态哈希 + 事件序列)`,是跨引擎唯一裁判。放 `engine/tests/golden/`,双引擎共享。
- **决定性钉点**:复用 `protocol/…/determinism.md`(PRNG=mulberry32、坍缩种子、派生顺序、块加载顺序)。任何新生成器必须在此登记公式。
- **跨引擎对拍**:同 vectors,现引擎 vs bevy,状态哈希逐位比。
- **CI 门禁("无隐藏处理"审计)**:
  - `grep` 客户端里"往块 raw 塞数据 / 私有几何 / 私有默认"= 失败;
  - 新增 adjunct 类型无 `protocol/adjunct-types.md` 槽位或无 golden = 失败;
  - 冻结产物含 `MockBlockData` 附带物 = 失败。

## 6. 非目标与边界（避免误砍）

- **引擎系统逻辑仍是各引擎的代码**:物理/规则/渲染实现由数据规定 **WHAT**,不规定 **HOW-rendered**。PoolSystem 物理、MahjongSystem 规则、渲染管线——各引擎自实现,只要语义/状态对得上。
- **观感层允许各异**(I7):相机抖屏、粒子、阴影、LOD、天气闪电视觉、UI。
- **`dynamic-adjunct`(代码即行为)** 是显式的"带 code 的 adjunct":它的可移植性 = 沙箱契约 + 代码本身,是**另一条线**(WASM/沙箱跨引擎),不在本文"内容数据化"范围。
- **本迁移不追求"无引擎代码"**,只追求"内容/行为完全由数据 + 规范决定"。

## 7. 关联文档

- [`bevy-reference-engine.md`](./bevy-reference-engine.md) —— **本文的可执行裁判**:无头一致性内核(先) + bevy runtime(后),用 golden vectors 对拍证明 AC-1/2/3。P0 的 golden 夹具、P8 的第二引擎都在那份展开。
- `protocol/cn|en/adjunct-types.md`（逐槽位规范,I2 主战场）· `determinism.md`（I3/AC-3）· `world.md §5`（坐标/旋转）· `block §3`（raw 五元组,I1）
- `protocol/cn|en/item.md`、`world.md §3.1`、`game.md §9`（已数据化/确定性的正面参照,B3）
- `docs/plan/specs/spp-protocol-full.md`（SPP = "源→派生+只存源"的样板,B1 参照）· `spp-recursive-refinement.md`
- `docs/plan/specs/ai-authoring.md`（motif 模板目录 = P3 的生成器落点）
- `docs/plan/GAME_SYSTEMS_BACKLOG.md`、`STANDALONE_ENGINE_ROADMAP.md`（本迁移接入路线图）
- `core/services/AuthoredLevel.ts`（关卡=纯数据的现有落点,I1/`include` 原语的扩展点）
