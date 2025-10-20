# Septopus World 引擎说明

## 基础信息

* 开发语言: Javascript
* 3D渲染引擎: [three.js](https://threejs.org/)
* 客户端: 手机 & PC桌面
* 区块链网络: 多网络支持，部署在Solana
* 多语言文档: [EN](README.md) | [CN](README_cn.md)

## 代码组织

### 引擎组件

* [核心框架](docs/cn/framework.md)，程序运行的核心部分，实现对数据进行管理、转换等功能；提供全局数据功能；数据修改控制流程；帧同步的实现；世界时间计算；天气系统计算等。

* [渲染器](docs/cn/renderer.md)，显示数据的实现，支持多渲染器多形态输出，例如第一人称的3D用户界面，2D的小地图。

* [控制器](docs/cn/controller.md)，3D内运动及浏览的控制；2D地图的浏览及互动控制。

* [用户界面](docs/cn/ui.md)，各种类型的对话框；数据输入表单；玩家状态显示等。

* [区块链数据](docs/cn/datasource.md)，区块链网络的数据订阅；链上合约的交互；IPFS的存取支持等。

* [附属物](docs/cn/adjunct.md)，地块上的物品；编辑属性的实现；选中状态的呈现等；加载外部资源等。

* [扩展插件](docs/cn/adjunct.md)，地块上物品的扩展组件；动态可配置的加载；受控调用的实现等。

### 基础库

* [3D基础库](docs/cn/three.md)，three.js的输出功能

* [2D基础库](docs/cn/two.md)，在canvas上进行2D绘制的功能

## 坐标转换

* Septopus有以下3中主要的坐标系统

|  坐标系   | 说明  |
|  ----  | ----  |
| 地块坐标  | 以`地块`来定位的坐标，最大为地块的XY尺寸的限制 |
| 世界坐标  | 以`世界`来定位的坐标，最大为世界`地块`的XY数量限制 |
| 显示坐标  | 以用户显示屏幕的坐标 |

* Septopus的东南西北的定义如下

|  方向   | 说明  |
|  ----  | ----  |
| 北方  | Y轴指向的方向 |
| 南方  | -Y轴指向的方向 |
| 东方  | X轴指向的方向 |
| 西方  | -X轴指向的方向 |
| 上方  | Z轴指向的方向 |
| 下方  | -Z轴指向的方向 |

* Septopus的方位定义如下，以物体本身在世界坐标中的情况来定义

|  方位   | 定义值  | 说明  |
|  ----  | ----  |----  |
| 上面  | 0 | 从Z轴(世界坐标)的向下看 |
| 下面  | 1 | 从-Z轴(世界坐标)的向上看 |
| 前面  | 2 | 从南向北看到的面 |
| 后面  | 3 | 从北向南看到的面 |
| 左面  | 4 | 从东向西看到的面 |
| 右面  | 5 | 从西向东看到的面 |

## 中间态格式

* Septopus使用了多种中间态格式，用于不同的功能模块进行数据处理，降低各模块的耦合度。

* 中间态使用JSON格式，更方便阅读及执行。Septopus引擎数据操作的执行方式

|  功能   | 数据流程  |
|  ----  | ----  |
| 3D显示  | `链上数据` --> `标准格式` --> `3D格式` |
| 2D显示  | `链上数据` --> `标准格式` --> `2D格式` |
| 高亮选择  | `链上数据` --> `标准格式` --> `3D格式`｜`2D格式` |
| 数据修改  | `输入输出格式` --> `修改格式` --> `标准格式` |
| 数据存储  | `标准格式` --> `链上数据` |

### 标准格式

* 内容显示最主要的格式，3D或者2D的数据都是基于此来创建。

```Javascript
    {
        x:3000,             //septopus坐标系里的x轴尺寸
        y:200,              //septopus坐标系里的y轴尺寸
        z:1800,             //septopus坐标系里的z轴尺寸
        ox:2000,            //septopus地块坐标的x轴偏移
        oy:8000,            //septopus地块坐标的y轴偏移
        oz:900,             //septopus地块坐标的z轴偏移
        rx:0,               //septopus坐标系里的x轴旋转
        ry:0,               //septopus坐标系里的y轴旋转
        rz:0,               //septopus坐标系里的z轴旋转
        material:{          //材质属性
            texture:30,         //链上记录的index，先从链上获取IPFS地址后，再从网络获取资源
            repeat:[10,10],     //材质平铺属性
            color:0xf3f5f6,     //数据加载失败显示的颜色
        },
        stop:true,          //是否具备stop属性
        animate:3           //动画运行方式的索引
    }
```

* 对象选择数据标准，在event和trigger里使用

```Javascript
    // 附属物的选中
    {
        x:2025,
        y:619,
        world:0,
        adjunct:"wall"
        index:0,
    }

    // 系统组件的选中
    {
        category:"system",
        chain:["time","year"],
    }

    // UI组件的选中
    {
        category:"UI",
        chain:["pop"],
    }
```

### 资源加载标准

* 资源的统一格式，保存在IPFS。支持多种不同类型，例如，纹理、模型等3D资源。

```Javascript
    {
        type:"module",              //资源类型，["module","texture","avatar",...]，可按需扩展
        format:"fbx",               //文件格式
        metadata:{},                //更多附属的属性，按照需要加载
        data:"BASE64_FILE_STRING",  //原始文件base64编码后的数据
    }
```

```Javascript
    {
        type:"text",                //文本资源类型，用于给trigger进行显示调用
        format:"json",              //文件格式
        metadata:{lang:"cn"},           //更多附属的属性，按照需要加载
        data:"BASE64_FILE_STRING",  //原始文件base64编码后的数据
    }
```

### 3D格式

* 中间态的3D描述数据，可以从`3D格式`转换成渲染器需要的数据。

```Javascript
    {
        type: "box",            //3D物体的形状，["box","ball",...]，可按需扩展
        index: 2,               //在block内的同一种附属物的索引值
        params: {               //基础的3D参数
            size: [300,800,1200],           //尺寸参数，此为box的，不同形状的物体，存在不同
            position: [3000,4000,800],      //septopus坐标系的位置值
            rotation: [ Math.PI ,0, 0],     //septopus坐标系的旋转值
        },
        material: {             //材质信息
            texture:30,         //链上记录的index，先从链上获取IPFS地址后，再从网络获取资源
            repeat:[10,10],     //材质平铺属性
            color:0xf3f5f6,     //数据加载失败显示的颜色
        },
    }
```

### 2D格式

```Javascript
    { 
        type:"fill",            //2D绘制的分类，["line","fill","sector","text","image", ... ]
        index:0,                //在block内的同一种附属物的索引值
        params:{                //基础的2D参数
            size:[300,400],         //尺寸参数，此为矩形的，不同形状的物体，存在不同
            position:[4000,6500],   //septopus坐标系的定位
            rotation:0,             //septopus坐标系的旋转
        },
        style:{                 //绘制样式信息
            color:0xf3f5f6,         //绘制颜色
            opacity:0.8,            //透明度
            width:3,                //绘制的笔宽
        },
    }
```

### 修改格式

* `Modified Format` is used to make the modification unique format, then easy to make changes.

```Javascript
    //single modification task sample
    /***************** add *****************/
    {
        adjunct:"wall",         //附属物名称
        action:"add",           //附属物操作, ["set","add","remove"]
        params:{                //操作参数
            x:1.6,              //STD标准里的 key --> value的值
            oy:3.6,             //STD标准里的 key --> value的值
        }
    }

    /***************** remove *****************/
    {
        adjunct:"wall",,         //附属物名称
        action:"remove",         //附属物操作, ["set","add","remove"]
        params:{                 //操作参数              
            index:1,             //附属物在地块里同类型的索引值
        }
    }

    /***************** set/update *****************/
    {
        adjunct:"wall",         //附属物名称
        action:"set",           //附属物操作, ["set","add","remove"]
        params:{                //操作参数
            index:1,            //附属物在地块里同类型的索引值
            z:1.3,              //STD标准里的 key --> value的值
        }
    }
```

### 输入输出格式

```Javascript
    //single input
    {
        type:"number",              //输入的类型
        key:"x",                    //STD里的键名
        value:100,                  //当前的值
        label:"X",                  //标签显示内容
        desc:"X of wall",           //内容描述
        icon:"",                    //显示图标
        valid:(val,cvt)=>{},        //数据合法性检测方法
        action:(ev)=>{},            //点击后的动作，需要{type:"button"}
    },                 
```

### URL的Hash格式

```Text
    https://world.septopus.xyz/deme#20025_504_0|8_3_0|0_0_36
```

### 触发器格式

## 部署打包

* 使用`esbuild`打包成单一文件。

```bash
    node esbuild.config.js --input-type=module
```