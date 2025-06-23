# Septopus World 引擎说明

## 基础信息

* 开发语言: Javascript
* 3D渲染引擎: [three.js](https://threejs.org/)
* 客户端: 手机 & PC桌面
* 区块链网络: 多网络支持，部署在Solana
* 多语言文档: [EN](README.md) | [CN](README_cn.md)

## 引擎构成

* [核心框架](docs/cn/framework.md)，程序运行的核心部分，实现对数据进行管理、转换等功能；提供全局数据功能；数据修改控制流程；帧同步的实现等。

* [渲染器](docs/cn/renderer.md)，显示数据的实现，支持多渲染器多形态输出，例如第一人称的3D用户界面，2D的小地图；

* [控制器](docs/cn/controller.md)，3D内运动及浏览的控制；2D地图的浏览及互动控制。

* [用户界面](docs/cn/ui.md)，各种类型的对话框；数据输入表单；玩家状态显示等。

* [区块链数据](docs/cn/datasource.md)，区块链网络的数据订阅；链上合约的交互；IPFS的存取支持等。

* [附属物](docs/cn/adjunct.md)，地块上的物品；编辑属性的实现；选中状态的呈现等；加载外部资源等。

* [扩展插件](docs/cn/adjunct.md)，地块上物品的扩展组件；动态可配置的加载；受控调用的实现等。

## 基础库

* [3D基础库](docs/cn/three.md)，three.js的输出功能

* [2D基础库](docs/cn/two.md)，在canvas上进行2D绘制的功能

## 中间态格式

* Septopus使用了多种中间态格式，用于不同的功能模块进行数据处理，降低各模块的耦合度。

* 中间态使用JSON格式，更方便阅读及执行。

### 标准格式

### 资源加载标准

### 3D格式

### 2D格式

### 修改格式

* `Modified Format` is used to make the modification unique format, then easy to make changes.

```Javascript
    //single modification task sample
    /***************** add *****************/
    {
        adjunct:"wall",
        action:"add",
        params:{
            x:1.6,
            oy:3.6,
        }
    }

    /***************** remove *****************/
    {
        adjunct:"wall",
        action:"remove",
        params:{
            index:1,
        }
    }

    /***************** set/update *****************/
    {
        adjunct:"wall",
        action:"set",
        params:{
            index:1,
            z:1.3,
        }
    }
```

### 输入输出格式