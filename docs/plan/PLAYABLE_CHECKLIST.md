# 可玩化落地清单（To-Playable Checklist）

> **用途**：追踪「从『功能完备的引擎/技术 demo』到『用户能真正玩起来』」的落地进度。
> 引擎本体（机制/物理/渲染/持久化/编辑原语）已就绪且有测试覆盖；缺口全在其**上层**——内容、分发、产品外壳。
> **配套**：开发基准与历史见 `STANDALONE_ENGINE_ROADMAP.md`；SPP 分发见 `specs/spp-integration.md`。
> **更新**：2026-07-03 状态修订（`player.setSpawn` / authored 关卡 / 2D 地图勾选 ✅，目标系统标部分完成）。2026-06 创建（gap 评估基线）。改一项就勾一项、并更新本行日期。

## 图例

| 标记 | 含义 |
|---|---|
| ✅ | 已完成（已落地 + 有验证） |
| 🚧 | 进行中 |
| 🔲 | 待办 |
| ⏸️ | 推迟 / 看情况（非 MVP 必需） |
| ❌ | 有意不做（附理由） |
| ❓ | 待决策（卡住后续排期） |

---

## 0. 关键决策（先定，决定后续优先级）

- [ ] ❓ **路线选择**：先做哪条？
  - **A. 单机 authored 游戏先行** — 最快到「可玩」。做一个有目标的游戏（**跑酷**最契合），世界**打包成静态文件**随 PWA 发布，数据后端暂用本地/内置。预计数天~一两周出可玩 v1。
  - **B. 共享创作世界先行**（Septopus 愿景）— 必须先做世界数据后端 + 分发 + 创作完整度。数周起。
  - **推荐**：先 A 验证「好玩 + 留存」，同时不挖坑（`IDataSource`/资源解析/导出接缝留好），玩法验证后再上 B。
- 选定后，把对应路线下的 🔲 项排进迭代。

---

## 1. 已就绪 ✅（不是 gap，作为基线）

- [x] ✅ ECS 引擎 + 确定性 `step(dt)` + headless 测试（202 vitest + 27 e2e）
- [x] ✅ 物理：碰撞 / 台阶 / 移动平台跟随 / 防穿地 / void recovery
- [x] ✅ 12 类 adjunct（wall/box/light/module/water/cone/ball/stop/item/particle/trigger/link）
- [x] ✅ SPP 弦粒子 M1+M2（b6 展开为标准 adjunct，碰撞/触发器/LOD 原生）
- [x] ✅ 编辑原语：palette 放置 / 选择 / 改参表单 / 删除 / undo
- [x] ✅ 5 模式：Normal / Game / Ghost / Edit / Observe
- [x] ✅ 渲染：阴影 / 天气 + 闪电 / 昼夜 / LOD / 骨骼+属性动画 / 相机手感（摔落抖屏）
- [x] ✅ 玩法原语：HP+重生 / 背包 / trigger + JSONLogic + actuator / 空间音效
- [x] ✅ 持久化：IndexedDB DraftStore（block 草稿 + meta：背包 / 会话 / **玩家位置**）+ JSON 导出/导入
- [x] ✅ 几何：box/sphere/cylinder/cone/plane + **tube/挤出**（轨道/管道/导轨）

---

## 2. Gap 清单（按「让用户玩起来」优先级）

### G1 · 世界数据来源 🔲 — 最大结构性缺口
> 现状：`IDataSource` 仅 `fetchMockBlock` + 写死的 demo court；用户创作只存在自己浏览器的 IndexedDB。没有「世界」可发布。

- [ ] 🔲 决定世界数据形态：静态世界文件（最快）/ 服务端 block API / IPFS（P3）
- [ ] 🔲 `DesktopLoader` 之外实现一个非 mock 的 `IDataSource`（读真实世界数据）
- [ ] 🔲 世界级元数据（出生点 / 标题 / 边界）随世界数据走，而非写死 config
- [ ] ⏸️ 服务端持久化（多设备同步）— B 路线才需要

### G2 · 玩法回路 / 成品内容 🔲 — 「能玩」的核心
> 现状：有积木（trigger/flag/HP/item/actuator/SPP 关卡），但没组装成有目标的游戏，无 game-state/目标系统。

- [ ] 🔲 选定首发玩法（推荐**跑酷**：SPP 关卡 + 摔死重生闭环已就绪）
- [ ] 🚧 目标/进度系统（到达终点 / 计时 / 计分）—— **部分 ✅**：到达终点已由 flags 配方表达（`AuthoredLevel.completeFlag` / `levelComplete` 旗标）；计时/计分仍无
- [x] ✅ `player.setSpawn` 动作（检查点重生）—— `core/services/Actuator.ts` `execSetSpawn` + HealthSystem 检查点重生；`parkour.level.json` 3 处在用
- [ ] 🔲 计时/计分/目标 HUD（客户端 UI）
- [x] ✅ 至少一关完整 authored 内容（关卡数据 + 通关验证 e2e）—— `client/desktop/src/levels/parkour.level.json` + `coaster.level.json`；e2e `parkour.spec.ts`（断言到达终点）+ `coaster.spec.ts`
- [ ] ⏸️ 多关卡 / 关卡选择 / 进度存档

### G3 · 创作 → 分享闭环 🔲
> 现状：创作只落本地 IndexedDB + JSON 导出/导入；无发布/发现/载入他人世界。

- [ ] 🔲 「发布世界」流程（导出 → 上传/分享链接）
- [ ] 🔲 「载入他人世界」流程（URL / 文件 → 进入游玩）
- [ ] 🔲 SPP M3：CollapseCodec L2 二进制进 draft/export（紧凑分发）
- [ ] ⏸️ SPP M4：L1 IPFS 分发（P3）/ 世界发现页

### G4 · 创作工具完整度 🔲
> 现状：palette 放置 + 表单改参可用，但建造体验半成品。

- [ ] 🔲 SPP/b6 进 palette（M3）—— 现在搭 SPP 关卡要手写 cells
- [ ] 🔲 3D gizmo 拖拽（位置/旋转/缩放）—— 现在只能填表单
- [ ] 🔲 模型/资源选择器（module 放置）
- [ ] 🔲 新建 / 切换 / 命名世界 的 UI 流程
- [ ] ⏸️ 多选 / 复制粘贴 / 对齐吸附

### G5 · 资源管线 🔲
> 现状：模型/贴图/音频是 `DesktopLoader` 写死的 `DEMO_MODELS/DEMO_TEXTURE`。

- [ ] 🔲 真实资源解析（`IResourceResolver` 接非 mock 后端）
- [ ] 🔲 用户自带资源（上传/引用）—— UGC 前提
- [ ] ⏸️ OSS/IPFS 资源托管 + 去重缓存（P3）

### G6 · 移动端 + 新手引导 🔲
> 现状：触屏**视角**已接（InputProvider touch*），但无移动摇杆/响应式 UI；无任何操作提示。

- [ ] 🔲 屏幕移动摇杆 + 跳跃/交互按钮（移动端可玩）
- [ ] 🔲 响应式 / 移动端布局（现 UI 偏桌面）
- [ ] 🔲 操作提示 / 极简引导（首次进入）
- [ ] ⏸️ 完整教程关

### G7 · 多人在场 ⏸️ — 看愿景，通常 MVP 之后
> 现状：完全无网络/多人。

- [ ] ⏸️ 实时玩家位置同步 / presence
- [ ] ⏸️ 网络架构选型（权威服 / P2P）

### G8 · 产品外壳 / 打磨 🔲
- [ ] 🔲 加载 / 错误 / 空状态
- [ ] 🔲 设置（音量/画质/灵敏度）
- [ ] ⏸️ 背景音乐 / 环境音
- [ ] ⏸️ 身份/账号（现为匿名本地）

---

## 3. 有意不做 ❌（非缺失，归档源码可参考）

- [x] ❌ 多链 API（Solana/Bitcoin/Sui）—— 链已解耦，作可选发布插件
- [x] ✅ 完整 2D 世界地图 —— **原列"有意不做"，后重新纳入计划**（3D 迁移确认成功后解除）。与 minimap（PiP 3D 俯视小窗）是两回事：2D 地图是独立 canvas/SVG 的可平移世界地图，视口窗口化按需流式（复用 `block.need` 块通道，非全局索引）。设计规格 `specs/2d-map.md`，参考旧引擎 `control_2d.js`+`render_2d.js`。**v1 已实现（2026-06）**：`client/desktop/src/components/WorldMap2D.tsx` + `DesktopLoader.fetchMapCell` + App.tsx 开关 + e2e `map2d.spec.ts`；v2（footprint 投影等）仍开放
- [x] ❌ card/news/manual 信息页 —— 属 React 客户端层，按需在客户端做

---

## 4. 推荐首迭代（若选 Path A：跑酷可玩 v1）

最小可玩集（建议顺序）：
1. [x] ✅ `player.setSpawn` 动作（G2）—— `Actuator.ts` `execSetSpawn`，已实现
2. [ ] 🔲 一关跑酷内容：SPP 平台 + 检查点 + 终点 trigger（G2）
3. [ ] 🔲 计时 + 到达终点 HUD（G2）
4. [ ] 🔲 把这关打包成内置/静态世界，随 PWA 发布（G1 最小版）
5. [ ] 🔲 首次进入操作提示（G6）
6. [ ] 🔲 通关流程 e2e（确定性回放：出生 → 检查点 → 终点）

> 完成上述 = 用户打开链接就能玩一关有目标的跑酷，且整条数据流（创作数据 → 引擎 → 渲染 → 持久化）被真实跑通。
