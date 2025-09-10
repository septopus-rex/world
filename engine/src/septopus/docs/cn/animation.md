# 动画效果

* Septopus支持统一的`基础动画`，以便于`附属物`的开发，减少动画处理代码。
* Septopus支持扩展的`自定义`动画，由`附属物`来实现效果，返回动画实现的方法。
* 所有的动画，由`基础动画`复合而成，`附属物`传递回复合动画的参数。
* 动画实现由`渲染器`来实现，用帧数来计算时间。
* Septopus其他部分的动画效果，也是这么实现的，例如`触发器`引发的动画效果。
  
## 基础动画

* 动画的数据结构如下：

```Javascript
  //返回的动画对象，可以使用function作为值返回
  {
    "name": "TwinkleAndRotate",   //动画的名称，用来简单描述动画效果
    "target":{                    //动画执行的目标
      "x": 2025,
      "y": 667,
      "world":0,
      "adjunct":"box",
      "index":1,
    },
    "duration": 3000,             //动画的循环时间，以ms为单位。0:持续执行;
    "loops": 0,                   //动画循环次数。0:endless; >0:run times
    "timeline": [                 //动画的实现，在时间线上的分布
      {
        "time": 0,                //动画开始的时间，格式为"start"或"[start,end]"
        "type": "rotate",         //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "axis": "Y",              //动画执行的坐标轴，为支付串，为["X","Y","Z","XY","XZ","YZ","XYZ"]中的一种
        "mode": "add",            //数值设置方式，["add","set","multi"]中的一种
        "value": 0.2              //设置的值             
      },
      {
        "time": 2000,             //动画开始的时间，格式为"start"或"[start,end]"
        "type": "rotate",         //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "mode": "set",            //数值设置方式，["add","set","multi","random"]中的一种
        "axis": "X",              //动画执行的坐标轴，为支付串，为["X","Y","Z","XY","XZ","YZ","XYZ"]中的一种
        "value":(now,duration,axis)=>{    //可以返回数组，和mode配合使用

        },
      },
      {
        "time": 500,              //动画开始的时间，格式为"start"或"[start,end]"
        "type": "scale",          //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "mode": "multi",          //数值设置方式，["add","set","multi","random"]中的一种
        "axis": "XYZ",            //动画执行的坐标轴，为支付串，为["X","Y","Z","XY","XZ","YZ","XYZ"]中的一种
        "repeat": 3,              //值切换的速度，默认为1，在动画期间，切换多少次的值
        "value": [0.8, 1.2 ],     //值选取方式，当为数组是，在[start,end]之间，随机选取
      },
      {
        "time": [1000,1200],      //动画开始的时间，格式为"start"或"[start,end]"
        "type": "move",           //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "mode": "set",            //数值设置方式，["add","set","multi","random"]中的一种
        "axis": "Y",              //动画执行的坐标轴，为支付串，为["X","Y","Z","XY","XZ","YZ","XYZ"]中的一种
        "repeat": 6,              //值切换的速度，默认为1，在动画期间，切换多少次的值
        "value": [0.8, 1.2 ],     //值选取方式，当为数组是，在[start,end]之间，随机选取
      },
      {
        "time": [1200,1800],      //动画开始的时间，格式为"start"或"[start,end]"
        "type": "move",           //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "mode": "random",         //数值设置方式，["add","set","multi","random"]中的一种
        "axis": "Y",              //动画执行的坐标轴，为支付串，为["X","Y","Z","XY","XZ","YZ","XYZ"]中的一种
        "repeat": 2,              //值切换的速度，默认为1，在动画期间，切换多少次的值
        "value": [0.83,0.89,1.12,1.28],     //值选取方式，当mode为random时，随机选取
      },
      {
        "time": [500,1000],       //动画开始的时间，格式为"start"或"[start,end]"
        "type": "texture",        //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "mode": "random",         //数值设置方式，["add","set","multi","random"]中的一种    
        "repeat": 2,              //值切换的速度，默认为1，在动画期间，切换多少次的值
        "value": [12,22,33,44],   //值选取方式，为需要使用的texture的ID值列表
      },
      {
        "time": [1500,2000],      //动画开始的时间，格式为"start"或"[start,end]"
        "type": "color",          //基础动画方式，["move","rotate","scale","texture","color"]中的一种
        "mode": "set",            //数值设置方式，["add","set","multi","random"]中的一种    
        "repeat": 1,              //值切换的速度，默认为1，在动画期间，切换多少次的值
        "value": [0x3fff2,0x67fa32,0x34ffa4],      //当mode为set时，顺序执行
      },
    ]
  }
```

### 基础键值设置

|  键值   | 类型  | 作用  |
|  ----  | ----  | ----  |
|  name  |  string | 动画的名称 |
|  target | object  | 动画的执行对象 |
|  duration  | number  | 动画的时长  |
|  loops  | number  | 全局控制整个动画的重复次数 |
|  timeline  | object[] | 动画执行的动作列表 |

### `timeline`元素设置

* `time`的值处理，有两种类型

|  数据类型   | 执行结果  | 说明  |
|  ----  | ----  | ----  |
|  number  |  [start,animation.duration] | 动画开始的时间点 |
|  [number,number]  |  [start,end] | 动画执行的时段 |

* `type`的值设置及作用
  
|  动画名称   | 效果描述  | 实现方法  |
|  ----  | ----  | ----  |
|  位移(move)  |  3D物体在XYZ轴上移动位置 | 设置mesh的位置XYZ坐标 |
|  旋转(rotate) | 3D物体在XYZ轴上旋转角度  | 设置mesh的XYZ旋转值 |
|  缩放(scale)  | 3D物体在XYZ轴上按比例缩放  | 设置mesh的XYZ缩放值  |
|  材质(texture)  | 3D物体材质切换  | 更新mesh材质对象，使用指定的texture |
|  色彩(color)  | 3D物体色彩切换  | 更新mesh的材质对象 |

* `mode`和`value`的值处理，满足复杂的动画效果。当`value`为`function`时，使用计算返回的数据的类型来处理。
  
|  mode取值   | value类型  | 实现方法  |
|  ----  | ----  | ----  |
|  add  |  number | 将值加到对应的位置 |
|  set | number  | 将值加到对应的位置 |
|    | number[start,end]  | 数组长度为2的时候，为[start,end]形式，在动画时间内，随机设置其中的一个值 |
|    | number[]  | 在动画时间内，顺序设置对应的值 |
|  multi  | number  | 将值乘对应的位置  |
|    | number[]  | 在动画时间内，将值乘对应的位置 |
|  random  | number[start,end]  | 数组长度为2的时候，为[start,end]形式，随机选取其中的一个值 |
|    | number[]  | 在动画时间内，随机设置 |

* `repeat`的值处理。在时间段内，该动画切换的频率，即被执行的次数，为局部循环。

|  值   | 执行结果  |
|  ----  | ----  |
|  不设置  |  每帧都执行值设置 |
|  number  |  在`time`设置的时间段内，做插值频率计算，在时间点上进行值设置 |

* `bias`的值处理。只在`rotate`和`scale`时候发挥作用，用于实现偏心旋转和偏心缩放。
  
## 自定义动画

* 用户自定义的动画方法，也需要使用统一的逻辑来进行处理。