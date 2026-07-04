# 快速开始 (Getting Started)

当你准备将 Septopus 世界嵌入你自己的 Web 项目或是构建新的客户端时，本指南将带你了解引擎引导启动的核心流程。

## 1. 引擎的入口

Septopus 是一个以数据为驱动单例应用（Singleton）。它的主入口被封装在 `World` 模块中。启动整个渲染管线和逻辑循环的代码极其简单：

```javascript
import { World } from "septopus-core";

// DOM 容器的 ID，引擎将在其中织入 Canvas 和 UI
const containerId = "septopus-container";

// 启动世界
World.first(containerId);
```

## 2. 启动流 (Launch Flow) 在底层做了什么？

当你调用了 `World.first()` 后，引擎会在底层自动执行一系列**高度异步化**的操作：

1. **环境准备与 DOM 织入**：在目标容器内构建三维画布（Canvas）和交互浮层（UI Layer）。
2. **状态探查**：读取本地缓存（LocalStorage）或验证加密签名以获取当前 `玩家 (Player)` 的上一次退出位置（所在的世界 ID 及具体坐标）。如果无存档，将放置于该世界的出生点（Spawn Point）。
3. **合约与网络握手**：连接数据层并绑定订阅事件，开始提取当前 `世界 (World)` 的基本配置参数（如重力、天气规则等）。
4. **地块加载与邻近推流**：基于玩家所处的地块，向四周扩散拉取九宫格（由扩展参数决定大小）的地块 Raw 数据。
5. **解析资源**：找出地块上所需用到的模型 (Module) 与材质 (Texture)，将其推入**帧同步加载队列 (Frame-Sync Queue)** 以避免浏览器阻塞卡顿。
6. **启动引擎心跳**：挂载 `控制器 (Controller)` 以接受鼠标/键盘输入，并正式利用 `requestAnimationFrame` 唤起 Three.js 渲染器，宣告场景加载成功。

## 3. 从零搭建提示

在开发前，请通过调用 `VBW.detect()` 测试一下当前浏览器的兼容性：

```javascript
import { VBW } from "septopus-core";

const isSupported = VBW.detect();
if (!isSupported) {
    console.error("当前浏览器环境不支持 Septopus WebGL 渲染管线。");
}
```

所有的环境配置（如自定义 UI 主题等）可以在调用 `first()` 前，通过修改 `VBW.setting` 中对应的配置项注入。
