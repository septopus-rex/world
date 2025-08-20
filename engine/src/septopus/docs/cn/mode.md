# Septopus的运行模式

* 使用`Framework`的`mode`方法进行模式切换，调用如下：

```Javascript
    const target = { x: x, y: y, world: world, container: dom_id }
    const mode = def.MODE_EDIT;
    VBW.mode(mode, target, (done) => {
        
    });
```

## 正常模式 ( Normal )

* Normal Mode的请求如下

## 游戏模式 ( Game )

* 游戏模式是为了提升玩家的体验，有两方面的功能需要实现，一是预加载，二是启动触发器支持

* Game Mode的请求如下。在检测到block位置有Game的Setting时候，可以进入到Game模式。后期考虑Game的Adjunct来进行触发。

```Javascript
    const target = { x: x, y: y, world: world, container: dom_id }  //游戏开始的block
    const mode = def.MODE_GAME;
    const cfg={
        blocks:[        //预加载的block数据，该区域将绘制成游戏地图
            [1982,619],         //单一的预加载block
            [1983,619,5,5],     //预加载区域，[block_start_x,block_start_y,extend_x,extend_y]
        ],
        // service:[       //额外服务器的请求地址
        //     {
        //         baseurl:"https://public_API.fun"
        //         methods:[
        //             {
        //                 url:"overview",
        //                 parameters:[],
        //             },
        //             {
        //                 url:"mine",
        //                 parameters:[
        //                     {name:"address",type:"string",limit:[0,58]},
        //                     {name:"page",type:"integer",limit:[0,256]},
        //                     {name:"step",type:"integer",limit:[0,256]},
        //                 ],
        //             }
        //         ],
        //         version:"1.0.0",
        //     }
        // ],
        init:{
            sky:{},
            weather:{},
            start:{
                block:[1983,620],
                position:[],
                rotation:[],
            },
        },      
    }
    VBW.mode(mode, target, (done) => {
        
    });
```

* 游戏模式下，切断了所有的系统请求，不会对状态进行更新。只和设定的`游戏API`进行互动，

* 游戏模式下，增加对预定义的外部API的支持，以明文的方式保存在链上。使用和`trigger`一致的定义来调用系统资源。
    1. `end`方法必须存在，用于处理游戏正常结束，`游戏服务器`接受数据。
    2. `start`方法必须存在，用于游戏开始，`游戏服务器`初始化运行环境。

```Javascript
    const game_setting={
        game:"fly",
        baseurl:"https://game_API.fun",
        methods:[
            {
                name:"end",                       
                params:[],
                response:[
                    {type:"string",length:12},
                ],
            },
            {
                name:"start",
                params:[],
                response:[
                    {type:"string",length:12},
                ],
            },
            {
                name:"view",
                params:[
                    {type:"number",limit:[0,255]},
                    {type:"string",limit:[0,30]},
                ],
                response:[
                    {key:"data",format:"string"},
                ],
            },
            ...
        ],
    }
```

### 区域预加载

```Javascript
    const target = { x: x, y: y, world: world, container: dom_id }
    const mode = def.MODE_EDIT;
    VBW.mode(mode, target, (done) => {
        
    });
```

### 预渲染

* 为了更好的效果，烘培出的数据，也可以这时候进行加载。

### 网络访问控制

* 游戏模式下，使用`区域预加载`的方式，获取到所有的资源后，即切断其获取数据的能力。只留下和`游戏API`进行互动，只有退出游戏模式时，才能继续使用`datasource`的API继续获取数据。

* 这么做是出于两个原因
    1. 游戏流畅性。当处于游戏模式时，由于不加载其他的Block，就不会受到数据更新的影响，提升性能。
    2. 安全性。由于`datasource`的API里存在合约调用的方法，在游戏模式下切断后，可以避免出现安全性问题。
