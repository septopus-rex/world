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

* Game Mode的请求如下。配置文件写在`Block`里

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

```Javascript
    const game_setting={
        game:"fly",
        baseurl:"https://game_API.fun",
        methods:[
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

### 网络访问控制
