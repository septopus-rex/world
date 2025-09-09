# 动画效果

* Septopus支持统一的`基础动画`，以便于`Adjunct`的开发，减少动画处理代码。
* 所有的动画，由`基础动画`复合而成，`Adjunct`传递回复合动画的参数，供framework统一处理。

## 基础动画

* 基础动画的数据格式如下
  
  ```Javascript
    [
        {
            type: definition.EFFECTS_MOVING,        //[EFFECTS_MOVING,]
            param:{
                ax:"x",
                way:definition.MOVING_DELTA,        //
                value:[10,20],                      //when array, random | function to calculate
            },
        },
    ]
  ```

### 位移

### 旋转

### 缩放

### 贴图

### 爆炸

### 自定义动画

* 自定义动画的数据格式如下
  
  ```Javascript
    [
        {
            type: definition.EFFECTS_CUSTOMIZE,     //[EFFECTS_MOVING,]
            param:[],                               //params for animation method
            method:( ...this.params)=>{             //animation method of adjunct

            },
        },
    ]
  ```

### 动画格式

## 給AI的说明

```Chat
  设计一个JSON格式，支持3D的动画
  1. 动画是["moving","rotate","scale","texture"]中的一种
  2. 每种动画都有独立的参数可以调用
  3. 参数的值，支持3种方式: a.固定值, b.范围里的随机值, c.用function来计算值
  4. 参数有设置在XYZ轴中选择动画轴的参数
  5. 动画参数的设置方式，有[设置，累加]两种方式
  6. 对于自定义动画，使用独立的键值，指向一个动画function
```

```Chat
  动画的执行逻辑如下
  1. frame.js里的loop方法，获取动画的map，然后调用adjunct.hooks.animate(meshes,cfg), cfg的格式如下
  {"x":2024,"y":620,"world":0,"index":0,"adjunct":"box","effect":1}
  2. adjunct根据effect，返回"动画JSON"对象
  3. frame.js将动画对象传递给render_3d来进行动画处理。
  整理下上面设计的JSON，符合这个要求
```

## Gemini设计动画格式

```Javascript
  {
    "name": "TwinkleAndRotate",
    "duration": 2.0,
    "loops": -1,
    "timeline": [
      {
        "time": 0.0,
        "type": "rotate",
        "mode": "add",
        "axis": "y",
        "value": 0
      },
      {
        "time": 2.0,
        "type": "rotate",
        "mode": "add",
        "axis": "y",
        "value": "fn:360"
      },
      {
        "time": 0.5,
        "type": "scale",
        "mode": "set",
        "axis": "xyz",
        "value": [
          0.8,        //min
          1.2         //max
        ]
      },
      //根据上面的设计，进行补充，动画里可以进行贴图的切换
      {
        "time": [1,1.2],      //[ start, end ]
        "type": "moving",
        "mode": "set",
        "axis": "y",
        "value": [
          0.8,        //min
          1.2         //max
        ]
      },
      {
        "time": 0.5,
        "type": "texture",
        "mode": "set",
        "value": [12,22,33,44],     
      },
      {
        "time": 0.5,
        "type": "color",
        "mode": "set",
        "value": [0x3fff2,0x67fa32,0x34ffa4],     
      },
    ]
  }
```

### ChatGTP设计的格式

```Javascript
  {
    "animations": [
      {
        "type": "moving", 
        "axes": ["x", "y"], 
        "mode": "set", 
        "params": {
          "speed": { "value": 0.05 }, 
          "distance": { "random": [1, 5] }
        }
      },
      {
        "type": "rotate", 
        "axes": ["y", "z"], 
        "mode": "add",
        "params": {
          "angle": { "fn": "time => Math.sin(time) * 30" }
        }
      },
      {
        "type": "scale", 
        "axes": ["x", "y", "z"], 
        "mode": "set",
        "params": {
          "factor": { "value": 1.2 }
        }
      },
      {
        "type": "texture", 
        "axes": ["u", "v"], 
        "mode": "set",
        "params": {
          "image": { "value": "textures/metal.png" }
        }
      }
    ],
    "customAnimations": {
      "waveMotion": "function(time, obj) { obj.position.y = Math.sin(time) * 2; }",
      "pulseScale": "function(time, obj) { obj.scale.setScalar(1 + 0.2 * Math.sin(time*5)); }"
    }
  }
```
