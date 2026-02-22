# SPP 附属物协议 (Adjunct Protocol)

**String Particle Protocol (SPP)** 定义了“附属物 (Adjuncts)” 作为扩展引擎核心能力、渲染静态空间地块之外的动态交互式 3D 对象的主要机制。

附属物被设计为与核心引擎完全解耦。它们可以从 IPFS、区块链智能合约或本地服务器动态加载。加载后，它们在 ECS（实体-组件-系统）架构内运行，将标准数据参数映射为丰富的 3D 视觉效果和可编程行为。

---

## 1. 架构与安全

附属物在一个隔离的环境（沙盒）中被解析和执行，以防止恶意代码访问敏感的全局 API（如 `window`、`document` 或 `fetch`）。

- **坐标系统**：附属物在标准的 SPP 地块坐标系统内运行。
- **数据流**：引擎将原始地块数据输入到附属物中。附属物将这些原始数据转换为标准的 3D 参数（`position` 位置、`scale` 缩放、`rotation` 旋转、`material` 材质），然后引擎的渲染管线将这些参数转换为 Three.js 的对象网格 (meshes)。
- **可扩展性**：不同的 SPP “世界”可以白名单特定的附属物，以创造独特的视觉风格和游戏机制（例如：通过白名单允许使用“激光门”和“跳跃板”附属物）。

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
        // 链上压缩的原始数组 -> SPP 标准数据
        raw_std: (arr: any[], cvt: number) => {},
        // SPP 标准数据 -> 原始压缩数组 (用于保存为字符串)
        std_raw: (arr: any[]) => {},
        // 将 SPP 标准数据数组转换为特定的 3D 渲染/引擎参数
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

| 资源类型 | 数据中的挂载位置 | 用途 |
|---|---|---|
| 图像 (Texture) | `STD_ROW.material.texture` | 作为漫反射/颜色贴图应用在生成的盒子几何体上。 |
| 3D 模型 (.glb) | `STD_ROW.module` | 替换标准几何体生成，使用完整加载的 3D 资产。 |
