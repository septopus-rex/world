# 基础运行数据落地审计(P9)

> 状态:审计+**修复记录**(2026-07-09;D1–D8 已处理完毕,见各项 ✅;剩余=D9+两条裁决,见 §2.9/§3)。架构面(服务/net/协议/启动链)收口后,
> 回头验收「基础运行数据是否真的落在数据里」——player/avatar/物品/游戏设置等。
> 依据:内容=数据纪律(CLAUDE.md)· AC-1 内容完备 · I4 无隐藏合成 · I7 观感分层
> (`full-data-migration.md`)。本文是缺口清单,供人工复核补漏;修复另行排批。

## 0. 判定标准(三桶)

| 桶 | 判据 | 归宿 |
|---|---|---|
| **A 世界语义数据** | 换一个引擎/上链后仍必须一致的(能力/化身/物品/游戏设置/物理) | **必须 JSON 文档**,经 envelope/CID 可上链,Rust 内核可读 |
| **B 协议默认值** | 数据缺省时的行为(各引擎必须取同一默认) | **协议文档钉死**(adjunct-types 槽位缺省的先例) |
| **C 客户端观感** | I7 明确非规范(灵敏度/FOV/HUD/抖屏) | 合法留在代码,协议里标注"非规范" |

一句话:**桶 A 进数据,桶 B 进协议,桶 C 留代码但要有名分。**

## 1. ✅ 已达标(实测确认)

`default.world.json` 的 `player` 段完整度超预期,以下全部**已是数据**:

- **出生** `start.block/position/rotation`(链启动时按锚定 CID 拉取,同一字段面)
- **体型** `body.shoulder/chest/body/head/hand/leg`
- **能力** `capacity.rotate/speed/walkSpeed/jumpForce/gravityMultiplier/ghostFlySpeed/voidRecover`
- **背包** `bag.max`;**默认化身** `avatar.resource=33/facing/scale/max`
- 世界配置其余段:`world/block/blacklist/debug` ✓
- 世界内容:levels/blocks/worlds/stylepacks 全 JSON ✓(P2/P7)
- 持久化:玩家位置/背包/globalFlags/oneTime 经 DraftStore meta ✓
- 时间/天气推导:协议 §3.1 已规范 ✓;化身动画状态阈值:avatar-animation.md v1 已钉 ✓

## 2. ⚠️ 缺口清单(逐项,按建议修复顺序)

### D1 · avatarCatalog 硬编码(桶 A)✅ 已修(2026-07-09)
`DesktopLoader.avatarCatalog()` 返回 TS 写死的 `{id, label, facing}` 三元组
(旅者 π / 士兵 0 / 机器人 π)。**化身目录=世界内容**;`facing` 是 per-model 数据
(注释自己承认"每模型各修各的,无通用值")。
→ 迁入 world 文档(如 `player.avatarCatalog: [{id,label,facing}]`)或独立目录文档;
`default.world.json` 现有的 `avatar.facing` 只覆盖默认那一只。
**验收 ✅**:目录进 `default.world.json player.avatarCatalog`(facing 弧度随行);
loader 读 `_worldDoc`(链注入的配置缺字段时回退内置文档);`avatar-select.spec` 绿
(两套动作契约+身体参数+重载持久)。

### D2 · Game Settings 是 TS(桶 A)✅ 已修(2026-07-09)
`games/{mahjong,pool,holdem}/setting.ts` ×3——game.md §2 明说 Game Setting 是
链上/IPFS **资源文档**,现状是 TS 常量(方法白名单/baseurl/init 全在代码里)。
→ 冻结为 `src/games/*.game.json`(或 settings/ 目录),经 CONTENT/envelope 解析;
registry 只留 id↔文档引用。**注意**:`methods` 白名单是安全面,文档化后加载时应
校验形状(envelope §2 先例)。
**验收 ✅**:三份 `games/<name>/setting.game.json` 冻结;registry 只留
id↔文档↔transport 绑定;三个 setting.ts 已删;`mahjong-server.spec` 绿
(数据声明的 baseurl 全链)。方法白名单形状校验留待 envelope 实施(P4.6)。

### D3 · ItemTemplates 是引擎 mocks TS(桶 A)✅ 已修(2026-07-09)
`engine/src/core/mocks/ItemTemplates.ts`——item.md 原话「模板=世界内容,引擎零内置」,
现状放在**引擎**的 mocks 目录由客户端 boot 时 register。
→ 迁 `client/core/src/items/*.item.json`(数据目录约定:一种数据一个文件夹),
loader 读数据注册;引擎 mocks 目录删除。
**验收 ✅**:`src/items/demo.items.json` 冻结(category 用协议数字枚举);loader 从
数据注册;引擎 `mocks/ItemTemplates.ts` 已删,引擎测试经 `tests/helpers/demo-items.ts`
读**同一份**客户端 JSON;inventory ×2(拾取/持久/钥匙门)+ xianjian headless 绿。

### D4 · DEMO_ASSETS 资产清单是 TS(桶 A,= A3 缺口主体)✅ 已修(2026-07-09)
`demoScene.ts` 的 `DEMO_ASSETS`(id→src/type/format/repeat)——resource.md §6 注册表
的 dev 本体。链启动路径靠网关 `/assets` 绕过了它,但清单本身未数据化,第二引擎
不知道 id 27=pyramid.gltf。
→ 冻结为 `src/assets.manifest.json`(名字沿 resource.md 词汇);ingest 逻辑读数据。
**验收 ✅**:`src/assets/demo.manifest.json` 冻结(11 条,path 裸路径);demoScene
只剩 path→src 的部署基址解析(环境,非内容);boot-and-render 绿。

### D5 · 玩家 HP 硬编码(桶 A/B 之间)✅ 已修(2026-07-09)
`EntityFactory.ts:73` `hp: 100, maxHp: 100`——不在 world 配置的 player 段。
→ 进 `player.capacity.maxHp`(数据),缺省 100 进协议(player.md)。
**验收 ✅**:`player.capacity.maxHp` 进数据;EntityFactory config-first(沿 bag.max
同款先例),协议缺省 100(player.md 原有 + world.md §9 表)。

### D6 · 引擎 Constants.ts 未分桶(桶 B/C 混装)✅ 已修(协议钉定,2026-07-09)
- `GRAVITY = -9.81 × 2`(注释"game feel"!)——**世界物理**:与 `capacity.gravityMultiplier`
  的关系要理清(基础重力该是协议默认值,world 数据给乘数;现状 ×2 是隐藏的手感私改,
  正是 I4 要抓的"配置外分支")
- `CONTROL_CONSTANTS`(鼠标/触屏灵敏度/死区)、`RENDER_CONSTANTS`(FOV/NEAR/FAR/小地图)
  ——**桶 C 合法**,但应在协议 I7 清单里点名"非规范"
- `TICK_RATE/DEFAULT_EXTEND(5×5 流式半径)/lodNear=40`——**桶 B**:影响仿真/加载语义,
  各引擎需同默认(lodNear 已可由 `world.performance.lodNear` 覆盖 ✓,缺省 40 应进协议)
**验收 ✅**:world.md **§9 引擎常量分桶**(cn/en)——B 桶钉值表(重力 −19.62 m/s²
诚实入协议、tick 0.1s、流式 5×5、lodNear 40、历法缺省、voidRecover 20、maxHp 100)
+ C 桶点名非规范(灵敏度/FOV/小地图/抖屏)。代码未动值,只给了名分。

### D7 · GlobalConfig 双源悬案 ✅ 已裁决+修(2026-07-09)
`engine/src/core/GlobalConfig.ts` 自称「On-Chain shared values across all 96 worlds」
(range 4096/block 16/time epoch…),而 P7 后同类信息也在 `default.world.json`。
**两份真相并存**:引擎若干处(Coords/Constants/EnvironmentSystem)直接 import
GlobalConfig,不走注入的 world.config。
→ 需定谁赢:建议 GlobalConfig 降级为**协议常量**(全世界共享、不可被单世界覆盖的
那部分,如网格 4096/块 16m——写进 world.md §1),其余(time epoch/speed)并入世界
文档;引擎读注入 config,GlobalConfig 只剩协议兜底。
**验收 ✅**:裁决=GlobalConfig 降级为「协议不变量(world.range/block/diff/max,
world.md §1/§9)+ 历法缺省」;世界文档新增 `time` 段(epoch/speed),
EnvironmentSystem **数据优先**(注入 config 赢,GlobalConfig 兜底);头注已改。
Coords/Constants 引用的 BLOCK_SIZE 属协议不变量,合法保留。引擎 554/554。

### D8 · moduleCatalog 喂入路径(桶 A 半)✅ 随 D4 已修
`Engine.setModuleCatalog(models)` 由客户端从 DEMO_ASSETS 推导喂入(palette 每模型
一钮)。D4 资产清单数据化后此项自动理顺——目录=清单里 type=module 的投影。
**验收 ✅**:目录=清单里 type=module 的投影,随 D4 自动数据化。

### D9 · PlayerBodyComponent 硬编码 ✅ 已裁决+修(2026-07-09,用户定案①)
排查悬案 1 时发现:`player.body` 段(shoulder/chest/…,老 VBW 形状)**引擎零消费
=死数据**;而引擎实际用的体格参数在 `EntityFactory` 硬编码另一组:
`height 1.8 / eyeHeight 1.7 / stepHeight 0.5 / crouchHeight 0.9 / jumpHeight 1.2 /
fallDeathHeight 12`——这些是玩法语义(桶 A/B)。
**裁决=①**:死 `body` 段已删;新立 **`player.physique` 体格基准**(六参数进
`default.world.json` + WorldConfig 类型 + 引擎 mock 配置),EntityFactory
config-first;**avatar 换装按基准修正**(create 与 swapAvatar 双路径的缩放目标
都读 `physique.height`,相机读 `eyeHeight`)。player.md 注记重写(cn/en,原
"capacity 未接线"陈述已过时,一并纠正)。验收:引擎 554/554 + avatar-select e2e
(身高≈基准/契约/重载持久)。

## 3. 悬案核销记录(2026-07-09 排查)

1. `player.body` → **确认死数据**,升级为 D9(见上)。
2. `voidRecover` → ✅ 已收口:类型注释+config 可覆盖(缺省 20),本次进 world.md §9 表。
3. NPC 移动速度缺省 = 1 m/s → ✅ **已钉进 adjunct-types §9.1**(cn/en,规范注记);
   speed 本就是 ba 行为文档里的数据字段,这里钉的是"数据没写时"的协议缺省。
4. e2 音频 `refDistance` 缺省 8m → ✅ **协议表与代码一致**(adjunct-types §13 已写)。
5. popOut/深嵌救援 → ✅ **已钉进 player.md**(cn/en:弹至固体顶面、0.1m 触发余量、
   ≤0.08m 子步不误触)。

## 4. 剩余清单(2026-07-09 二轮修复后)

- ✅ **D1–D9 全部处理完毕**;悬案 1–5 全部核销。
- 🔲 仅余一项挂靠:setting.game.json 的白名单形状校验(随 envelope P4.6 实施)。
- 验证=引擎 554/554 ×2 轮 + e2e 六连绿(avatar-select×2/boot/inventory×2/
  mahjong-server)+ 双壳 tsc + 协议 cn/en 同步(world.md §9、player.md、
  adjunct-types §9.1)。

## 5. 关联

- `full-data-migration.md`(P9 挂靠;A3 缺口由 D4/D8 收口;I4/I7 由 D6 落实)
- `protocol/cn|en/{world,player,game,item,resource}.md`(D5/D6/D7 的规范落点)
- 记忆:`bitcoin-anchor-boot-chain`(判定标准 A 桶的"能否放进启动链"准绳)
