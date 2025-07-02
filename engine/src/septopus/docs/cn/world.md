# 世界实现说明

* `世界`(world)是Septopus的发行单元，可以通过世界的配置来实现不同风格和尺寸的`世界`。例如，在Septopus的设置中，将发行99个独立的`世界`，每个世界的尺寸为4096*4096，每个`地块`的尺寸为物理世界的16m*16m。

## 世界基础信息

### 世界的作用

* 确认`参与者`的身份，是整个Septpus进行治理的基础。
* 内容创作的载体。
* 创建虚拟世界的社会关系。

### 世界的发行

* 新发行`世界`需要在前一个`世界`完全销售的情况下才行。
* `世界`需要设置一个`领主`，来配置`世界`的参数。`领主`的治理，可以带来`世界`的变化，让不同的`世界`可以差异化的竞争。
* `领主`的权限可以售卖转让。

### 基本属性

* Septopus的世界，所有`世界`共用的属性。

```Javascript
    //!important, 通用的世界配置，在初始化时写完，不能修改.
    {
        world:{     //Septopus的整体设置
            name: "Septopus World",          //Septopus的名称
            desc: "Septopus description.",   //Septopus世界的描述
            size: [4096, 4096],              //每个世界的尺寸 
            block: [16, 16, 32],             //单个block的尺寸限制
            diff: 4,                         //海拔设定公差值，只能比周边8块的均值升高的值
            max:99,                          //最大世界发行数量
        },
        time:{      //Septopus的时间体系设定
            year:12,        // months/year
            month:30,       // days/month
            day:24,         // hours/day
            hour:60,        // minutes/hour
            minute:60,      // seconds/minute
            second:1000,    // microseconds/second
            speed:20,       // rate =  septopus year / reality year
        },
        sky: {      //Septopus的天空设定
            sun: 1,         //amount of sun
            moon: 3,        //amount of moon
        },
        weather: {  //Septopus的气候系统的设定
            category: ["cloud", "rain", "snow"],
            grading: 8,
            detail:{        //不同天气状况下的梯度，`风力`结合着天气来实现。
                cloud:["sunny","",...],     //多云天气的8个梯度，从大晴天开始
                rainy:["frog","",...,""],   //下雨天气的8个梯度，从雾开始
                snow:["",],                 //下学天气的8个梯度，从冰雹开始
            },
            degree: 40,     //温度条件，基础的问题，通过hash可以进行微调
        },
    }
```

### 世界的参数

* `世界`参数以JSON的形式保存在合约里，只有`领主`可以修改更新。

```Javascript
    //!important, 每个世界的单独配置，领主可以进行修改
    {
        world:{     //world的可配置参数
            desc:"",            //单个世界的描述
            nickname:"",        //单个世界的昵称
            mode:[ //支持的运行模式
                "ghost",        //非注册用户访问
                "normal",       //注册用户访问
                "game",         //预渲染预加载的游戏模式
            ],     
            accuracy: 1000,     //初始的显示尺寸支持。默认单位为m，这里是转换成mm来显示
            index:0,            //世界编号
        },
        block:{     //地块的world可配置的参数
            elevation: 0,       //初始海拔高度
            max: 30,            //单地块最大附属物数量
            color:0x10b981,     //默认地块颜色
            texture:2,          //默认地块贴图
        },
        player:{
            start:{
                block:[2025,619],   //玩家的默认启动位置
                position:[8,8,0],   //默认开始的位置[x,y,z],z为站立高度
                rotation:[0,0,0],   //默认的旋转位置
            },
            body:{     //基础的玩家配置，如需特殊调整，用scale的方式来实现.Avatar里需要有这些参数，不存在的话，就用这个配置
                //height: 1.7,        //默认玩家身高
                shoulder: 0.5,      //肩膀宽度
                chest: 0.22,        //胸部厚度
                body:[0.3,0.4, 0.2, 0.8],  //身体高度分段,[头部，身体，臀部，腿部]
                head:[0.25,0.05],           //头部的长度，[头高度，脖子]
                hand:[0.2,0.2,0.1],         //手臂长度,[上臂，下臂，手]
                leg:[0.5,0.5,0.1],          //腿的长度,[大腿，小腿，脚]
            },
            capacity: {     //玩家的运动能力（改成通过body进行计算）
                //move: 0.03,          //move speed, meter/second
                rotate: 0.05,        //rotate speed of head
                //span: 0.31,          //max height of walking !important 这个后面需要根据玩家身体尺寸进行计算
                //squat: 0.1,          //height of squat
                //jump: 1,             //max height of jump
                //death: 3,            //min height of fall death
                //speed: 1.5,          //move speed, meter/second
                strength: 1,         //strength time for jump. Not used yet.
            },
            bag:{           //游戏模式下的背包系统配置
                max:100,            //最大携带物品数量
            },
            avatar:{        //虚拟形象的配置
                max:2*1024*1024,        //虚拟形象文件的最大尺寸
                scale:[2,2,2],        //虚拟形象身体尺寸的最大放大比例, [高,宽,深]
            },
        },
    }
```

### 世界的终止

* `世界`不设置终止方式，销售一旦开启就不会关闭。
* Septopus预设的99个独立`世界`发行完毕后，不再增发，不能看成是`世界`的终止，只是发行的终止。
* 当`世界`没有玩家参与的时候，才是真正意义上的终止。

## 世界的启动

* 通过上面的介绍，程序启动运行世界，是一个涉及到很多动态数据的过程。因此，将其独立出来，也是作为Septopus世界的启动入口来对待。

* 世界启动的方法在`World.first()`，主要执行了以下操作：
    1. 构建Dom，用于输出信息；
    2. 绑定订阅事件，自动获取订阅的链上数据；
    3. 获取`玩家`的定位信息，准备加载数据;
    4. 根据`玩家`的信息，加载`世界`的配置文件；
    5. 根据`玩家`所在的`地块`信息，加载对应区域的`地块`信息；
    6. 分析`地块`，获取到需要链上加载的资源，推入到帧同步的队列里；
    7. 运行渲染器；
    8. 运行控制器；
