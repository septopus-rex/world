# Changelog

Septopus World 的版本记录。格式循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
版本号循 [SemVer](https://semver.org/lang/zh-CN/)(pre-1.0:minor=功能批次,patch=修复)。
条目从 conventional-commit 历史(`feat:`/`fix:`/`docs:`)整理,深度设计随条目链接到
`docs/plan/specs/*`。发版流程见 `deploy/RELEASE.md`。

## [Unreleased]

### 功能
- **多 Avatar 可选 + 运行时换装**:`Engine.setAvatar`/`EntityFactory.swapAvatar`
  (复用加载路径、释放旧模型引用、重算 scale-to-1.8/footOffset、重启动画状态机)+
  客户端 `AvatarPicker.tsx`(选择持久化 DraftStore meta)。新增两套带动作素材
  soldier(名称相等契约 Idle/Run/Walk)/robot(正则回退 Idle/Walking/Running/Jump);
  `Engine.avatarInfo()` 暴露 clips/state/activeClip/height/footOffset 供验证。
  证实 avatar-animation 引擎链路正常(旧 avatar "无动作" 是素材只带单条未命名剪辑,
  非引擎问题)。默认化身改为 soldier(33,开箱即有完整行走动作)。e2e `avatar-select.spec.ts`。

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
