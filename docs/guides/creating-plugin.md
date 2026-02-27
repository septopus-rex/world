# 如何编写系统级插件 (Creating a Plugin)

有别于附属物 (Adjunct) 那样实体化挂接在地形上的积木块，系统级插件 (Plugin) 是用来扩展 Septopus 根框架抽象能力的组件。常见系统插件包括：二维码解析器、外部网络通讯器或定制的 UI 渲染框架。

## 1. 插件结构

一个引擎级的 Plugin 通常会在 `plugin/` 目录下创建。不同于 Adjunct 复杂的管线接口，插件的设计是完全自由且偏向于功能性导向的。

你可以将其暴露为一个独立的工厂模块，而在启动引擎前，你需要通过全局总线 (`VBW` 对象) 将它手动挂载：

```javascript
// plug_mytool.js
const MyToolPlugin = {
    init: (engineContext) => {
        console.log("My Tool is loaded into Septopus World!");
    },
    // 支持你自定义的核心功能
    createPortal: () => { ... }
}

export default MyToolPlugin;
```

## 2. 挂载至系统生态

为了使这个插件能在整个世界的任何角落（包括触发器和 Adjunct 内）随意读取，你应该将其插入根级域里：

```javascript
import MyToolPlugin from './plug_mytool';
import { VBW } from "septopus-core";

// 在引擎启动之前注册进全局挂载树
if (!VBW.plugin) VBW.plugin = {};
VBW.plugin.mytool = MyToolPlugin;

// 唤醒它
VBW.plugin.mytool.init();
```

## 3. 常见案例：二维码挂件插件 (`plugin/plug_qr.js`)

在 Septopus 原生实现中，有一个很好的功能范例——QR 码插件。
它的业务逻辑是：它并不创造地形，但当某个物体被点击且附带了特定的 Link 路由配置时，它能在 3D 摄像机视角的正中间利用 DOM 顶层或者 Canvas 画出一张二维矩阵码，并阻止后方物理射线检测穿透（防误触）。

当你开发这类型插件时，应当多加利用**全局事件总线 (Event)**。
尽量避免插件直接写死依赖具体的世界坐标，而是订阅抽象事件：

```javascript
// 在你的插件里监听系统的通用信号
VBW.event.on("system", "launch", (ev) => {
    console.log("插件捕捉到场景已就绪！");
});
```
