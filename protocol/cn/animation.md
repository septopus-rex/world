# SPP 动画协议 (Animation Protocol)

**String Particle Protocol (SPP)** 包含一个动画规范，该规范定义了空间粒子（组件/附属物）如何随时间进行动画处理。这种方法确保了对于简单的平移、旋转、缩放序列以及属性修改（不透明度、颜色、纹理），都有统一和一致的定义。

通过将动画标准化为预定义的时间轴定义，引擎可以纯粹通过数据驱动的系统（如 ECS 中的 `AnimationSystem`）来执行这些动画，从而消除了为每个对象硬编码更新脚本的需要。

## 核心动画结构

一个动画对象必须定义一个全局策略（循环次数、延迟、目标）和一个离散执行块的局部时间轴（`timeline`）。

```json
{
  "name": "AnimationName",
  "target": {                   
    "x": 2025,
    "y": 667,
    "world": 0,
    "adjunct": "box",
    "index": 1
  },
  "duration": 3000,             
  "loops": 0,                   
  "pending": 2000,              
  "timeline": [
    // ... 动画指令
  ]
}
```

### 全局配置 (Global Configuration)

| 属性 | 类型 | 描述 |
|---|---|---|
| `name` | `string` | 动画序列的描述性名称。 |
| `target` | `object` | 动画的执行目标。如果直接绑定到实体上，则为可选。 |
| `duration` | `number` | 动画的总周期时间（毫秒）。如果 `loops` 也为 0，则 `0` 表示连续/无休止的执行。 |
| `loops` | `number` | 动画应重复的次数。`0` 表示无休止的循环。 |
| `pending` | `number` | 动画开始前的延迟（毫秒），或连续循环之间的等待时间。 |
| `timeline`| `array`  | 一组动作步骤，描述了动画随时间的变化。 |

---

## 时间轴执行步骤 (Timeline Execution Steps)

`timeline` 是一个对象数组。每个对象规定了在其定义的时间窗口内的特定变换或属性修改。

```json
{
  "time": [0, 2000],
  "type": "rotate",
  "axis": "Y",
  "mode": "add",
  "value": 0.2
}
```

### 时间轴属性

#### 1. `time` (时间定义)
指定了动作在父动画 `duration` 中发生的时间区间。
*   **数字 (Number)**: 例如 `0` 或 `1000`。动作在确切的毫秒标记处开始触发。
*   **数组/元组 (Array)**: 例如 `[start, end]`。动作在从开始到结束的整个持续时间内连续处理。

#### 2. `type` (动画目标类型)
定义了正在被操作的属性。

| 类型 | 描述 | 引擎实现方式 |
|---|---|---|
| `move` | 空间平移。 | 修改 `Three.js` Mesh 的 `position`。 |
| `rotate` | 空间旋转。 | 修改 `Three.js` Mesh 的 `rotation`。 |
| `scale` | 尺寸缩放。 | 修改 `Three.js` Mesh 的 `scale`。 |
| `color` | 纯色材质颜色改变。 | 动画修改 `Three.js` Mesh 材质的 `.color`。 |
| `texture`| 材质纹理替换。 | 在网格材质上切换激活的 Texture IDs。 |
| `opacity`| 不透明度渐变。 | 动画修改 `Three.js` Mesh 材质的 `.opacity`。 |
| `morph` | 几何体切换/变形。 | 切换或插值 `Three.js` 几何图形。 |
| `fall` | 相机/视角特效。 | 可在此类别设置为 `category: "camera"` 时使用。 |

#### 3. `axis` (方向/轴)
定义了操作的轴心（主要用于 `move`, `rotate`, 和 `scale`）。
*   **有效值**: `"X"`, `"Y"`, `"Z"`, `"XY"`, `"XZ"`, `"YZ"`, `"XYZ"`.

#### 4. `mode` (数值插值策略)
定义了在 `time` 区间内 `value` 是如何应用到基础属性上的。

| 模式 | 输入 Value 的类型 | 行为 |
|---|---|---|
| **`add`** | `number` | 增量添加数值（例如：每帧连续旋转 `0.2` 弧度）。 |
| **`set`** | `number` | 将属性硬设置为该指定数值。 |
| **`set`** | `number[]` (size > 2) | 在时间窗口内按顺序在线性插值/遍历数组元素。 |
| **`multi`**| `number` / `number[]` | 用给定值乘以基础属性。 |
| **`random`**| `[min, max]` | 在 `min` 和 `max` 区间内随机选取一个值。 |
| **`random`**| `number[]` (size > 2) | 从提供的数组中随机选取一个元素。 |

#### 5. `value` (数据负载 Payload)
要应用的数值乘数、角度、坐标或十六进制颜色。
*   如果 `value` 作为一个函数传递（在 JS 运行时中），引擎会动态执行该函数。
*   *注意：为了严格的数据序列化（JSON/上链），`value` 应保持为数字或数字数组格式。*

#### 6. `repeat` (局部循环率 - 可选)
定义在特定时间区间内的谐波振荡或分段频率。
*   如果设置了该值，`time` 窗口将被切分成 `repeat` 个片段，在该单一时间轴块内重复振荡或闪烁该值。

#### 7. `category` (领域上下文 - 可选)
区分对象的类型。例如，设置 `"category": "camera"` 意味着该时间轴是在操作第一人称视角，而不是一个空间网格。

---

## 示例序列 (Example Sequences)

### 无尽漂浮 (类似正弦波的上下浮动)
```json
{
  "name": "Floating",
  "duration": 2000,
  "timeline": [
    {
      "time": [0, 1000],
      "type": "move",
      "mode": "add",
      "axis": "Y",
      "value": 0.05
    },
    {
      "time": [1000, 2000],
      "type": "move",
      "mode": "add",
      "axis": "Y",
      "value": -0.05
    }
  ]
}
```

### 警报闪烁
```json
{
  "name": "AlertFlash",
  "duration": 1000,
  "loops": 5, 
  "timeline": [
    {
      "time": [0, 1000],
      "type": "color",
      "mode": "set",
      "repeat": 4,
      "value": [0xFF0000, 0xFFFFFF]
    }
  ]
}
```
