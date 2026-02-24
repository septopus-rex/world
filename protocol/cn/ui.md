# Septopus UI 服务协议 (v1.0)

本协议定义了 Septopus 引擎与 UI 提供商（UI Provider）之间的标准化通信层。它确保引擎在保持 UI 无关性的同时，允许宿主应用（React, Vue, 移动端原生等）实现高质量、上下文相关的交互界面。

## 1. 核心接口：`IUIProvider`

任何 UI 提供商都必须实现以下方法以兼容引擎。

### `showGroup(id, items, position)`
显示一组交互元素（按钮）的标准方法。
- **id**: 分组的唯一标识符（例如 `"edit-controls"`）。
- **items**: `UIButtonConfig` 数组。
- **position**: 
    - `String`: 预设位置，包括 `top-left`, `top-right`, `bottom-left`, `bottom-right`。
    - `Object`: `{ x: number, y: number }`（归一化屏幕坐标，范围 0.0 到 1.0）。

### `showButton(id, config, position?)`
显示单个操作按钮。
- **position**: 可选的绝对坐标对象。

### `showModal(id, config)`
显示一个聚焦的模态对话框。
- **config**: 包含标题、正文和操作按钮的 `UIModalConfig`。

### `showToast(message, duration?)`
显示一条非阻塞的通知消息。

### `updateCompass(yaw)`
更新指南针组件的旋转角度。
- **yaw**: 弧度（Radians）。

### `updateWidget(id, data)`
用于更新复杂状态驱动组件（如：小地图、生命值、状态栏）的通用方法。
- **id**: 组件的唯一标识符。
- **data**: 组件特定的数据对象。

### `hide(id)`
通过唯一 ID 移除或关闭指定的 UI 元素或分组。

---

## 2. 数据结构

### `UIButtonConfig`
```typescript
interface UIButtonConfig {
    label: string;       // 显示文本
    icon?: string;        // 图标标识符（表情符号或 SVG 字符串）
    onClick: () => void; // 引擎回调函数
    active?: boolean;    // 激活状态（高亮）
    disabled?: boolean;  // 禁用状态（锁定交互）
    tooltip?: string;    // 悬停说明文字
    variant?: 'primary' | 'secondary' | 'danger'; // 主题样式变体
}
```

### `UIModalConfig`
```typescript
interface UIModalConfig {
    title: string;
    body: string;       // 支持简单 HTML 或 Markdown
    buttons: UIButtonConfig[];
    onClose?: () => void;
}
```

---

## 3. UI 生命周期与规则：“逻辑与呈现分离”

为了确保最大的灵活性，本协议严格区分了“大脑”（引擎）与“身体”（UI）：

1. **引擎权限（逻辑权）**：
    - 引擎决定**何时**显示哪些交互项（例如：选中物体触发编辑控制栏）。
    - 引擎提供 `onClick` 闭包，其中包含实际的状态变更逻辑。

2. **提供商权限（呈现权）**：
    - **布局与样式**：UI 提供商决定视觉主题、动画效果和容器样式。
    - **委派定位（Delegated Positioning）**：虽然引擎通过 `{x, y}` 坐标建议了显示位置（基于 3D 投影），但 UI 提供商拥有最终决定权。它可以：
        - *完全跟随*：直接在坐标处显示 UI（上下文感知 UI）。
        - *偏移/锚定*：以该坐标为参考点，但根据屏幕边界进行位置修正。
        - *忽略并停靠*：忽略坐标，将分组固定在预设的屏幕角落（固定位置 UI）。

3. **事件阻断**：UI 提供商必须在所有输入事件（`mousedown`, `click` 等）上实现 `e.stopPropagation()`，以防止 UI 交互误触发其下方的 3D 场景操作。

4. **备用实现**：引擎提供了一个基于原生 JS/CSS 的 `DefaultUIProvider`。宿主应用应通过 `engine.setUIProvider()` 进行覆盖，以提供高度集成的界面体验（例如使用 React 组件）。
