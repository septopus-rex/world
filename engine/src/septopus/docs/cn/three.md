# 3D数据基础库

* Septopus采用`three.js`作为渲染引擎，为了便于分离`Septopus引擎`和能提供多渲染引擎渲染的扩展，将对`three.js`的调用封装成为该库。

* `three.js`是一个复杂的3D渲染引擎，代码量较大，拆分成了多一个文件，目录位于[three库](../../three/)。

## 库文件引用

* 封装的入口文件为[entry.js](../../three/entry.js)，单文件引入。

* 支持的功能如下表。

|  方法名   | 主要用途  |  处理对象  |
|  ----  | ----  | ----  |
|  `get`  | 获取到three.js的内置对象  | 所有的3D组件  |
|  `mesh`  | 生成用于渲染的mesh，将其放入scene后即可进行3D显示  | 几何体和材质  |
|  `boundy`  | 计算模型的尺寸及重心  | 解析后的3D模型  |

## 对象类型

* 对`three.js`进行整理之后，将引用以下类别的对象及方法

|  对象分类   | 主要用途  | 储存位置  |
|  ----  | ----  | ----  |
|  基础组件  | 3D渲染环境搭建的基础及核心对象，如场景、相机、Mesh等  | `THREE_FOLDER/basic`  |
|  几何物体  | 创建3D内容的几何物体  | `THREE_FOLDER/geometry`  |
|  灯光  |  不同的灯光效果，用于基础照明及创建氛围 | `THREE_FOLDER/light`  |
|  材质  |  赋于`几何体`不同材质，形成丰富多彩的3D内容  | `THREE_FOLDER/material`  |
|  纹理  |  将图像进行解析，用于`材质`的纹理  | `THREE_FOLDER/texture`  |
|  模型加载器  |  加载不同类型的外部3D软件创建的模型 | `THREE_FOLDER/loader`  |
|  扩展功能  |  经过二次封装的组件 | `THREE_FOLDER/extend`  |

## 外部模型导入

* 使用`three.js`导入外部模型，主要需要处理`scale`和`坐标轴`的问题。
* 目前支持的模型导入格式如下

|  文件类型   | 支持软件  | 导出格式  | 动画支持 |
|  ----  | ----  | ---- | ---- |
|  FBX   |  Autodesk | Group  | ❌ |
|  3MF   |  3MF Consortium, 3D打印使用 | Group  | ❌ |
|  GLTF   |  Khronos Group,开放格式 | {scene:{Group},animations:[],asset:{},scenes:[]}  | ✅ |