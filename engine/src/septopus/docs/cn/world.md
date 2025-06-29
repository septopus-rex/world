# 世界说明

* `世界`(world)是Septopus的发行单元，可以通过世界的配置来实现不同风格和尺寸的`世界`。例如，在Septopus的设置中，将发行99个独立的`世界`，每个世界的尺寸为4096*4096，每个`地块`的尺寸为物理世界的16m*16m。

## 世界的作用

* 确认`参与者`的身份，是整个Septpus进行治理的基础。
* 内容创作的载体。
* 创建虚拟世界的社会关系。

## 世界的发行

* 新发行`世界`需要在前一个`世界`完全销售的情况下才行。
* `世界`需要设置一个`领主`，来配置`世界`的参数。`领主`的治理，可以带来`世界`的变化，让不同的`世界`可以差异化的竞争。

## 基本属性

* Septopus的世界，使用很多共用的属性。

```Javascript
    {
        time:{      //time setting for all worlds
            year:12,        // months/year
            month:30,       // days/month
            day:24,         // hours/day
            hour:60,        // minutes/hour
            minute:60,      // seconds/minute
            second:1000,    // microseconds/second
            speed:20,       // rate =  septopus year / reality year
        },
        sky: {      //sky setting for all worlds
            sun: 1,         //amount of sun
            moon: 3,        //amount of moon
        },
        weather: {
            category: ["cloud", "rain", "snow"],
            grading: 8,
        },
    }
```

## 世界的参数

* `世界`参数以JSON的形式保存在合约里，只有`领主`可以修改更新。

```Javascript
    {
        player:{
            start:{
                block:[2025,619],   //玩家的默认启动位置
                position:[8,8,0],   //默认开始的位置[x,y,z],z为站立高度
                rotation:[0,0,0],   //默认的旋转位置
            },
            body:{
                height: 1.7,
                shoulder: 0.5,
                chest: 0.22,
            },
            capacity: {
                move: 0.03,          //move speed, meter/second
                rotate: 0.05,        //rotate speed of head
                span: 0.31,          //max height of walking
                squat: 0.1,          //height of squat
                jump: 1,             //max height of jump
                death: 3,            //min height of fall death
                speed: 1.5,          //move speed, meter/second
                strength: 1,         //strength time for jump. Not used yet.
            },
        },
    }
```

* 世界有许多参数可以配置，例如设置支持的模式等。

## 世界的终止

* `世界`不设置终止方式，销售一旦开启就不会关闭。
* Septopus预设的99个独立`世界`发行完毕后，不再增发，不能看成是`世界`的终止，只是发行的终止。
* 当`世界`没有玩家参与的时候，才是真正意义上的终止。