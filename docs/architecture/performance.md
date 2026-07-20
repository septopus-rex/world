# 性能优化策略 (Performance Optimization)

Septopus World 引擎采用纯 Web 前端运行的架构，因此要在浏览器中渲染一个数据驱动、全链分布式的连片 3D 世界，必须使用多维度的性能控制策略，以保证内存不爆、帧率平稳。

## 1. 内存与资源管线优化

### 渐进加载与 LRU 缓存 (Least Recently Used)
*   **空间视锥边界管理**：只预加载和渲染玩家配置范围（如 `extend = 2` 个街区半径）内的 Block。
*   **自动卸载**：当玩家移动导致旧的 Block 移出可视范围，底层资源管理器会自动销毁对应的 Three.js Scene 对象并清除 Raw/STD 内存数据。
*   **组件资源池**：不同的 Block 长着相同贴图或模块外形时（常见于基础功能如 `Wall` 或标准 `Module`），引擎底层使用全局共享引用计数（Shared Reference Pool），杜绝几何体和纹理对象的多重冗余拷贝。

### 渲染规模化（现状，2026-06）
*   **几何/材质缓存**：`MeshFactory` 按尺寸/参数缓存 geometry 与 material，同规格物体共享 GPU 资源（已实现）。
*   **Block LOD**（`BlockLODSystem`，已实现）：地块中心超出 `world.performance.lodNear`
    （默认 40m）的 adjunct 网格组整体隐藏，地面板保留（远处仍读得出地形）；
    **仿真不受影响**——物理/触发器/物品照常运行，只裁渲染。0.25s 间隔评估，
    Edit 模式强制全显。流式驱逐管内存，LOD 管这两个半径之间的 draw call。
*   **阴影成本控制**：单一投影太阳光、1024² PCF 软阴影、阴影视锥逐帧锚定玩家
    （世界跨数万米，静止视锥永远照不到玩家）。默认关闭，`Engine.setShadows(on)`
    运行时切换（`debug.shadows` 配开机态），`Engine.perfInfo()` 出 draw calls/triangles。
    **可用化时踩过的两处（2026-07-19，勿重蹈）**：
    *   加载模型（module + **玩家 avatar**）曾是唯一没有 cast/receive 标记的网格族
        ——`MeshFactory` 只给自己造的图元加，于是开了阴影角色也不投影；
        标记补在 `ResourceManager.prepareInstance`。
    *   阴影相机 ±80m / 1024² = 16cm 一个 texel，地面碎成条带状 acne（近天顶最糟：
        平地垂直于光，每个 texel 的深度与落点打平）。收到 **±30m（6cm/texel）** 后条带消失。
        **这是密度问题，不是偏移问题**——bias/normalBias 与阴影相机 `up` 都 A/B 排除过，
        再遇到条带先算 texel 密度，别再去调 bias。真机性能基线待手测。
*   **InstancedMesh（评估后延迟）**：逐 adjunct 的 mesh group 承载着 per-entity
    的拾取/编辑/驱逐语义（userData.entityId 射线映射、单体增删、按组释放资源），
    合并进 InstancedMesh 会与这三者冲突；当前对象量级下 LOD + 共享几何已够。
    待单块对象数量级上升（如植被/粒子地表）再为"无交互静态层"单独引入。

## 2. 调度与运行时优化

### 帧任务分摊 (Task Splitting)
*   大量数据转换过程（如读取 4 个新 Block 时的大规模从 Raw 到 3D 的转换）不会塞进单一一帧的渲染循环。
*   利用调度器（`Scheduler`）按帧数定额派发逻辑任务限制，将繁重的计算通过数帧或者 Web Worker 异步处理化解卡顿峰值。

### 帧数解耦 (Decoupled execution loop)
*   **可变渲染计算**：`requestAnimationFrame` 接管纯画面的显示轮询，尽量顶格硬件。
*   **物理与逻辑计算**：当前生产循环以 rAF 的可变 dt 直驱 `World.step(dt)`
    （碰撞用子步进钳制单步位移补稳定性；测试经 `Engine.step(dt)` 确定性驱动）；
    独立固定步长（Fixed-dt Update）为规划项。

## 3. 面向网络的数据侧优化

由于核心设计理念是全链数据，**网络加载的延迟与并发数**直接制约感知性能。
*   **Raw 格式极致压缩**：链上数据采用没有任何多余 Key 的纯无类型数组序列（[详情见 Data Pipeline](./pipeline.md)）。
*   **数据源占位预渲染**：只要区块范围被确立，在数据到达之前引擎将先行生成极低成本的基础骨架（Placeholder Box）填补画面漏洞，随着数据的回包再将丰富组件无缝替换。
