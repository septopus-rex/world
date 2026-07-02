# 语义化三维坐标系统

Septopus World 采用一套语义化的三维坐标系统，旨在将现实世界的地理直觉与 3D 渲染引擎的内部数值建立规范的映射关系。

> **术语注记（防撞名）**：代码中 `Coords.sppToEngine` / `engineToSpp` / `SPPPlayerState`
> 等名字里的 **"spp" 是 "Septopus" 的缩写**，指本文的 **Septopus 世界坐标系（语义层）**——
> 与**弦粒子协议 SPP（String Particle Protocol**，外部授权协议，管 b6 粒子/CollapseCodec
> 二进制，见 `docs/features/spp*.md`）**是两回事**，仅缩写撞名。凡涉及坐标的 "SPP/spp"
> 一律读作 "Septopus 语义坐标"；凡涉及粒子/二进制协议的 SPP 才是弦粒子。

## 1. 坐标系定义对比

由于 Septopus 在设计之初即考虑到全链存储的语义性，其坐标轴方向符合常规真实世界的地图理解，这与最终用于渲染的 Three.js 默认坐标系有所区别。

| 特性 | Septopus 世界坐标系 (语义层) | Three.js 坐标系 (渲染引擎层) |
|---|---|---|
| **X** 轴 | 东西方向（+东，-西） | 水平向右 |
| **Y** 轴 | 南北方向（+北，-南） | 垂直向上 |
| **Z** 轴 | 高度方向（+向上，-向下） | 水平向前 |
| **原点(Origin)**| 西南角 Block[1,1] 的中心点 | 3D 场景原点 [0,0,0] |

在统一的 `CoordinateService` (坐标服务) 转换下，这两套体系的换算公式为：
```javascript
// Septopus → Three.js
[threeX, threeY, threeZ] = [septX, septZ, -septY];

// Three.js → Septopus
[septX, septY, septZ] = [threeX, -threeZ, threeY];
```

### 1.1 朝向 (Heading / Yaw) —— 单一真相源 `Coords`

朝向也必须经 `Coords` 统一换算，**严禁各处手写正负号**（历史上罗盘/小地图/avatar 各自处理
导致镜像 bug）。

- **Septopus 朝向 (heading)**：弧度，**0 = 朝北，顺时针增大朝东**（罗盘/航海惯例）。
- **引擎 yaw ψ**：绕引擎 +Y 旋转；朝向向量在 (东, 北) 为 `(-sinψ, cosψ)`，故罗盘朝向
  `H = -ψ`。换算集中在两个互逆函数：
  ```javascript
  Coords.engineYawToHeading(ψ) = -ψ      // 引擎 yaw → Septopus heading
  Coords.headingToEngineYaw(H) = -H      // 逆
  ```
  `sppRotationToEngine` / `engineRotationToSpp`（spawn / restore / 持久化的互逆对）即基于此。
- **谁该转、谁不该转**：
  - **2D 屏幕/SPP 空间消费者**（HUD 罗盘、2D 地图）：用 `engineYawToHeading`，在北朝上的视图里把
    指北标记**顺时针**旋 heading。
  - **引擎空间 3D 渲染**（avatar 网格、PiP minimap marker）：直接用**原始引擎 yaw**——它们本就在引擎
    系内，不转。

## 2. Block 定位系统 (Block Coordinates)

为了支持无限扩展的世界地图，Septopus 的平面空间被划分为了等大的格子 —— **地图块(Block)**。

*   **Block 尺寸**：默认 16m × 16m 见方领域。
*   **Block 坐标**：从 `[1,1]` 标号至最大边界（如 `[4096,4096]`）。
*   **世界唯一键 (Key)**：通过 Block 的 XY 和所属联机世界 ID 构成索引，如 `"2025_619"` 代表 X=2025, Y=619 的地块。

**绝对位置的解构**：
引擎内的任意物体，其绝对坐标都可以解构为 `【所在的 Block】+【在 Block 内部的相对偏移】`。
*例如：绝对坐标 X(32400m), Y(9900m) 可以被转换为：位于 Block[2026, 620] 的西南角起点。*

## 3. 附属物内部相对坐标 (Adjunct Coordinates)

挂载到 Block 上的对象（Adjunct 附属物）使用相对于当前 Block 西南角极点的局部偏移坐标：
```javascript
const adjunct_position = {
    x, y, z,         // 自身的空间包围盒尺寸 (米)
    ox, oy, oz,      // 距离所在 Block 极点的偏移距离 (米)
    rx, ry, rz,      // 围绕自身中心的旋转弧度
}
```
**渲染管线中的装配计算**：
当把 Adjunct 推入渲染引擎时，管线会进行一次复合换算：
`渲染器世界坐标 X = (Block_X - 1) * Block宽度 + Adjunct_OX`
然后将整套算出数值传递给 Three.js 对象。

### 3.1 旋转的欧拉序与坐标系（跨引擎契约）

`[rx, ry, rz]` 的语义必须写死，否则换一台引擎（如 UE）朝向就会歪。规范如下：

- **单位**：弧度。**枢轴 (pivot)**：物体几何体的**中心**（`size` 是全长包围盒，见 §3）。
- **欧拉序**：**Adjunct 用 `XYZ` 序**（Three.js `Euler` 默认序，`RenderEngine.setObjectRotation` 直接 `rotation.set(rx,ry,rz)`）。**玩家/相机用 `YXZ` 序**（防倾覆/万向锁）——两者是**不同**的序，别混。
- **坐标系（关键）**：Adjunct 的 `[rx,ry,rz]` **直接在引擎系应用，不经朝向换算**——即它是**引擎系欧拉角**，与 §1.1 的 `engineYawToHeading` **无关**。只有**玩家 yaw**（导航/罗盘语义）才走 `sppRotationToEngine` 的 heading 换算；Adjunct 是「作者直接按引擎朝向摆放」。
  > 由此有个**不对称**要留意：Adjunct 的**位置**按 SPP 系 author（经 `localSppToEngine` 转 −North），**旋转**却按引擎系 author（原样应用）。author 内容时以此为准。
- **UE 等其它引擎实现**：按上面把 `[rx,ry,rz]` 当引擎系 XYZ 欧拉角、绕中心应用即可对齐（观感等价，非逐位相同）。

## 4. 精度与防抖动机制

在 Web3D 尤其是基于 WebGL 的大世界渲染中，浮点数精度丢失极易引起远处模型的重叠闪烁（Z-Fighting）或模型抖动变形。
*   **数据层精度**：核心层或底层计算时放大存储（例如内部采用精度系数 `accuracy = 1000` 将米级数据转换为毫米级定点/整数存储处理）。
*   **渲染层浮动原点**：通过动态挪动 `Camera` 到局部的相对中心点，保证当前视锥体内的渲染顶点数据全部在安全浮点数区间内，避免单精度极大值计算溢出。
