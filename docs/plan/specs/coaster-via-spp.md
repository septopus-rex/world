# 用 SPP 搭建过山车 — 设计文档（Coaster via SPP）

> **状态**：设计稿（未落地）。本文把"用 SPP 表达过山车"拆成可落地的部件 + 分期。
> **前提认知**：SPP 管的是**连通/拓扑**(哪些面连通)，**几何如何实现交给 theme**(可插拔)。
> 所以一段轨道 = 一个 cell + "两个开放面"，开放面对决定这段是直轨/弯轨/坡轨；
> theme 把"面对"渲成对应的 **tube 几何**。SPP 建"轨道"，一个运动系统让"车"跑起来。
> **配套**：SPP 协议见 `spp-integration.md`、`docs/features/spp*.md`；tube 图元见 `engine/src/render/MeshFactory.ts`（G4-1 已加）。

---

## 0. 核心模型

把过山车重映射到 SPP 的 cell/face 模型（face 顺序 = `[Top, Bottom, Front(S), Back(N), Left(W), Right(E)]`，SPP 坐标 X=东 Y=北 Z=高）：

| 过山车概念 | SPP 表达 |
|---|---|
| 一段轨道 | 一个 cell（4m，可按 level 细分到 0.5m） |
| 轨道进/出口 | cell 的**开放面**（state=open）；普通轨道段恰有 **2 个开放面** |
| 这段是直/弯/坡 | 由**开放面对**决定（见 §1 件表） |
| 轨道几何（钢轨曲线） | **coaster theme** 把面对映射成 tube 件 |
| 整条轨道路径 | 沿连通图把相邻 cell 串起来的**中心线** |
| 车厢 | 沿中心线运动的 cart（运动系统，非 SPP） |

**关键洞察**：`state` 在过山车 theme 里语义是"**轨道是否经过此面**"，而非小屋 theme 里的"墙/门/窗"。同一套 cell+face 数据，换 theme 即换语义/几何。

---

## 1. 轨道件表（面对 → tube 件）

6 个面、恰 2 个开放，共 **15 种无序面对** = **3 直 + 12 弯**：

- **对面对（3）→ 直轨**：Top-Bottom（竖直）、Front-Back（沿 N/S）、Left-Right（沿 E/W）。
  中心线 = 穿过 cell 中心、连接两面中心的直线。
- **邻面对（12）→ 90° 四分之一弧**：如 Left-Bottom、Front-Top、Back-Right…
  中心线 = 从一面中心到另一面中心的**四分之一圆弧**，在两端**与面法线相切**。

**朝向无需 cell 旋转**：`Left-Bottom` 与 `Left-Top` 是不同面对 → 不同件，连通对本身就编码了方向。这正好绕开 SPP v1 "no cell rotation"。

**坡/爬升/回环**：邻面对里含"水平进、竖直出"的弯（如 Front-Top），串起来即上坡、下坠、回环——15 件集是**轴对齐 90° 网格过山车的完整基**（RollerCoaster Tycoon 同理）。

**端点/特殊**：1 个开放面 = 轨道端点（缓冲/站台）；≥3 开放面 = 岔道（**v1 不做**，见 §6）。

---

## 2. 跨格连续性（平滑相接的约束）

每个 tube 件必须**在开放面的中心、沿该面法线方向进出**。这样：

- 相邻 cell 共享面 → 一个件的出口点/切线 = 邻件的入口点/切线 → **C¹ 连续**（位置+切线都接上）。
- 直件：两端在对面中心，切线 = 轴向。
- 弯件：四分之一弧，端点切线 = 两面法线 → 90° 平滑过渡。

平滑度受网格量化限制（4m，可用 level 细到 0.5m）——非无限平滑，但网格化过山车本就如此，足够。Banking（过弯倾车）是 cart 朝向的细化，归运动系统（§4），不进几何。

---

## 3. 几何落地：coaster theme + track adjunct

现状：`Expander` + `Variants`（basic theme）只发 **a1 方块面板**（`pieceToBox`）。过山车要发 **tube 几何**，所以需要：

1. **track adjunct（新）**：一个 tube-based 的 adjunct 类型，raw 携带"件类型 + cell 包围盒"，transform 用 `MeshFactory` 的 `tube` 图元（G4-1 已加）按件的中心线控制点挤出。
2. **coaster theme（新）**：经 `registerSppTheme` 注册；其展开逻辑 = 读 cell 的开放面对 → 查 §1 件表 → 发一行 track adjunct（带该件的中心线控制点）。即把"面对 → 件几何"做成查表。
3. **Expander 扩展**：当前 expander 对每个 closed 面发 box；coaster theme 改为"按 cell 的开放面对发一段 track"。可在 expander 里按 theme 分派（basic 走面板逻辑，coaster 走件逻辑），或 theme 自带展开函数。

产物仍是**标准派生实体**（与 BlockSystem 的 b6 即时展开/重展开一致，G4-3 已通），`derivedFrom` 标记、只持久化 b6 源行——分发友好。

---

## 4. 运动系统：CoasterSystem（车沿轨道跑）

SPP 给"轨道"，车要跑需要新系统：

1. **路径提取**：从连通图走出有序中心线。把所有 coaster cell 按"开放面相邻"连成图，从端点（1 开放面）或指定起点出发，沿开放面走到邻 cell，串接各件的中心线 → 一条连续 polyline/Catmull-Rom 路径，弧长重参数化。
   - **连通图是 SPP 白送的**：连通既喂几何(theme)，又喂路径(cart)。
2. **cart 运动**：cart 实体沿路径弧长 `s` 推进。速度模型二选一：
   - **重力驱动**（真实感）：势能↔动能，`v² = v0² + 2g·Δh`（Δh = 高度变化），过顶最慢、下坠最快。
   - **脚本速度**（简单）：恒速/分段速度。
   - cart 位置 = `path.point(s)`，朝向 = 路径切线（+过弯 banking 的 roll）。
3. **乘骑**：玩家 mount cart → 位置/相机锁到 cart（复用移动平台跟随 / 一个 mount 机制），到站 dismount。屏蔽行走输入。

确定性：`step(dt)` 沿弧长推进是纯运动学，e2e 可逐帧断言"第 N 帧 cart 在弧长 s / 过顶点时速度最低"，比角色物理还好测。

---

## 5. 复用 vs 新建

**已就绪可复用**：
- SPP cell/face 数据模型 + `Expander` + theme 注册表（`registerSppTheme`）。
- **tube 图元**（`MeshFactory` G4-1）——直接给 track 件成型。
- BlockSystem 的 b6 即时展开 / 重展开 / 派生清理（G4-3）。
- SPP palette + 面编辑器（G4-3）——作者"选开放面"的 UX 现成（语义改为"轨道经过"）。
- 移动平台跟随 / mount 雏形——给 cart 乘骑。
- Catmull-Rom 路径数学（tube builder 内）——给 cart 路径。

**需新建**：
- track adjunct（tube-based 派生目标）。
- coaster theme（面对 → 件 查表 + 展开为 track）。
- 路径提取（连通图 → 有序中心线）。
- CoasterSystem（cart 运动 + 朝向/banking + mount/dismount）。

---

## 6. v1 限制 / 开放问题

- **岔道/合流**（≥3 开放面）：v1 不做，cell 恰 2 开放面 = 一条无分支轨道。
- **平滑度**：受 cell 网格量化；用 level 细分换更顺，代价是数据量。
- **Banking 模型**：过弯倾角怎么算（按曲率 / 作者标注）——待定。
- **cart 物理**：重力驱动 vs 脚本速度——v1 建议脚本速度（可控、好测），重力驱动作为 M3。
- **起点/方向**：环线 vs 开线；多车厢编队——后续。
- **件库扩展**：除 90° 弯，是否要更大半径/缓和曲线（需多 cell 组合或新件）。

---

## 7. 分期落地

| 里程碑 | 内容 | 验证 |
|---|---|---|
| **M1** | track adjunct + coaster theme：手写 b6（coaster theme）→ 静态轨道几何可见（直+弯+坡）。复用 expander + tube。 | vitest：面对→件展开正确；e2e：轨道渲染可见 |
| **M2** | 路径提取 + CoasterSystem：cart 沿静态轨道跑（脚本速度），确定性步进。 | headless：cart 弧长推进、过连接点连续；e2e：cart 跑完一圈 |
| **M3** | mount/dismount（玩家乘骑）+ 重力驱动 + banking + 多件平滑。 | e2e：上车→过弯→到站 |
| **M4** | 作者闭环（SPP 编辑器 coaster theme：选开放面）+ 分发（market 角度：一份连通数据换 theme = 过山车/管道/水渠）。 | — |

> **首个可验证切片 = M1+M2**：手写一小段轨道(coaster theme) + cart 跑通，确定性 e2e。与 SPP M1+M2 的打法一致。

---

## 8. 一句话

过山车不是"SPP 形状不对"，而是"**做一个 coaster theme（面对→tube 件）+ 一个 CoasterSystem（cart 跑）**"。SPP 的连通图同时喂几何与路径；tube 图元已就绪；难点在件库的跨格切向连续 + cart 运动模型。**先 M1（看到轨道）再 M2（车能跑）**。

---

## 9. 核实与修正（2026-06，对代码 grounded + 对抗验证）

> 前面 §3/§4/§7 的两个前提被代码核实**纠正**：都点到真问题，但都是「**待建**」，不是现成或受尺寸限制。

### 9.1 运行机制：「Game 模式 = 数据全缓存」是**意图，未实现**

- `World.setMode(Game)` 只 fire-and-forget `system.preload {scope:'all'}`（World.ts:302），但该通道**零订阅者**（EventTypes.ts:18 声明 + World.ts 发射，全仓再无 reader/.on）。
- 加载/淘汰路径 `DesktopLoader.handleGridRequest`（~259）**完全不读 `world.mode`**：固定 5×5 窗口（`extend=2`，WorldConfigs.ts:38）+ 无条件 10s TTL 淘汰（`EVICT_TTL_MS`）。唯一对块特判的模式是 **Edit**（BlockLODSystem 强制近 LOD）。`SystemMode.ts:17` "Block content is pre-loaded" 是注释意图，无代码。
- **结论**：进 Game 模式当前对块加载**毫无影响**，不能靠它消解跨块问题。但**建起来便宜**：no-evict 原语已有（`Engine.injectBlock` 一次性加载、对这些 key 永不 `removeBlock`、`blocks.syncVisibility` 控显隐；`extend` 可变）。目标是**有界的过山车区（9–49 块）一次性注入 + 不淘汰**，而非「预加载整图」（数据源是本地 mock，无后端，整图预载不现实）。
- **对 §4 的影响**：**全缓存有界区后，cart 可从常驻块现拼路径，「烘焙全局路径」降为可选**——仅当要"从开放世界 Normal 模式（5×5 滑窗 + 淘汰）里骑"时才必需。

### 9.2 几何「放不下」？不会——但**tube 目前无法作为 adjunct 存在**（真正的前置）

- **几何上无障碍**：block 16m（仅水平 2D 分块 + 每块标量 elevation，Coords.ts:4 / BlockSystem.ts:66）；cell 4m→0.5m（Expander.ts:47）；tube **无尺寸上限**（Catmull-Rom 挤出，MeshFactory.ts）；**12m 回环装进一个 block**；大曲线一根大 tube 或拆多 cell。`block.max`（每块 adjunct 上限）**配置里有、代码无人强制**（WorldConfig.ts:44 仅类型 + WorldConfigs 字面量，全仓零使用）。→ **没有组件因尺寸放不下。**
- **被对抗验证纠正的关键点**：不是"能放下但要拆"，而是 **tube 轨道目前通过任何 adjunct 路径都无法表达**：
  - `tube` 只是 `MeshFactory` 渲染图元，**只有 `tests/unit/mesh-factory-tube.test.ts` 直接调用**；**无任何 adjunct 插件**发 `type:'tube'` 或填 `params.path`（全仓 grep 空），`RenderParams.path` 字段从无生产者。
  - SPP `expandParticle` **硬编码只发 `0x00a1` 墙 + `0x00b8` 触发器**（Expander.ts:123/132），variant 是 box u/v 板（Variants.ts，BASIC_THEME）→ **SPP 发不出 tube**。
  - 注册表无 tube/track 类型（AdjunctRegistry：a1/a2/a3/a4/a5/a6/a7/b4/b5/b6/b8/e1）→ **也不能直接放置**。
- **结论**：真正缺的原语是**一个 tube-based track adjunct 类型**（plugin + 注册 + serialize/deserialize + AABB 碰撞），把渲染图元接进 ECS/数据管线。SPP cell 仍可做**拓扑/足迹/触发**标记，但**钢轨本身必须是 tube adjunct**（SPP→tube 还需扩 expander/theme 发射 track 行）。

### 9.3 修正后的分期（M0 前置）

- **M0（新，前置）**：建 **tube track adjunct 类型**——渲染图元 → adjunct 数据管线（raw=件类型+控制点、transform 用 tube 图元、序列化、碰撞）。这是一切的前提。
- **M1**：coaster theme / 直接放置 → 手写一小段轨道（直+弯+坡）静态可见。
- **M2**：路径提取 + CoasterSystem（cart 脚本速度跑），确定性 e2e。
- **M2.5（新）**：有界区**全缓存机制**（inject-once + 不淘汰，或 `system.preload` 接订阅 / `handleGridRequest` 加 Game 分支）——支持大型跨块过山车；之后全局路径烘焙才按需。
- **M3**：mount/乘骑 + 重力驱动 + banking + 多件平滑。

### 9.4 开放风险（核实附带）

- **无 "fixed-set / never-evict" 加载路径**：未建之前，>5×5 的过山车在 Normal 模式会撕裂，Game 模式也救不了。
- **`block.max` 无强制**：密集轨道 + 大 tube 无护栏，过密只会悄悄掉帧。
- **全缓存 9–49 块的内存仅由代码结构推断，未实测**（headless，无 GPU/heap 基准）。
- **每块标量 elevation + 仅 2D 分块**：强竖直/3D 跨块布线（多块螺旋/回环）可能与"每块单一海拔"模型冲突，需验证多块回环能否干净表达。
- **运行时现拼路径依赖每帧每块常驻**：一次淘汰或 `BUILD_BUDGET=4/帧` 的加载抖动就可能丢段——烘焙路径或保证全常驻可缓解。
