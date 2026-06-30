# 原生在场游戏 —— 缺口与落地（Native In-World Games）

> **用途**：追踪「直接在 3D 里玩游戏」这条 **Pattern B（原生在场：System 持逻辑、游戏对象即 adjunct 实体）** 从「核心交互回路跑通」到「真人可玩」的剩余缺口。
> **由来**：用三个案例对抗性验证了这条缝——`PoolSystem`（连续物理）+ `MahjongSystem`（离散回合）+ `ShootingRangeSystem`（一击一反应/运行时改色）。核心回路已证明通用（对象即 adjunct、System 持逻辑、点击→动作、确定性、`derivedFrom` 防序列化、`destroyAdjunct` 防网格泄漏）。本文记录这些案例**没触及**或刚补上的部分。
> **三种托管模式**（别混）：**A 外部 app**（GameSetting + GameRuntime + IGameApi + HUD，逻辑零引擎依赖、可服务端跑）·**B 原生 System**（本文，System 持逻辑、对象即 adjunct）·**C 纯数据驱动**（authored 块数据 + 通用 Trigger/Actuator/Flag/Health，**零专用代码**）。**跑酷 = C**（`core/levels/parkour.ts`，已落地+测；移动闯关/机关/门禁类用 C 就够，不该写 System）。选型口诀：**先问能不能 C，不能再上 B，需要服务端权威才上 A**。
> **配套**：内容寻址/资源见 `specs/mock-ipfs-resource.md`；可玩化总清单见 `PLAYABLE_CHECKLIST.md`；记忆 `native-in-world-game-pattern.md`。
> **更新**：2026-06-30 —— 打靶（第三案例）落地，**运行时改色通道补齐**（#1 改色子项 ✅）。2026-06-29 创建（双案例 gap 评估基线）。改一项就勾一项并更新本行。

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
2. **生命周期绑定**（#3）—— 不做，正常走动（块驱逐）就会把游戏走坏。**下一项**。
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
- [x] 牌面资产生成 + 注入 CAS（`client/scenes/mahjongFaces.ts`：34 种 canvas→PNG→`engine.ipfs.put`→CID；纯 ASCII+颜色，不依赖字体）。
- [x] `MahjongSystem.spawnTile` 在 faceUp 时写 slot7 = `faceCids[kind]`（`MahjongConfig.faceCids`，DesktopLoader 生成+缓存后注入）。
- [x] e2e：top-down 截图肉眼可读（数字+花色+风/箭），数据断言 14 明牌带 CID / 39 暗牌空白 / CID 经 CAS 解析。`test-results/mahjong3d-readable-faces.png`。
- [x] **关键修复**：`TextureScale.applyBoxWorldUV`（尺寸派生 UV 平铺，为墙/地设计）会把 0.24×0.36m 小牌面 UV 缩到 0..0.12，只采样到字形左下角空白→牌看着空白。新增 `material.fit`（`MeshFactory` 跳过平铺、用自然 0..1 UV 贴满整面，几何缓存键含 `:fit`）；牌面 spawn 后置 `material.fit=true`。**任何"贴满整图"的标签/贴花 box（招牌、二维码、motif 活图板）都该用 `fit`**。
- [x] **运行时改色/高亮（打靶案例落地）**：新增 `core/utils/Appearance.ts` `setEntityColor(world,eid,color)` —— gameplay System 一行改一个 adjunct 的颜色：写 `MeshComponent.colorOverride` + 标 `dirty` → `VisualSyncSystem` 推到 handle（`RenderEngine.updateObjectAppearance`）。**坑（已修）**：纯色 box/sphere 共享缓存材质，原地 `setHex` 会**染一片**；改 `updateObjectAppearance` 为 **clone-on-write 隔离**（`isolateMaterial`，并清 `userData.shared` 使 clone 随 mesh 释放——连带修掉 `setObjectOpacityIsolated` 那条 clone 继承 `shared=true` 的潜在泄漏）。数据驱动落点（非 core 直调 renderEngine）→ headless 可断言 `colorOverride`、e2e 断言真材质色。`ShootingRangeSystem` 命中翻红、litTime 后翻绿复位（无 destroy/respawn）。
- [ ] 球号（a7 球面）：贴图绕球面是 decal/UV 问题（非 slot-7 直贴），单列。
- [ ] 任意动态文字（实时分数/玩家名）：text→canvas 贴图路（仍开放）。

**关键文件**：麻将牌面：`render/MeshFactory.ts`(`fit`/`getGeometry`)、`render/TextureScale.ts`、`core/types/Adjunct.ts`(`MaterialConfig.fit`)、`core/systems/MahjongSystem.ts`(`faceCids`/slot7)、`client/scenes/mahjongFaces.ts`、`client/lib/DesktopLoader.ts`(`mahjongFaceCids`)。运行时改色：`core/utils/Appearance.ts`、`core/components/VisualizationComponents.ts`(`MeshComponent.colorOverride/opacityOverride`)、`core/systems/VisualSyncSystem.ts`、`render/RenderEngine.ts`(`isolateMaterial`)、`core/systems/ShootingRangeSystem.ts`。验证：engine `mahjong.test.ts`(9) + `shooting.test.ts`(8) + e2e `mahjong3d.spec.ts`(3) + `shooting3d.spec.ts`(1，真实点击→绿变红、其余不染)。

## #3 没有生命周期绑定（load / evict / persist）🔲

**现状（已核）**：
- 块驱逐销毁游戏对象：`BlockSystem.removeBlock` 销毁该块**所有**子 adjunct（牌/球在内；`derivedFrom` 只挡序列化、不挡驱逐）。Pool/Mahjong **都不监听驱逐**。
- 玩家走远 → 块驱逐 → 对象没了、table 组件实体悬空、System 持悬空 eid；而 DesktopLoader 的 `block.loaded {once:true}` 不再触发 setup → **游戏半死、无法恢复**。
- 无中途存档：两者每次 boot 重新发牌/摆球（背包+玩家位置走 DraftStore meta，游戏没接）→ 中途退出丢局。
- setup 硬编码在客户端（单块 once-key），非数据驱动 → 块无法「声明自己是球桌/牌桌」。

**方案（草案）**：
- System 监听块 load/evict（事件通道 `block.loaded`/驱逐），在所属块进出时挂起/恢复，而非靠客户端 once-key。
- 游戏状态走 DraftStore meta 通道（同背包/玩家位置）做中途存档。
- 数据驱动声明：块头/某 adjunct 声明「此处是 X 游戏」→ 通用实例化（替代 DesktopLoader 硬编码）。

## #2 输入只有「单击 → 离散动作」🔲

**现状（已核）**：
- 只有 `interact.primary`（一次 raycast 单击挑目标）。麻将打牌够用。
- 台球 `shoot()` 暴露天花板：瞄准需角度+力度，单击给不了 → pool 把击球**甩给键盘/HUD/API，场内无杆法瞄准**。无拖拽、无蓄力、无手势。

**方案（草案）**：场内连续/手势输入通道（drag 向量 + hold 时长），供「拖拽瞄准 + 蓄力」一类玩法；保持 System 不直接读输入（经事件）。

## #4 System 是单例，不是每实例 🔲

**现状（已核）**：`findTable` = `getEntitiesWith([...Table...])[0]`，单 `tableEid`/`ballEids`。世界里两张桌只追踪一张。

**方案（草案）**：游戏状态绑到 table 实体（已是组件），System 改为按实体集合迭代，去掉单例字段缓存。

## #5 没有「谁在玩」—— 交互无 actor 绑定 🔲

**现状（已核）**：`MahjongSystem.update` 忽略 `ev.actor`，任何人点到 human 手牌都打出；单一本地 `humanSeat` 写死。无坐下认领、无多人占座仲裁、无网络。

**方案（草案）**：座位认领 + 用 `interact.primary` 的 `actor` 做归属校验；多人/网络是更大议题，先做单机座位绑定。

## #6 没有非空间状态的外壳（HUD / 流程 / 相机）🔲

**现状**：轮次/剩牌/分数/力度条/胜负/重开 native 模式无处安放（Pattern A 外部 app 有 HUD 覆盖层）。相机：第一人称 pitch 自动回正（e2e 需 Alt+ArrowDown 锁），无「坐到桌前」相机预设。

**方案（草案）**：客户端通用「游戏 HUD」覆盖层（镜像 System 状态事件）；「坐下」相机预设（复用 Observe 绕目标）。

---

## 有意不做（非缺失）

- ❌ **完整规则/番种/胜负判定**：当初明确砍掉的 scope——双案例只验证「缝」，不做完整游戏规则。需要时按具体游戏单独实现，不属本缝基础设施。
