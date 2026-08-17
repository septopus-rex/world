# SPP 粒子多主题设计规范 (SPP Theme Particles Specification)

Status: **设计与实施中** · 2026-08-17  
关联规范: `protocol/` · `docs/plan/specs/spp-editors.md` · `docs/plan/specs/spp-protocol-full.md` · `.claude/skills/spp-particle/SKILL.md`

---

## 1. 概述与核心规范

SPP 粒子（StylePack）是 Septopus 引擎中可复用、可内容寻址（CID-able）的**归一化单位胞视觉与几何词汇库**。
每个 StylePack 定义了在归一化局部坐标系（Unit Frame: `[0,1]³`）中的两池面变体（`closed` 阻挡池 与 `open` 通行池）以及不属于任何面的组合件（`prefabs` 独立家具/陈设）。

### 1.1 材质与调色板准则 (`Palette.ts`)
- **严禁裸硬编码**：不使用无质感的纯饱和原色，优先使用带 PBR 属性（金属度 `metalness`、粗糙度 `roughness`）的内建调色板索引（`1..255`）；
- **常用材质索引表**：
  - `STEEL (11)`: 高反光工业钢材（roughness 0.35, metalness 0.9）
  - `BRASS (12)`: 黄铜/金色合金（roughness 0.4, metalness 0.85）
  - `DARK_METAL (13)`: 暗黑冷轧重合金（roughness 0.25, metalness 0.6）
  - `GLASS (14)`: 防辐射/通透镀膜玻璃（roughness 0.08, metalness 0.1）
  - `CONCRETE (4) / WEATHERED (5)`: 混凝土与旧化基座
  - `TIMBER (7)`: 原木与榫卯构件
  - `BRICK (6)`: 陶土砖石
  - `SLATE (9)`: 深灰板岩/深色底板
  - `TEAL (27)`: 赛博青色高能发光/冷光
  - `ORANGE (25) / YELLOW (24)`: 工业警示、琥珀色核心
  - `PURPLE (28) / PINK (29)`: 霓虹暗紫色与粉色高光
  - `NEAR_BLACK (31)`: 极深暗底座

### 1.2 几何分层与深度纪律
- **层次丰富度**：单个 Option 避免单箱体（"白模"），提倡使用 3~10 个 Part 组合出底板、凹槽线框、凸出面板与发光件；
- **深度差（`w / sw`）**：面变体的构件深度 `sw` 建议保持在 `0.02 ~ 0.10`（相当于 0.08m ~ 0.40m），防止穿透对侧面；
- **加法几何与凹槽**：凹槽/洞口采用"让开空间"的不放构件方式，避免后方构件被前方实心面整体遮蔽；
- **Prefabs 碰撞体纪律**：Prefabs 自带 `b4` stop 构件时必须设置 `hidden: 1`（即 props 末位为 1），且足迹内缩，不得与可视几何共面以防 z-fighting。

---

## 2. 四大主题详细设计清单

### 主题 1：⚡ 赛博科幻舱室（`cyber`）[首期实施]
- **设计基调**：近未来工业空间站与赛博机械舱室，深空高防重金属合金框架，嵌有能量传导槽与全息交互面板。
- **调色板配比**：
  - 主结构：`DARK_METAL (13)` + `SLATE (9)`
  - 机械构件与压条：`STEEL (11)`
  - 高能发光条与全息屏：`TEAL (27)` + `ORANGE (25)` + `PURPLE (28)`
  - 观察窗：`GLASS (14)`
- **`closed` 阻挡池变体**：
  1. `solid`：重装甲复合舱壁（分块暗金属装甲板 + 居中垂直能量凹槽与青色发光芯）；
  2. `airlock_door`：双开重型气闸防爆门（双侧加强门框 + 左右对称加厚金属门扇 + 警示腰线）；
  3. `viewscreen`：强化防辐射观景舷窗（重型外框 + 四角加强角撑 + 深色镀膜玻璃 + 防护横栏）；
  4. `vent_grille`：工业排气与散热百叶（内凹深黑散热腔 + 3 组分层倾斜百叶 + 侧边散热管）；
  5. `bulkhead`：高压抗剪加强隔壁（上下水平大梁 + 中间 3 根抗冲击垂直工字肋）；
  6. `console_wall`：嵌入式主控台墙壁（上部倾斜全息主屏 + 中部操作台挑出 + 下部检修插槽）。
- **`open` 通行池变体**：
  1. `empty`：完全通行净空；
  2. `portal_frame`：气闸舱门框过道（顶部与两侧倒角包边门框，通道宽度 ≥ 0.7）；
  3. `pipe_overhead`：顶置电缆桥架与液压管廊（高位 `v ≥ 0.78` 悬挂两组管道，下方完全通行）。
- **`prefabs` 组合件**：
  1. `server_rack`（`size: 2m`）：工业计算终端机柜（双联立式暗金属框架 + 6 层发光刀片服务器单元 + 顶部散热孔 + 隐形 stop）；
  2. `charging_pod`（`size: 2m`）：壁挂/独立能量充能桩（加重底座 + 垂直导轨 + 悬浮充能核心 + 警示黄黑装饰条 + 隐形 stop）；
  3. `holo_beacon`（`size: 2m`）：全息引导信标（多边形基座立柱 + 悬空全息棱柱发光环 + 顶部收束探头 + 隐形 stop）。

---

### 主题 2：⛩️ 东方仙侠殿宇（`oriental`）[待实施]
- **设计基调**：古典榫卯、雕花朱梁与仙侠庭阁，注重出檐、格栅与对仗层次。
- **调色板配比**：
  - 木作梁柱与雕花：`TIMBER (7)` + `RED (3)`（朱砂漆）
  - 台基与青砖：`SLATE (9)` + `WEATHERED (5)`
  - 窗纸与粉墙：`PLASTER (15)` + `BONE (30)`
  - 铜件包角：`BRASS (12)`
- **`closed` 阻挡池变体**：
  1. `brick_wall`：青砖基座与抹灰粉墙；
  2. `lattice_window`：三交六椀菱花木格窗；
  3. `moon_gate_closed`：嵌玉屏风月亮门；
  4. `eaves_wall`：带小青瓦挑檐的垂花外墙。
- **`open` 通行池变体**：
  1. `empty`：无阻挡通行；
  2. `moon_gate_open`：月亮拱门通行廊；
  3. `column_lintel`：双朱红立柱与雕花额枋大门洞。
- **`prefabs` 组合件**：
  1. `incense_burner`（`size: 2m`）：三足青铜雕花香炉；
  2. `stone_lantern`（`size: 2m`）：仿古八角石灯笼；
  3. `scholar_chair`（`size: 2m`）：红木太师椅与茶几组合。

---

### 主题 3：🏰 深渊地牢遗迹（`dungeon`）[待实施]
- **设计基调**：中世纪地牢、黑石暗堡与刑房遗迹，突出粗粝石材、锈蚀铁件与明暗反差。
- **调色板配比**：
  - 石墙与地面：`WEATHERED (5)` + `SLATE (9)` + `NEAR_BLACK (31)`
  - 铁栅与锁链：`DARK_METAL (13)` + `STEEL (11)`
  - 火炬光源与木架：`ORANGE (25)` + `TIMBER (7)`
- **`closed` 阻挡池变体**：
  1. `rough_stone`：粗凿巨石砌块实墙；
  2. `barred_window`：嵌深孔铸铁栅栏窥视窗；
  3. `torch_niche`：内凹石砌火炬壁龛墙；
  4. `iron_plate_door`：铆钉加固厚重黑铁门。
- **`open` 通行池变体**：
  1. `empty`：通行净空；
  2. `archway`：半圆拱券落石门洞；
  3. `hanging_chains`：顶部垂挂生锈锁链门廊。
- **`prefabs` 组合件**：
  1. `treasure_chest`（`size: 2m`）：黑铁包角橡木宝箱；
  2. `brazier_stand`（`size: 2m`）：铸铁三脚火盆架；
  3. `weapon_rack`（`size: 2m`）：地牢木质兵器陈列架。

---

### 主题 4：☕ 现代极简空间（`modern`）[待实施]
- **设计基调**：包豪斯与现代主义 Loft，平整的大块面、隐形收边、木饰面与漫射灯带。
- **调色板配比**：
  - 主墙体：`OFF_WHITE (10)` + `CONCRETE (4)`
  - 暖色护墙板：`TIMBER (7)` + `SANDSTONE (8)`
  - 金属型材：`STEEL (11)` + `NEAR_BLACK (31)`
  - 玻璃面：`GLASS (14)`
  - 灯带与点缀：`YELLOW (24)`
- **`closed` 阻挡池变体**：
  1. `wood_slat_wall`：细木格栅护墙板；
  2. `ribbon_window`：极窄黑框通长落地玻璃窗；
  3. `diffuse_light_niche`：内嵌温暖漫反射灯槽背景墙；
  4. `sliding_partition`：半透磨砂现代滑动隔断门。
- **`open` 通行池变体**：
  1. `empty`：无门槛完全贯通；
  2. `slim_portal`：极简黑钛不锈钢极窄门套；
  3. `beam_ceiling`：顶置现代混凝土结构假梁。
- **`prefabs` 组合件**：
  1. `office_island`（`size: 2m`）：极简大板办公桌与工位台面；
  2. `lounge_sofa`（`size: 2m`）：低矮软包双人极简沙发；
  3. `bookshelf_unit`（`size: 2m`）：开放式模块化金属收纳架。

---

## 3. 验收与合规标准

1. **协议合规**：
   - 槽位严格遵循 `protocol/cn|en/`（`raw[3]` 均为 Palette 索引；贴图使用 a2 槽 7；无宿主相对路径）；
   - 所有变体使用稳定 `key` 字符串；
2. **守卫干净**：
   - 必须通过 `OptionGuard` 全部检测（无 `part-out-of-cell`、`closed-thin`、`open-sealed`、`parts-coincident`、`prefab-empty`）；
3. **视觉闭环**：
   - 必须通过 `snapshot.mjs` 在 SwiftShader / WebGL 渲染管线下离屏多视角检验，比例与光影质感正常；
4. **自动化测试**：
   - `engine/tests/unit/content-conformance.test.ts` 100% 绿；
   - `client/editor` e2e 测试全绿。
