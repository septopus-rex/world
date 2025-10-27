# World Details

* Septopus World instance sample data.

```Javascript
    {
        name:"",                        //VBW的名称
        desc:"",                        //世界的描述
        size:[4096,4096],               //#1～4096，可以买年份的数据，总约1677万块
        accuracy:1000,                  //数据精度，相当于1mm
        block:{
            size:[                      //block的尺寸限制
                16,                     //block的宽度
                16,                     //block的长度
                20,                     //block的高度,限制最高修建的物体高度
            ],               
            diff:3,                     //周边4块的平均高度的升高值
            status:[                    //block的状态
                "raw",                  //原始未被mint的状态
                "public",               //正常状态，所有人都可以浏览
                "private",              //私有状态，不在world里显示
                "locked"                //锁定状态，当进行交易时进行锁定
            ],       
        }
        time:{                          //设计速度为正常的20倍，相当于现实世界1年，VBW里20年
            slot:1000,                  //1 hour 对应的slot数量，需要计算清晰
            year:360,                   //每年的天数
            month:12,                   //月数
            hour:24,                    //每天小时数
        },
        sky:{                           //天空的设置
            sun:1,                      //太阳的数量
            moon:3,                     //月亮的数量
        },
        weather:{
            category:[                  //气候状态的种类
                "cloud",                //[ sunny,cloud... ]
                "rain",                 //[ frog,rainny..., thunder ]
                "snow"                  //[ snow,storm... ]
            ],       
            grading:8,                  //每种气候里面的分级
        }                   
    }
```

* World on chain

```javascript
    [
        {WORLD},            //单一世界的配置
        {WORLD},
        ...
    ]
```

## Render Workflow

### Normal steps

* Need 2 functions in framesync queue to check the status of `block loading` and `resource loading`

1. `Datasource.view` to get raw data.
    1.1. Return default blocks data as `Holder`.
    1.2. Create `Loading Blocks` queue.
    1.3. Set framesync function `Block Checker`.
    1.4. Normal flow to render scene.
2. When `Datasource` get all raw blocks data.
    2.1. Attatch raw data to block node.
    2.2. `Block Checker` filter out all `Module` and `Texture`.
    2.3. Create `Loading Modules` and `Loading Textures` queues.
    2.4. Set the block to `Loading Blocks` queue again.
    2.5. Set framesync function `Resource Checker`.
    2.6. Rebuild target block on every frame to avoid multi tasks.
    2.7. Normal flow to render scene. `Module` and `Texture` holder will take the place of resource.
3. When `Module` and `Texture` is ready.
    3.1. Attatch raw data to `Module` and `Texture` node.
    3.2. Rebuild target block on every frame.
    3.3. Remove target block form `Loading Blocks`.

* Block restruct in a single function to make Septopus World Engine easy to understand.
