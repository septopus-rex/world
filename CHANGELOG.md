# Changelog

Septopus World 的版本记录。格式循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
版本号循 [SemVer](https://semver.org/lang/zh-CN/)(pre-1.0:minor=功能批次,patch=修复)。
条目从 conventional-commit 历史(`feat:`/`fix:`/`docs:`)整理,深度设计随条目链接到
`docs/plan/specs/*`。发版流程见 `deploy/RELEASE.md`。

## [Unreleased]

### 修复
- **化身运动僵直(stiff avatar)**:平地行走时物理 `isGrounded` 逐帧 true/false 抖动
  (grounded 跳过重力→无下坠探测→false→施重力→又落地→true),裸喂状态机导致 `walk`
  与 `air` 每帧互切、每次 `reset()` 把循环剪辑打回第 0 帧——角色卡在起步姿势。修复:
  `air` 判定加 coyote-time 迟滞(`CameraRig._airborneSec` > 0.12s 才算真 air),吸收
  单帧落地抖动;实测剪辑时间从恒 0.017 变为连续推进。规范化到 `avatar-animation.md §2`
  (air 需去抖,cn/en)+ e2e 回归断言(剪辑必须推进不冻结)。

### 功能
- **SPP 粒子(option 库)组合化 + 稳定 key + 独立库编辑器(P1/P4/P2-P3)**:把 SPP 变体从"只出 a1 墙"
  升级成**任意 adjunct 组合**,并给出一个**独立的库编辑器**。规格 `docs/plan/specs/spp-editors.md`。
  - **P1 option=组合**:`FaceVariant.pieces`(a1-only)→ `parts: VariantPart[]`(任意 type,面局部 u/v/w
    单位系)。"阻挡花瓶"=`a4 模型 + b4 stop`、"双柱通行"=`a4×2 无 stop`;legacy `pieces` 自动 lift 成
    a1 parts(零迁移)。`partToBox` 泛化 `pieceToBox`(加内向深度)。
  - **P4 变体身份=稳定 key**:面从"数组下标"改为可用**稳定 `key`** 引用(对齐 SPP-Core §3.2.4 的
    "option=不透明引用",修掉下标漂移);`getVariant` 双读(string=key / number=legacy 下标),存量
    index 源零改动。
  - **P2/P3 SPP 粒子编辑器**(`?tool=stylepack`,**独立于 world 应用**):选库 → 选池(挡/通)→ 选变体 →
    改变体 JSON(parts 组合)→ **活体 3D 预览** → 导出 / publish CID。预览用一个精简 Engine harness
    (`StylePackPreviewLoader`,路径 b)复用整条渲染管线、不 boot 世界。
  - 验证:engine 新增 `spp-parts`(5)+`spp-key`(5),**509 全绿**;e2e `stylepack-editor.spec.ts`
    (把变体改成 a4+b4 花瓶 → 预览真重展开成 6×a4+6×b4)。待续:2D 面编辑、契约守卫、CID 冻结、Editor 1 沙盘泛化。
- **SPP 完整协议落地 + b6 正名 `spp`(A–E 五工作流)**:把 SPP 从"只做了 Unfold"补齐到
  **完整协议**,兑现"在 world 里高速搭 + 一键换风格"。规格 `docs/plan/specs/spp-protocol-full.md`。
  - **A 正名**:b6 附属物 `particle` → **`spp`**(承载的是弦粒子 CHUNK,按协议名更准);typeId
    `0x00b6` 字节稳定、`AdjunctType.Particle` 留 @deprecated 别名,历史数据/关卡零迁移。
  - **B StylePack 外部化 + 风格可调/秒换**:硬编码 theme → 数据化 `StylePack`(可 CID/URL 寻址,
    同 audio/video 的 `{raw,format}` seam);内置 `brick`/`garden` 包;`world.styleOverride` 一键给
    整个世界换皮、活体重展开。**前端**:SPP 沙盘加 `风格` 切换器(basic/brick/garden)——**同一批
    cell 秒换风格**(brick 变色、garden 变几何),3D 实证。
  - **C superposition + collapse**:cell 可带 `faceOptions`(每面候选串),引擎 mulberry32 确定性
    坍缩(seed=块+cell+面);authored `faces` 跳过坍缩(兼容)。兑现协议"AI 出叠加态、引擎坍缩"。
  - **D 递归细化**:cell 可嵌 `refinement`(更细的子 chunk);子 cell **继承父面**作边界、内部默认
    连通、细者拥有跨层平面(消双墙);LOD `maxLevel`/`budget` 门控展开深度(粗回退不静默)。
    `?level=refine` 实证:同源粗 4m 盒 + 细 2m 房共存。
  - **E L2 二进制**:补齐 `CollapseCodec.encodePayload`(raw+RLE)+ `SppL2` 桥(已坍缩 chunk ↔ L2,
    同展开 round-trip),紧凑 CID 存储。
  - 验证:engine 新增 32 单测(499 全绿)+ e2e `spp-style`/`spp-refine`,14 SPP 回归 e2e 仍绿;
    Three.js 层界零 import。`ParticleCell`/`ParticleFace` 保留(协议正确名)。
- **世界中枢 `?level=world`(传送门串联两个体验)**:出生在中枢块 `[2026,705]`,走进**西门**
  传送到演示场景(`[2048,2048]`,保持原样)、走进**东门**传送到微缩仙剑「灵草记」(迁到
  `[2030,705]`),各目的地带"返回中枢"门。证明 teleport 是**同世界内**机制——三处共用一个
  数据源,门 = 纯 b8 配方(walk-in trigger 发 `player.teleport` 认锚点名,跨未加载块经
  `dataSource.view` 解析)。xianjian 零绝对 adj-id 耦合故按块坐标平移即可复用;新世界经
  `scenes/worldHubScene.ts` 程序化组合 hub+demo+xianjian,**不动**默认 `/` 与 `?level=xianjian`
  (二者 e2e 仍绿)。e2e `world-hub.spec.ts`(出生→西门→返回→东门全程走通)。
- **书本 adjunct(e4 book)**:3D 场景里可点开翻页读文字的面板——藏书/信件/告示/
  教程/图鉴。e 系媒体面板家族第 4 位(e1 链接 · e2 音频 · e3 视频 · **e4 书**):
  面板 + 资源 + 点击行为;slot 7 `pages`=内联 `string[]`(开发期明文)或解析为
  `string[]` 的 IPFS CID(生产,大段文字不入地块行)。点击经 `interact.primary` →
  客户端 `openBook` → `BookReader.tsx` 翻页(上/下一页 · 页码 N/M · 端点钳制不回环
  · 方向键/Esc · 重开归零);翻页是**纯视图动作**,页码状态留客户端(同 e1 的
  `window.open` 纪律),引擎只渲染书体 + 承载文字。定位=对话树的**无生命线性孪生**
  (同为「台词」文字,书=物件上的线性阅读、对话=角色上的分支会话,互不替代)。
  demo 场景放了一本《八爪印记·残卷》(5 页)。规范 `protocol/cn|en/adjunct-types.md §14`
  (含范例行)+ 引擎单测 `adjunct-book.test.ts`(7)+ e2e `book.spec.ts`(全流程通关)。
- **多 Avatar 可选 + 运行时换装**:`Engine.setAvatar`/`EntityFactory.swapAvatar`
  (复用加载路径、释放旧模型引用、重算 scale-to-1.8/footOffset、重启动画状态机)+
  客户端 `AvatarPicker.tsx`(选择持久化 DraftStore meta)。新增两套带动作素材
  soldier(名称相等契约 Idle/Run/Walk)/robot(正则回退 Idle/Walking/Running/Jump);
  `Engine.avatarInfo()` 暴露 clips/state/activeClip/height/footOffset 供验证。
  证实 avatar-animation 引擎链路正常(旧 avatar "无动作" 是素材只带单条未命名剪辑,
  非引擎问题)。默认化身改为 soldier(33,开箱即有完整行走动作)。e2e `avatar-select.spec.ts`。
- **化身朝向逐模型修正(per-model facing)**:外部 GLTF 各有各的"朝前"约定(±Z),
  原全局 `AVATAR_FACING=π` 常量对不齐——soldier 会背对颠倒。改为
  `AvatarComponent.facing`(yaw 弧度)逐模型参数,`CameraRig` 施加 `playerYaw+facing`,
  经 avatar 目录 author + 持久。实证:soldier=0、legacy/robot=π(无通用值)。
  规范化到 `avatar-animation.md §7.1`(对齐参数:facing/scale/footOffset)。

### 文档
- **新增世界总览(protocol/overview,cn/en 双语)**:一页讲清 Septopus 世界的构成
  (宇宙←世界←地块←附属物)、环境推导(时间/天气=链源纯函数)、玩法回路与"为什么这样
  设计",作为协议"从这里开始读"的入口;protocol README、docs README、旧
  architecture/overview 均交叉指向。
- **术语根治:SPP 撞名冲突(2026-07-04)**——**SPP 专指弦粒子协议**(String Particle
  Protocol,独立仓 ff13dfly/spp-protocol);坐标一律改称 **Septopus 轴序**、动画改称
  **Septopus 动画**(协议/docs 全量清理,弦粒子正统用法保留);代码标识符同步改名
  (`sppToEngine`→`septopusToEngine`、`teleportSpp`→`teleportSeptopus`、
  `SPPPlayerState`→`SeptopusPlayerState` 等,49 文件;localStorage 键
  `spp_player_state` 因用户数据兼容保留)。术语纪律钉入 protocol/README 与 CLAUDE.md。
- **协议层补齐至发布形态(cn/en 双语)**:新增 `adjunct-types.md`(18 型逐槽位规范)
  与 `determinism.md`(PRNG 基准、8 个确定性钉点、一致性验收清单);trigger 补全
  动作词汇(setSpawn/enterGame/teleport + 传送锚点槽);block 补 raw 五元组;
  world 补坐标与旋转契约;protocol README 版本化(v0.1)+ 三层文档模型。
- docs 树清理:旧引擎时代文档(旧 changelog、VBW 入门、早期构思稿)归档
  `docs/legacy/`;`getting-started` 重写对准现行 Engine API;docs/根 README 三层导航。

## [0.1.0] - 2026-07-04

首个公开版本:独立 3D 虚拟世界引擎(TypeScript ECS)+ 无链 PWA 桌面客户端。

### 引擎核心
- **链完全解耦**:`engine/src` 与 `client/desktop` 零 `@solana` 依赖;链作为可选
  发布插件(`IChainPublisher` 注入),local-first(草稿 IndexedDB + 内容寻址 CAS)。
- **ECS 世界**:4096×4096 块(16×16m)流式加载;**18 个内置 adjunct**(墙/盒/光/
  模型/水/锥/球/碰撞体/物品/弦粒子/触发器/生成器/NPC/轨道/生成式内容/链接/音频/视频);
  确定性步进(`engine.step(dt)`)支撑 headless 测试。
- **五种模式**:Normal / Edit(palette 放置+撤销)/ Game(区域门控,trigger 承载
  进入 + per-game exitPolicy)/ Ghost / Observe。
- **碰撞三形状**:box AABB / ball 圆柱(圆形足迹绕行)/ slope 楔形坡(顶面高度
  函数,任意竖直轴 yaw)+ step-over/悬停/深嵌救援三重安全网。
- **昼夜与天气**:平滑晨昏、确定性天气派生、雷雨闪电。

### 玩法系统(F1–F4 全落地)
- **F1 调度/生成**:delay/spawn/despawn 动作 + b9 定时生成器。
- **F2 NPC**:数据状态机(stay/wander/follow/flee/return + JSONLogic 转移)、
  确定性游走、对话定身。
- **F3 战斗**:damage/projectile 动作、NPC hp/死亡掉落、点击攻击动词(ba slot 6)、
  随体接触伤害(slot 7)、玩家 HP/重生。[spec](docs/plan/specs/combat-damage.md)
- **F4 对话/任务**:对话树纯数据文档 + 客户端对话 UI;任务=flags 配方。
  [spec](docs/plan/specs/dialogue-quests.md)
- **传送/传送门**:锚点制 `player.teleport`(双侧许可)+ 2D 地图快速旅行。
  [spec](docs/plan/specs/teleport-portal.md)
- **完整 RPG 实证**:仙剑微缩「灵草记」——纯数据关卡,e2e 全程通关。

### 内容与创作
- **AI 造物**:自然语言 → GenerationDoc → 预览 → 建造(千问/Gemini/mock 网关,
  生成器目录=motif 模板)。[spec](docs/plan/specs/ai-authoring.md)
- **世界内游戏三模式**:A 外部 app / B 原生 System(台球·麻将·射击·叠叠乐,
  含 rapier 刚体物理)/ C 纯数据(跑酷·过山车·RPG)。
- **背包/物品协议**:seed 确定性推导(跨引擎同 seed 同物品)、原子拾取、会话持久化。
- **2D 世界地图**:视口流式、非全局索引、传送锚点标记。
- **弦粒子 SPP** 与 **coaster 轨道**(Catmull-Rom tube)。

### 工程
- CI(push/PR 快门 + nightly 全量 e2e);引擎 461 单测/系统/场景测试;
  ~37 个 Playwright e2e;Three.js 层边界机检(`render/` 之外零 import)。

[Unreleased]: https://github.com/septopus-rex/world/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/septopus-rex/world/releases/tag/v0.1.0
