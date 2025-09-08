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