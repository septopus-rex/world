# 2D 世界地图 (2D World Map) — 设计规格

> 状态：**规划中（未实现）**。本文捕获设计与数据模型，避免遗漏；实现分期见 §5。

## 0. 决策变更：解除「有意不移植」

旧 `CLAUDE.md` 把"完整 2D 地图页"列为**有意不移植**，理由是 (a) 当时 3D 引擎能否顺利
迁移未定、(b) 超出桌面 PWA 声明范围。**现解除**：3D 引擎迁移已确认成功（parity 补齐、
旧引擎退役），2D 地图重新纳入计划。

**关键认知（澄清此前的误判）**：2D 地图**不需要全局块索引**（不需要"一次拿到全世界
4096×4096 / 所有人的块"）。它与 3D 世界**共用同一条「视口窗口化、按需流式」的块数据
通道**——平移时按视口边界算出可见块范围，拉缺失块、踢出视外块（TTL）。这与新引擎现有的
`block.need` / `handleGridRequest` 完全同构，**卡点在渲染层不在数据层**。

## 1. 旧引擎参考实现（已实现，作设计基准）

旧 JS 引擎归档于 `engine/backup/septopus/`（源码在 dist sourcemap），2D 地图由一对模块构成：

- **`control/control_2d.js`**（controller `con_two`）— 交互层：
  - `pan`（拖拽平移 canvas，`cvsPan` 累加偏移）、`zoom`（滚轮 + 浮动 bar `cvsScale`，
    缩放范围 `limit:[10,80]`）、`select`（点选块、描边 `#00CCDD`）。
  - 按钮 `map_reset`（复位到玩家）、`map_jump`（**传送到选中块**）。
  - 委托渲染给 `rd_two`（render module）；`env.last` 记录玩家上次块位以决定是否刷新地图。

- **`render/render_2d.js`**（renderer，基于 `lib/two.js` = Two.js）— 渲染 + 加载层：
  - `loadDetails(key, ck, force)`：以 `player.location.block` 为中心，遍历 `[-extend,+extend]²`
    窗口，**clamp 到世界边界 `[1..limit[0]] × [1..limit[1]]`**；对每个块 `structTop(cx,cy,world)`
    构造 2D 数据挂到块的 `"two"` 缓存链 `["block", dom_id, world, "cx_cy", "two"]`，读每个
    adjunct 的**顶面 `face_TOP`** 做**俯视 2D 投影**，按 `(cx-1)*side` 定位。
  - `grid()` 画块网格、`active()` 填充活动块、`getBlock(screenPos)` 屏幕坐标 → 块坐标。
  - 缩放显示范围 `range:18`；世界范围 `limit` 取自 `env.world.common.world.range`。
  - 数据：每个块有 `"two"`（2D 俯视派生）与 `"std"`（3D 派生）两套；2D 地图吃 `"two"`。

> 要点：旧实现就是**窗口流式 + 逐块顶面俯视投影**，中心跟随玩家、叠加 pan 偏移。新引擎照搬
> 此模型，仅把"中心"从玩家位置泛化为**可独立平移的地图视口中心**。

## 2. 新引擎映射（TypeScript ECS，chain-free）

### 2.1 数据通道：复用现有块流式

- 现状：`GridSystem`（玩家跨块）→ `block.need` 事件 → `DesktopLoader.handleGridRequest`
  拉 `(2*extend+1)²` 窗口，`EVICT_TTL_MS` 踢出视外块；`IDataSource.view(x,y,ext,world)`
  是**窗口查询**（当前 `DesktopLoader.view` 为 stub，实际由 gridRequest 驱动）。
- 2D 地图：把"窗口中心"从**玩家位置**改为**地图视口中心**（可独立平移/缩放），复用同一条流式：
  1. 平移/缩放 → 由视口（中心 + 缩放）算出覆盖的块网格范围 `[bx0..bx1] × [by0..by1]`；
  2. 对范围内**缺失**块发一次 map-scope 的块请求（与 `view()` / `block.need` 同语义）；
  3. 视外块按 TTL 踢出（与 3D 流式同策略）。
- **无需全局索引**：任一时刻只持有"视口窗口 + 本地草稿"。链模式下 `view()` 读链上注册表的
  同一窗口；纯模式喂本地 mock + `DraftStore`（已创作/存过的块自然出现在地图上）。

### 2.2 2D 渲染面

独立的 **canvas/SVG 2D 渲染层**（**非**现有 minimap 的 PiP 3D 相机，见 §3）：

- **v1（占用图）**：每块画为一个网格单元，按**占用 / 海拔 / `block.game` 标志**上色
  （可高亮**可玩区**，与 [game-mode-entry](../../systems/game-mode-entry.md) 联动）+ 玩家
  标记 + 网格 + 点选块。坐标经 `core/utils/Coords`。
- **v2（footprint 投影）**：俯视投影每块 adjunct 的 2D 轮廓（对应旧引擎 `face_TOP` 投影），
  由 adjunct 的 transform/几何派生 2D footprint，或给块加一个轻量 2D summary 派生。

### 2.3 交互

拖拽平移 / 滚轮（或缩放条）缩放 / 点选块 → 检视或**传送**（对应旧 `map_jump`，复位对应
`map_reset`）。可复用现有 minimap 的 block 点选（`pickMinimapBlock`）与 follow 思路。

## 3. 与现有 minimap 的关系（勿混淆）

| | minimap（已有） | 2D 世界地图（本规格） |
|---|---|---|
| 本质 | 俯视 **PiP 3D 相机**小窗 | 独立 **2D 渲染**（canvas/SVG）的可平移世界地图 |
| 数据 | 只显示**已加载的 3D 场景** | 自带**视口流式**，按需拉块（不依赖玩家在场） |
| 实现 | `MinimapSystem` + render pipeline | 见 §2，建议客户端层 |

二者**不同实现、不同用途**，并存。

## 4. 层级边界

建议 2D 渲染放在**客户端层**（`client/desktop`，纯 canvas/SVG + DOM，**不碰 Three.js**），
块数据经 `IDataSource` / Engine 事件获取——保持引擎 `render/` 层只管 3D（符合
[层级边界](../../../CLAUDE.md) 约束）。若要进引擎，需新增非-Three 的 2D 渲染后端，成本更高，
v1 不建议。

## 5. 分期

- **v1**：2D 渲染面 + 视口流式（平移/缩放/点选/传送）+ 块占用/`game` 上色 + 玩家标记。
  复用块流式数据通道与 `Coords`；客户端层 canvas/SVG。
- **v2**：adjunct 顶面 footprint 俯视投影（贴近旧引擎视觉）；多世界切换；标注/所有权（链模式）。

## 6. 待定问题

- 2D 视口的块请求是否复用 `block.need` 通道（加 `source: 'map'` 区分），还是给 `IDataSource`
  增一个显式 `mapView(bx0,by0,bx1,by1,world)` 批量窗口查询？（倾向后者：地图窗口可能远大于
  玩家 5×5，单独通道更清晰、便于链模式批量读。）
- 2D 与 3D 的块缓存/驱逐是否共享一套 TTL，还是各自独立（地图可能想保留更大窗口）。
- v2 footprint 的 2D 数据：运行时从 adjunct 派生，还是 collapse 阶段产出一份块级 2D summary。
