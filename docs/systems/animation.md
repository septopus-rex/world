# 特效与动画系统 (Effects & Animation)

为了使得高度模块化的 Adjunct 和 Block 数据驱动系统能拥有丰富的表现力，且不必在每个拓展包里手写复杂的 `requestAnimationFrame` 缓动逻辑，Septopus 内置了**基于数据流驱动声明式动画机制**。

## 1. 基础动画定义格式

任何挂靠在世界当中的 Adjunct 对象都可以通过携带标准化的 `animation` 参数来开启系统托管动画：

```javascript
// 一个让物体上下来回浮动漂浮的动画描述
const hover_animation = {
    name: "HoverAndShining",    // 动画标识
    duration: 3000,             // 3秒一个大循环
    loops: 0,                   // 0代表无限循环
    category: "mesh",           // 作用对象类型（不仅限mesh模型本身，也可以是camera）
    timeline: [
        {
            time: [0, 1500],    // 前1.5秒
            type: "move",       // 执行位移动画
            axis: "Z",          // Z轴 (在Septopus的Three.js映射中Z通常为上下高度)
            mode: "add",        // "add"代表每帧累加变化量
            value: 0.05
        },
        {
            time: [1500, 3000], // 后1.5秒
            type: "move",
            axis: "Z",
            mode: "add",
            value: -0.05
        },
        {
            time: 0,            // 0 代表贯穿整个duration
            type: "rotate",     // 持续旋转动画
            axis: "Y",
            mode: "add",
            value: Math.PI / 180
        }
    ]
}
```

## 2. 动画解析与帧同步 (Frame Sync)

这套纯数据的 JS 对象通过网络的 JSON 拉取到前端本地后，引擎（Effects）会将其统一解包并编译。

**核心管线流程**：
1. **编译 (Decode)**：`Effects.decode` 将庞大的配置读取，转换成一个个闭包计算函数（这些函数极高效率地只根据入参的 `step` 帧数修改目标 `mesh`）。
2. **入队 (Queue)**：动画不会散布在系统中各自执行。当 Block 载入且 `mesh` 生成后，这些编译好的动画回调函数会被推入全局唯一的 `Frame Synchronized Queue` (帧同步防阻塞队列)。
3. **驱动**：系统的唯一心跳 `VBW.update` 按屏幕刷新率统一派发执行。这种**单例控制机制**允许系统在游戏暂停、资源严重加载卡顿或玩家切入后台时统一挂起所有动画，保障了极低的性能开销。

## 3. 支持的核心类型 (Type) 与模式 (Mode)

动画系统原生实现了以下高频操作的补间运算，允许用户通过配置组合出千变万化的效果：

| Type     | 作用领域                   | 说明 |
|----------|----------------------------|------|
| `move`   | 坐标 (Position)            | 三轴位移 |
| `rotate` | 旋转 (Rotation)            | 自转、偏心转 |
| `scale`  | 缩放 (Scale)               | 心跳形变、呼吸灯 |
| `color`  | 材质颜色 (Material.color)  | RGB数值渐变或闪烁 |
| `opacity`| 材质透明度 (Material.opacity)| 幽灵化、淡入淡出 |
| `texture`| 贴图 (Texture)             | 帧动画贴图切换 (Spritesheet-like) |
| `fall`   | 摄像机视角 (Camera)        | 特殊类别，可引发全局镜头的抛物线坠落 |

**修饰数值的三种模式 (Mode)**：
*   `add`：每帧增加固定数值（线形累加）。
*   `set`：直接给属性赋目标值。当搭配 `time` 数组时允许实现断电式的突变。
*   `multi` / `random`：使得每帧的数据有随机波动范围，适用于实现火焰摇曳或闪电的随机跳动感。
