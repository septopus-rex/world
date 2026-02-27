# 附属物系统 (Adjunct)

附属物 (Adjunct) 是能够附加安放在 Block 上的任何对象。如果 Block 是这片 3D 世界的地板，那么 Adjunct 就是摆放在地板上的家具、建筑、树木或是游戏规则（如隐形的触发器）。

## 1. 结构与分类

Adjunct 不是硬编码的类，它更像是一个具有严格生命周期的**插件化组件**。
通过其 `category` 属性，Adjunct 主要分为三大类：
1.  **基础物体** (`basic`)：引擎内建的最轻量级模型。例如 `basic_box` (用来搭墙壁或者地板的纯色方块)、`basic_water` (半透明流体表现)。
2.  **外部模型载体** (`module`)：用来加载外部 glTF 或 Obj 模型的容器组件。
3.  **功能型虚体** (`logic`)：在画面中不可见或者只有半透明体积提示的对象。例如 `basic_trigger` (触发器：玩家进入后执行一段代码)、`basic_stop` (阻拦体：一堵看不见的空气墙)。

## 2. 核心架构：注册与挂载机制

任何人都可以编写一个新型的 Adjunct 扩展。一个标准的 Adjunct 组件必须通过 `Hooks` 暴露自身能力给系统（`World`）。

```javascript
// 一个典型 Adjunct 注册的伪代码
const adjunct_reg = {
    name: "my_custom_object",
    short: "mo",            // 用于极致压缩的上链短键
    events: ["in", "touch"] // 声明它能广播哪些事件
};

const hooks = {
    reg: () => { return adjunct_reg },
    def: (param) => { ... }, 
    animate: (effect) => { ... } // 支撑系统调用动画
}
```

**多态数据流驱动**：
同 Block 一样，每种 Adjunct 都必须实现一套 `transform` 接口（如 `raw_std`, `std_3d`）。当 Engine 请求把一个 Block 展现出来时，如果它发现这块地上挂载了多个 Adjunct（譬如 3 个 `basic_box` 和 1 个 `module`），引擎会分别找到这两种组件的控制器，将 Raw 数据传递给它们的 `transform` 并获取返回的三维对象，直接塞入场景。

## 3. 重要系统级功能

对于所有挂载入引擎的 Adjunct 对象，引擎自动提供以下底层的公共支撑系统：

### 动画路由系统 (Animation Router)
附属物支持预定义的数据驱动动画（无需编写每帧 `requestAnimationFrame` 逻辑）。
当链上的原始数据数组第六位 `d[5]` 带有动画映射键（如 `{ router: 1, param: [0.05] }`）时，系统会自动在渲染管线中为这个 Adjunct 实例化对应类型的动画修饰器（譬如不停自转、上下悬浮、或者按轨迹移动）。

### 事件监听机制 (Event Binding)
任何拥有坐标尺寸的 Adjunct 都自带物理侦测。
*   玩家撞击该物体时，引擎自动抛出 `touch`。
*   物理侵入包围盒内部时，抛出 `in`，离开时抛出 `out`。
这为制作踩踏机关、传送门等交互提供了基石。

### 空气墙与防穿模 (Stop/Collider)
只需要在 Adjunct 设置标志位（或是专职防穿模的 `basic_stop`），该挂载物就会在 ECS 的 `PhysicsSystem` 端注册为一个阻拦体（Collider）。底层的射线检测会保证玩家的坐标永远不会陷入此空间内。这为利用基础的 Box 搭建带有物理阻挡的“房子”成为可能。

## 4. 数据压缩哲学

Adjunct 是 Septopus “链上可用性”设计的结晶。
由于一个繁茂的世界内会摆放松以万计的组件，如果每个都存成 JSON，智能合约的 Gas 费或者 IPFS 的体积将是天价。

因此你在 Raw 数据里看到的不会是：
`{"type":"wall", "x":2, "y":4, "rotation": [0,0,0], "texture": 13}`
而是被引擎压缩器极尽所能缩短的：
`["wl", [[2,4,0], [1,0,0], [0,0,0], 13]]`

而还原出这些生涩数据的解释权，就封装在对应这个短键（"wl" 即 Wall）的扩展包代码里。
