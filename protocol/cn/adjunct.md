# Septopus 附属物 (Adjunct) 协议

在 **Septopus 引擎** 中，“附属物 (Adjuncts)” 是构建世界物理内容、渲染 3D 对象并实现动态交互的基础原子。引擎通过管理附属物的生命周期来运行世界。

在这个体系中，存在一类特殊的 **元附属物 (Meta-Adjuncts)**。例如 **`spp` 附属物**，它并不直接代表一个视觉对象，而是作为“播音员”，负责解析弦粒子数据并派生出其他的附属物。

附属物被设计为与核心引擎完全解耦。它们可以从 IPFS、区块链智能合约或本地服务器动态加载。加载后，它们在 ECS（实体-组件-系统）架构内运行，将标准数据参数映射为丰富的 3D 视觉效果和可编程行为。

---

## 1. 架构与安全

附属物在一个隔离的环境（沙盒）中被解析和执行，以防止恶意代码访问敏感的全局 API（如 `window`、`document` 或 `fetch`）。

- **坐标系统**：附属物在标准的 Septopus 地块坐标系统内运行。
- **数据流**：引擎将原始地块数据输入到附属物中。附属物将这些原始数据转换为标准的 3D 参数（`position` 位置、`scale` 缩放、`rotation` 旋转、`material` 材质），然后引擎的渲染管线将这些参数转换为 Three.js 的对象网格 (meshes)。
- **可扩展性**：不同的 Septopus “世界”可以白名单特定的附属物，以创造独特的视觉风格和游戏机制（例如：通过白名单允许使用“激光门”和“跳跃板”附属物）。

---

## 2. 附属物接口定义 (API)

每个附属物必须导出一个包含特定功能域的标准对象。在现代 TypeScript ECS 实现中，这通常包括 `hooks`、`transform` 和 `menu`。

```typescript
export const CustomAdjunct = {
    hooks: {
        // 提供附属物元数据 (name 名称, version 版本, 以及支持的事件如 'touch', 'in')
        reg: () => {}            
    },
    transform: {
        // 链上压缩的原始数组 -> Septopus 标准数据 (STD)
        raw_std: (arr: any[], cvt: number) => {},
        // Septopus 标准数据 (STD) -> 原始压缩数组 (用于保存为字符串)
        std_raw: (arr: any[]) => {},
        // 将 Septopus 标准数据 (STD) 数组转换为特定的 3D 渲染/引擎参数
        std_3d: (stds: any[], elevation: number) => {} 
    },
    menu: {
        // 返回该对象的侧边栏属性编辑器表单配置
        sidebar: (std: any) => {}             
    }
};
```


---

## 3. 数据转换管线 (Data Transformation)

`transform` 属性是附属物的核心。它是压缩存储和丰富 3D 渲染之间的桥梁。

| 方法 | 数据源 | 目标 | 用途 |
|---|---|---|---|
| `raw_std` | 原始数据 (`raw`) | 标准数据 (`std`) | 将压缩的链上/IPFS 字符串解码为引擎可读的 JS 对象。 |
| `std_raw` | 标准数据 (`std`) | 原始数据 (`raw`) | 将编辑后的数据重新编码为紧凑字符串，以便保存到区块链。 |
| `std_3d` | 标准数据 (`std`) | 3D 渲染数据 | 将标准转换为精确的 `size`, `position`, `rotation`，用于生成 Three.js 网格。 |
| `std_2d` | 标准数据 (`std`) | 2D 渲染数据 | 生成 SVG/Canvas 对象，用于顶视小地图或 UI 投影。 |

### 最低标准数据格式要求
要在 3D 世界中渲染，`std_3d` 输出必须至少包含：
*   `size`: `[x, y, z]` (数值尺寸)
*   `position`: `[ox, oy, oz]` (世界偏移坐标)
*   `rotation`: `[rx, ry, rz]` (欧拉角)

---

## 4. 交互与事件 (Interaction & Events)

附属物可以通过 `hooks.reg().events` 注册其对各种空间和交互事件的支持。

**支持的系统事件：**
*   `in`: 玩家（Player）进入附属物的空间边界内。
*   `out`: 玩家离开边界。
*   `hold`: 玩家在边界内停留一段时间。
*   `beside`: 玩家站在附属物旁边。
*   `under`: 玩家站在附属物正下方。
*   `touch`: 玩家与附属物交互（例如：通过准星光线投射点击）。

事件可以触发自定义动画（通过 `hooks.animate`）或执行定义在 `task` 路由器中的特定函数。为了安全起见，任务可以标记为 `gameonly: true`，以防止在标准的编辑或查看模式下被意外执行。

---

## 5. 资源加载 (Resource Loading)

如果一个附属物需要外部资产（如纹理图片或 3D 模型 `.glb`），它必须在 `transform.raw_std` 阶段声明它们。引擎拦截这些声明并处理异步加载，以防止 UI 卡顿。

附属物通过**整数 ID** 引用资源，资源的存储格式、寻址方式和获取流程详见 [资源协议 (Resource Protocol)](./resource.md)。

| 资源类型 | 数据中的挂载位置 | 说明 |
|---|---|---|
| 图像 (Texture) | `a2 box raw[7]` = texture id/CID（可选；`raw[3]` 是**颜色索引**、非贴图）| 漫反射/颜色贴图，完整规范见 [贴图协议](./texture.md) |
| 3D 模型 (Module) | `adjunct raw[3]` = module resource ID | 替换标准几何体，使用完整 3D 资产 |
| 音效 (Audio) | `STD_ROW.audio.resource` | 3D 空间音效 |

## 6. 渲染实现契约 (Rendering Realization Contract)

> 「数据即逻辑」要求 std_3d 的**几何/材质如何 realize** 也写死，否则换引擎（UE）造出的世界会不同。以下为规范；旋转/坐标见 [坐标系统](../../docs/architecture/coordinate.md#31-旋转的欧拉序与坐标系跨引擎契约)。

- **尺寸轴映射**：std `size = [x, y, z]` 是 **Septopus [东, 北, 高]** 全长；映射到引擎盒尺寸 **[宽=东, 高=Alt, 深=北]**（`Coords.getBoxDimensions`）。**枢轴 = 几何中心。**
- **基元语义**：`box(w,h,d)` 居中全长；`sphere` 半径 = `w/2`；`cylinder/cone(w,h,d)`；`plane(w,h)`；`tube` 沿控制点 Catmull-Rom 挤出；`wedge(w,h,d)` 楔形坡，沿某一水平轴由 0 升到 `h`。**分段数（如球 32×32）是像素级细节，各引擎可不同**（观感等价即可）。
- **`wedge` 是 `b4` slope 碰撞形状的视觉孪生**：其斜面必须与碰撞侧 `topYAt` 用**同一个平面方程**求解，否则玩家会浮在坡面上方或陷进去（见 [adjunct-types.md](./adjunct-types.md) §5）。
- **世界空间 UV 平铺（贴图密度恒定）**：贴图按**世界尺寸**平铺而非按面拉伸，故 16m 地板与 1m 箱子贴图**同样清晰**。尺度（贴图 `size`，默认 1m）/ 纹素密度基准（**512 px/m**）/ 锚定（`[bottom, left]`）/ 平铺公式的完整**跨引擎契约**见 [贴图协议](./texture.md)。（UE 需实现同一套规则才对齐观感。）
- **颜色**：**规范是直接 author 十六进制色**（`material.color`）。box 的 `resource 索引 → 调色板颜色`（如 `10→#eee`、`1→#555`）是**遗留 demo 便利、非规范**——跨引擎内容请存 hex，勿依赖索引调色板。
- **「同效果」边界**：几何摆放/朝向/尺寸/UV 密度属**语义**（必须对齐）；着色/光照/tonemapping/阴影/相机/分段数属**渲染器自决**（观感等价、非逐位相同）。
