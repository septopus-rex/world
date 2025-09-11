# Septopus合约 - World模块

* World是Septopus的主要交流场所，无论是系统自身的各种功能，还是对外展示内容来彰显区块链虚拟世界的魅力，都需要这个3D的虚拟世界。
* Septopus World合约，能完整的支持世界层面的各种链上操作，主要完成以下的功能。
  
| 功能分类 | 功能概要 | 详细说明 |
| --- | --- | --- |
| 世界状态 | 所有世纪的状态、各个单独世界的状态 | [详情](#world状态) |
| 竞拍功能 | 发行新的世界时，竞拍功能的实现 | [详情](#world的竞拍) |
| 配置管理 | 世界所有者对世界的状态进行管理 | [详情](#world的配置) |
| 附属物管理 | 可供所有世界使用的附属物的管理 | [详情](#附属物) |

## World状态

### 初始化

* 世界的通用配置如下，所有世界共用的参数。
  
    ```Javascript
        {
            name: "Septopus Worlds",        //Septopus的名称
            desc: "Septopus description.",  //Septopus世界的描述
            initiator:"SOLANA_ADDRESS",       //启动世界的账号，用于启动0号世界的拍卖
            //genesis:{
            //    block:2034343,
            //    signature:"SOLANA_TRANSACTION_SIGNATURE",
            //    founder:"SOLANA_ADDRESS",  
            //},
            world: {                        //Septopus setting
                block: [4096, 4096],            //每个世界的尺寸 
                side: [16, 16],                 //单个block的尺寸限制
                max: 100,                       //最大世界发行数量
                rate:70,                        //前一个世界销售比例之后，开启下一个世界
            },
            auction:{                       //World拍卖的参数
                type:"dutch",
                bidding:{
                    price:100000,           //拍卖开始的价格
                    pool: 20000,            //以block计算的1周时间
                    fee: 10,                //进入拍卖池的费用，需要10SOL
                    payment:2000,           //以block计算的1天时间
                    round:3,                //失败多少轮后进入lottery方式
                },
                lottery:{
                    pool: 20000,            //以block计算的1周时间
                    fee: 10,                //进入拍卖池的费用，需要10SOL
                },
            },
            time: {      //time setting
                year: 12,        // months/year
                month: 30,       // days/month
                day: 24,         // hours/day
                hour: 60,        // minutes/hour
                minute: 60,      // seconds/minute
                second: 1000,    // microseconds/second
                speed: 20,       // rate =  septopus year / reality year
            },
            sky: {      //sky setting
                sun: 1,         //amount of sun
            },
            weather: {  //Septopus weathe setting
                category: ["cloud", "rain", "snow"],
                grading: 8,
                interval: 500,             //天气更新速度，按block的数来处理
                detail: {
                    cloud: [
                        "sunny",              // ☀️ 完全晴朗
                        "mostly sunny",       // 🌤 几乎晴朗，少量云
                        "partly cloudy",      // ⛅️ 局部多云
                        "mostly cloudy",      // 🌥 大部分时间多云
                        "cloudy",             // ☁️ 完全多云
                        "overcast",           // 🌫️ 阴沉（厚云层）
                        "dim daylight",       // 🌁 光线暗淡（接近阴天或雾天）
                        "dark sky"            // 🌑 漆黑压抑的天空（重云/暴雨前）
                    ],
                    rain: [
                        "frog",              // 🐸 青蛙出没 / 极轻微湿气（象征刚下雨）
                        "drizzle",           // 🌦 细雨/毛毛雨
                        "light rain",        // 🌧 小雨
                        "moderate rain",     // 🌧 中雨
                        "heavy rain",        // 🌧🌧 大雨
                        "downpour",          // 🌧🌧🌧 倾盆大雨
                        "rainstorm",         // 🌩 雷雨或暴雨
                        "torrential rain"    // 🌊 特大暴雨，近灾害级
                    ],
                    snow: [
                        "frost",            // ❄️ 霜，极轻微结冰或冻露，非真正降雪
                        "flurries",         // 🌨️ 零星小雪
                        "light snow",       // 🌨 小雪
                        "moderate snow",    // 🌨 中雪
                        "heavy snow",       // 🌨🌨 大雪
                        "blowing snow",     // 🌬️❄️ 吹雪，风大雪大
                        "snowstorm",        // 🌨⚡️ 暴雪
                        "whiteout"          // 🌫️ 完全白茫茫，能见度极低
                    ],
                },
            },
        }
    ```

* 合约里的实现
  
    ```Rust
        //初始化整个Septopus World的方法
        pub fn world_init(
            ctx: Context<>,
            initiator:Account,      //初始化0号世界的账号
            recipient:Account,      //接受世界拍卖费用的账号
        ) -> Result<()> {
            //0. 数据检测
            //0.1. 是否为合约里的king账号
            //0.2. 是否已经存在PDA["SEPTOPU_WORLD"]账号，如有的话，已经初始化过了

            //1. 建立PDA["SEPTOPU_WORLD"]账号，用于保存以上的通用配置
            //1.0. 数据结构：JSON string
            //1.1. 将initiator设置为方法传入的账号。

            //2. 建立PDA["SEPTOPU_WORLD_LIST"]账号， 
            //2.0. 数据结构：[{owner:"SOLANA_ADDRESS",block:"",signature:"",auction:[2000000,2340000]},...]
            //2.1. 用于记录world的owner等基础信息

            //3. 建立PDA["SEPTOPU_WORLD_INDEX"]账号
            //1.0. 数据结构：u32
            //1.1. 当前未启动的world的index

            //4.
        }
    ```

### 启动新世界

* 单个世界的配置如下：
  
    ```Javascript
        {
            name:"",
            descrption:"",
            homepage:"",
            accuracy:1000,
            block:{
                height:30,          //地块支持的附属物最大高度
                fee:1,              //0～100,block的交易费率
                elevation: 0,       //地块的初始海拔高度
                texture:2,
            },
            sky:{
                color:[],           //天空的渐变颜色设置
                moon:[              //天空中月亮数量的限制
                    {},
                ]
            },
            player:{
                location:{

                },
                body:{

                },
                avatar:{
                    size: 2*1024*1024,      //3D人偶尺寸
                },
                bag:{
                    max:200,                //最大可携带物品数量
                }
            },
            adjunct:{
                amount: 60,         //adjunct的数量上限
                list:[],            //支持的adjunct的列表
            },
            //owner:"SOLANA_ADDRESS",
            //genesis:{
            //    block:2034343,
            //    signature:"",
            //    index:0,
            //},
        }
    ```

* 合约实现，每个方法的具体实现过程。

    ```Rust
        //启动新的世界的方法
        pub fn world_start(
            ctx: Context<>, 
            index:u32,
            block:u64,
        ) -> Result<()> {  
            //0. 数据检测
            //0.1. 是否已经存在PDA["SEPTOPU_WORLD"]账号
            //0.2. 如果index === 0，判断是否为来自配置里的initiator账号的请求
            //0.3. 获取PDA["SEPTOPU_WORLD_INDEX"]的值，是否和传入的index一致


            //1. 修改PDA["SEPTOPU_WORLD_LIST"]
            //1.1. 增加 {owner:"SOLANA_ADDRESS",block:"",signature:"",auction:[${block},2340000]}, 设置好拍卖启动的时间
            //1.2.

            //2. 建立PDA["SEPTOPU_WORLD",index]账号，用于保存该世界的配置信息
            //2.0. 数据结构：JSON string

            //3. 修改["SEPTOPU_WORLD_INDEX"]，执行其inc方法，+1

            //4. 建立PDA["WORLD_AUCTION",index]账号，用于记录世界拍卖的过程
            //4.0. 数据结构：{type:"",log:[]}

        }
    ```

## World的竞拍

* 除第0号世界外，其他的世界销售启动的条件是，上一个世界的销售超过配置里的百分比，即70%。
* 世界的所有权采用以下方式获取
  1. 使用荷兰拍卖，单个世界的尺寸为4096*4096地块，地块初始化定价为0.1SOL，100%销售收入为160万SOL左右，所有者和Septopus的销售分成比例为5:5。拍卖价格从10000SOL开始。
  2. 拍卖的第一阶段，为进入拍卖池阶段。时间为1周，用户锁定10SOL即可进入，拍卖结束后退还。
  3. 拍卖的第二阶段，为实际拍卖过程。按照第一阶段的设定，拍卖从第n块开始，随着块高度升高，价格线性下降，以最先买下的交易的区块高度，来确定价格。
  4. 拍卖的第三阶段，为支付和退款缓解。拍卖池里的用户，可以申请退款。拍中的用户，开始支付剩余费用，支付有效期为1天。
  5. 拍卖的重启，如用户未能支付费用，则重新开始拍卖。
  6. 当连续3次拍卖失败后，进入随机选取过程。
  7. 随机选取的第一阶段，为进入选取阶段。时间为1周，用户锁定0.5SOL即可进入，不返还。
  8. 随机选取的第二阶段，选取阶段。系统使用安全随机数，在选取池里选取一位作为世纪所有者。

### 竞拍过程

```Rust
    //加入到拍卖池的操作
    pub fn world_auction_pool(
        ctx: Context<>,
        index:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //拍卖的操作方法，可以进行拍卖
    pub fn world_auction_bid(
        ctx: Context<>, 
        index: u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //世界购买者认证并付费
    pub fn world_auction_approve(
        ctx: Context<>, 
        index: u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

### 乐透模式

```Rust
    //加入世界所有者的lottory pool
    pub fn world_lottery_pool(
        ctx: Context<>, 
        index:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //确认lottery世界的所有者
    pub fn world_lottery_approve(
        ctx: Context<>, 
        index:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.

        //需要支付维持world配置的租金
    }
```

### 失败确认

```Rust
    //确认拍卖失败的情况，任何人都可以执行
    pub fn world_restart(
        ctx: Context<>, 
        index: u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

## World的配置

### 参数设置

```Rust
    //更新世界的配置的操作
    pub fn world_setting_update(
        ctx: Context<>, 
        world:u32,              //世界编号
        key:String,
        value:String,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

### 附属物

```Rust
    //给世界增加adjunct的操作
    pub fn world_adjucnt_add(
        ctx: Context<>, 
        world: u32,
        adjunct: u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //给世界移除adjunct的操作
    pub fn world_adjucnt_remove(
        ctx: Context<>, 
        world: u32,
        adjucnt: u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //支付adjunct的费用的操作
    pub fn world_adjucnt_fee(
        ctx: Context<>, 
        world:u32,
        adjunct: u32
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

## World的转让

* 在销售转入下一个世界后，World的所有权可以进行转让。现在的所有者，可以设置一个价格供交易。

```Rust
    //转让世界所有权,设置售卖价格
    pub fn world_sell(
        ctx: Context<>, 
        world:u32,
        price:u64,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //购买世界所有权
    pub fn world_buy(
        ctx: Context<>, 
        world:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //撤销世界所有权售卖状态
    pub fn world_revoke(
        ctx: Context<>, 
        world:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

## 附属物管理

### 附属物发布

```Rust
    //发布一个adjunct的过程
    pub fn adjucnt_publish(
        ctx: Context<>, 
        name: String,            //adjunct的名称
        code: String,            //adjunct字符串化的代码，初期只支持部署在Solana上
        version: u32,            //版本号
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //删除adjunct，即将其设置为不可用
    pub fn adjucnt_remove(
        ctx: Context<>, 
        adjunct:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

### 附属物更新

```Rust
    pub fn adjucnt_update(
        ctx: Context<>, 
        adjunct:u32,
        code:String,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

## Block功能

* Block的销售状态，用两种方式来维持状态。
  1. 用counter来记录总销售数量。可以用于判断是否可以进行下一步操作，例如发行新的世界。
  2. 用Bit位来标识指定block是否已经销售，例如[x,y],即去查询PDA[x]，该账号长度为512字节(8*512=4096)来存储状态。该方法也可以满足遍历要求，看看哪些block还可以购买。
* Block的数据，存储在PDA[world,x,y]的独立账号里，由购买者支付租金。

### Block买卖

```Rust
    //以初始化的价格购买block的过程，可以批量购买
    pub fn block_init(
        ctx: Context<>, 
        world:u32,
        x:u32,              //开始的x坐标
        y:u32,              //开始的y坐标
        ex:u32,             //x方向数量，默认为0
        ey:u32              //y方向数量，默认为0
    ) -> Result<()> {  
        //1.
        //2.
        //3.

        //需要支付租金，来维持数据，降低系统的开销
    }
```

```Rust
    pub fn block_sell(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
        price:u64,
        target:Account,         //可选，可以卖给指定账号的人
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //撤销售卖状态
    pub fn block_revoke(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //购买正在销售的block
    pub fn block_buy(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

### Block更新

```Rust
    //更新block的内容
    pub fn block_update(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
        content:String
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

### Block管理

```Rust
    //举报block的内容
    pub fn block_complain(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
        signature:String            //对应的block内容的signature
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //禁止block的访问
    pub fn block_deny(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```

```Rust
    //恢复block的访问
    pub fn block_recover(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
    ) -> Result<()> {  
        //1.
        //2.
        //3.
    }
```