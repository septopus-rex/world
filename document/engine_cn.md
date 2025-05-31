# Septopus World的3D引擎概述

* Septopus World需要全链运行，基于此，开发独立的3D引擎。
* Septopus World致力于让普通用户能够快速创建3D场景，建立虚拟世界的内容，采用的很多创新系统，例如，**格栅空间定位**、**弦粒子系统**等。
* Septopus World结合区块链网络的特性，引入了**链上时间**和**区块哈希随机**，来创造丰富多彩的虚拟世界。
* Septopus World采用全链部署，因此所有需要的数据都在链上，可以通过其他方式进行渲染呈现。
* Septopus引擎采用模块设计，不同的功能模块可以支持多种实现。
* Septopus引擎支持灵活的扩展，有针对构建内容的**附属物**方式，有提供额外功能的**插件**方式。

## 引擎的使用

* 引擎打包成独立的文件，方便调用。下面是调用的代码示例。

    ```Javascript
        const DOM_ID="";
        const cfg={...};
        Engine.launch(DOM_ID,cfg,()=>{
            console.log(`Septopus World loaded successful.`);
        });
    ```

* 引擎将自动侦测设备，采用Mobile或者PC模式进行运行。
* 引擎将缓存模型等数据，用于快速加载。

## Septopus World的构成

* Septopus的基础组组织单元为Block，每个Block的尺寸为16M*16M，每个世界由4096*4096块block构成。
* 每个Block只能由一个拥有着，对Block可以进行修改或者交易。

## 引擎的构成

* Septopus引擎由可扩展可配置的不同模块构成

### 核心部分

* 组织从链上获取数据、本地缓存数据、转换数据格式、启动控制器、启动渲染器等各种功能的核心组件。
* 链上数据的获取，支持直接从网络读取和从缓存服务器获取数据。支持IPFS的读取。
* 天气系统及时间系统，会反应到光照强度和3D环绕全景。

### 控制部分

* 支持不同设备的运动控制。
* 支持正常状态和编辑状态的控制。

### 渲染部分

* 3D渲染部分，目前采用的是[three.js](https://threejs.org/)，Javascript的OpenGL库，便于链上部署。
* 2D渲染部分，采用独立开发的渲染引擎

### 数据转换

* 链上数据通过压缩的方式进行保存，需要进行转换供不同的组件进行使用。

### 基础组件

* Block: 土地，Septopus World的基础构成，其他的附属物都是加载在block里。交易的主体，也同时作为身份认证。
* Stop: 阻拦体，用于限制Player运动的基础组件，可以用来构建真实物理世界的场景，也可以用来构建封闭空间。
* Trigger: 触发器，用于控制Septopus里的各种组件，是作为轻量游戏引擎的基础组件。不但可以控制3D场景内的物体，也可出发点外部输入等复杂功能。
* Light: 灯光，

### 附属物

* 附属物是可以在block上进行呈现的内容物.
* 附属物的组件样本如下：

    ```Javascript
        const reg={
            name:"sample",          //组件名称
            category:'adjunct',     //组件分类
            short:"a0",             //key的缩写，用于减少链上数据
            desc:"Sample adjunct.",
            version:"1.0.0",
        }

        const config={
            default:[],
            definition:{
                2025:[
                    ['x','y','z'],
                    ['ox','oy','oz'],
                    ['rx','ry','rz'],
                    'texture_id',
                    ['rpx','rpy'],
                ],
            }
        }

        const self={
            hooks:{
                reg:()=>{return reg},
                init:()=>{},
            },
            transform:{
                raw_std:(arr,cvt)=>{},
                std_raw:(arr,cvt)=>{},
                std_box:(obj)=>{},
                std_3d:(arr,va)=>{},        //std中间体，转换成3D需要的object
                std_2d:(arr,face)=>{},      //std中间体，转换成2D需要的数据
                acitve_3d:()=>{},           //3D高亮时候，需要的3D的object
                active_2d:()=>{},           //2D高亮时候，需要的2D的object
            },
        };

        export default {
            hooks:self.hooks,
            transform:self.transform,
        }
    ```

### 插件

* 用于实现和外部程序进行沟通的组件
* 可以在Septopus World里显示内容

## 开创性特性

### 空间定位格栅

* 3D物体的定位是一个挑战性的工作，在专业的3D软件里，主要通过切换不同的视角的方式来实现。在第一视角的Septopus World里，是没法实现的。Septopus World开创性的引入了空间定位格栅。
* 3D物体可以依附在3D格栅上来编辑位置，通过切换不同的空间格栅，可以实现全向的3D定位。

### 弦粒子系统

* 即使借助空间定位格栅系统，从零开始构建3D内容还是很有难度的。为了解决这个问题，Septopus World引入了**弦粒子系统**，通过预先设计的弦粒子，实现菜单式的选取，就可实现快速建造大量的3D内容。
* **弦粒子系统**是一种包含所有可能性的压缩信息包，其3D内容由基础的组件和附属物构成。通过空间的联通关系，来选取对应的内容，进行内容填充。

### 链上时间

* 区块链的区块高度，天生可以用作时间计数器，基于此，可以将Block上的附属物都添加上时间属性，可以用于优化最终渲染效果，或者实现和时间关联的计算。

### 区块哈希随机

* 结合**链上时间**，可以使用关联的区块哈希作为随机数，实现有趣的功能。例如，当在Septopus World里种植一棵“树”的时候，由于不同的种植时间和不同的区块哈希，两颗相同的种子将长成两棵相似却不一样的两棵树，就像现实世界中发生的那样。