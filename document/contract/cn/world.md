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

* 初始化的过程如下
    1. 传入两个账号，一个是启动0号世界拍卖的初始化账号，一个是接受拍卖费用的账号
    2. 检查是初始化的情况后，建立需要的账号来存储Septopus World的基础信息

* 世界的通用配置如下，所有世界共用的参数。
  
    ```Javascript
        {
            name: "Septopus Worlds",            //Septopus的名称
            desc: "Septopus description.",      //Septopus世界的描述
            initiator:"SOLANA_ADDRESS",         //启动世界的账号，用于启动0号世界的拍卖
            //genesis:{
            //    block:2034343,
            //    signature:"SOLANA_TRANSACTION_SIGNATURE",
            //    founder:"SOLANA_ADDRESS",  
            //},
            world: {                        //Septopus setting
                block: [4096, 4096],            //每个世界的尺寸 
                side: [16, 16],                 //单个block的尺寸限制
                max: 10,                        //最大世界发行数量
                rate:60,                        //前一个世界销售比例之后，开启下一个世界
                price: 0.01,                    //block的初始化价格
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
            //0.1. 是否为合约里的king账号，只有King可以启动世界
            //0.2. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号，如有的话，已经初始化过了

            //1. 建立PDA["SEPTOPUS_WORLD_DEFAULT"]账号，用于保存以上的通用配置
            //1.0. 数据结构：JSON string
            //1.1. 将initiator设置为方法传入的账号。

            //2. 建立PDA["SEPTOPUS_WORLD_LIST"]账号， 
            //2.0. 数据结构：[{owner:"SOLANA_ADDRESS",block:"",signature:"",auction:[2000000,2340000]},...]
            //2.1. 用于记录world的owner等基础信息

            //3. 建立PDA["SEPTOPUS_WORLD_INDEX"]账号
            //3.0. 数据结构：u32
            //3.1. 当前未启动的world的index
        }
    ```

### 启动新世界

* 单个世界的配置如下：
  
    ```Javascript
        {
            name:"",
            descrption:"",
            homepage:"",
            accuracy:1,             //单位换算，默认为mm，取整
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
            owner:"SOLANA_ADDRESS",
            selling:0,                  //当这个值不为0时，即为销售状态
        }
    ```

* 合约实现，每个方法的具体实现过程。

    ```Rust
        //启动新的世界的方法
        pub fn world_start(
            ctx: Context<>, 
            index:u32,              //拟启动的世界的编号
            block:u64,              //拟启动的block的height编号，实现预定时间启动
            agent:Account,       //拍卖押金的托管账号,保存拍卖资金池的账号，king下的PDA账号，可以控制转账
        ) -> Result<()> {  
            //0. 数据检测
            //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
            //0.2. 如果index === 0，判断是否为来自配置里的initiator账号的请求
            //0.3. 获取PDA["SEPTOPUS_WORLD_INDEX"]的值，是否和传入的index一致


            //1. 修改PDA["SEPTOPUS_WORLD_LIST"]
            //1.1. 增加 {owner:"SOLANA_ADDRESS",block:"",signature:""}

            //2. 建立PDA["SEPTOPUS_WORLD",index]账号，用于保存该世界的配置信息
            //2.0. 数据结构：JSON string

            //3. 修改PDA["SEPTOPUS_WORLD_INDEX"]，执行其inc方法，+1

            //4. 建立PDA["WORLD_AUCTION",index]账号，用于记录世界拍卖的过程
            //4.0. 数据结构：{rounds:[{start:BLOCK_HEIGHT,end:BLOCK_HEIGHT,type:1,pledge:PLEDGE_FEE,pool:[ACCOUNT...],winner:ACCOUNT,payment:false},...],agent:ACCOUNT}           type:[1.荷兰式拍卖;2.乐透随机选]
            //4.1. 计算出end的block_height
        }
    ```

### 解析器

* 解析Septopus链上数据的程序，不包括adjunct部分，独立部署，可以更新。

    ```Rust
        //发布解析器的地方，即Septopus的运行前端JS
        pub fn world_decodor(
            ctx: Context<>, 
            code:Account,
        ) -> Result<()> {  
            //0. 数据检测
            //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
            //0.2. 是否为initiator账号的请求
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
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号
        //0.3. 是否已经超出了加入pool的时限

        //1. 修改PDA["WORLD_AUCTION",index]里的pool，增加账号（检测是否重复）

        //2. 支付押金到指定的Agent账号
    }
```

```Rust
    //拍卖的操作方法，可以进行拍卖
    pub fn world_auction_bid(
        ctx: Context<>, 
        index: u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号

        //1. 读取PDA["SEPTOPUS_WORLD_DEFAULT"]账号，取出拍卖价格

        //1. 写入PDA["WORLD_AUCTION",index]
        //1.1. 写入到rounds里最后一次的数据, winner为拍卖账号
        //1.2. 根据BLOCK_HEIGHT来计算最终的价格（根据[BLOCK_START,BLOCK_END]来线性计算费用）
    }   
```

```Rust
    //世界购买者认证并付费
    pub fn world_auction_approve(
        ctx: Context<>, 
        index: u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号
        //0.3. 检测是否为winner

        //1. 依据PDA["WORLD_AUCTION",index]里记录的价格，支付费用

        //2. 获取PDA["SEPTOPUS_WORLD",index]账号
        //2.1. 修改其`owner`为支付账号

        //3. 创建PDA["SEPTOPUS_WORLD_COUNTER",index]，用于保存售卖状态
    }
```

### 乐透模式

* 当World的拍卖进入乐透模式后，需要有个`开奖`的操作，该操作任何人都可以执行。通过Solana的随机数，来抽取World的所有者

```Rust
    //加入世界所有者的lottory pool
    pub fn world_lottery_pool(
        ctx: Context<>, 
        index:u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号
        //0.3. 是否已经超出了加入lottery pool的时限

        //1. 修改PDA["WORLD_AUCTION",index]数据
        //1.1. rounds里的最后一个元素的pool，增加账号（检测是否重复）

        //2. 支付抽奖金（不退）到指定的Agent账号
    }
```

```Rust
    //乐透开奖操作，任何人都可以执行
    pub fn world_lottery_draw(
        ctx: Context<>, 
        index:u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号
        //0.3. 检测是否为lottery模式
        //0.4. 检测是否为合法的lottery开奖（已开奖过，看是否超时）

        //1. 从PDA["WORLD_AUCTION",index]里记录的pool开奖
        //1.1. 使用SOlana的随机数，从pool里选取出一个winner
        //1.2. 修改winner值为这个账号
        //1.3. 设置expire值为1天对应的solana区块高度变化
        //1.4. 将winner从pool里移除
    }
```

```Rust
    //确认lottery世界的所有者
    pub fn world_lottery_approve(
        ctx: Context<>, 
        index:u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号
        //0.3. 检测是否为lottery模式
        //0.4. 检测是否为合法的lottery开奖（已开奖过，看是否超时）
        //0.5. 检测是否为winner

        //2. 获取PDA["SEPTOPUS_WORLD",index]账号
        //2.1. 修改其`owner`为支付账号

        //3. 创建PDA["SEPTOPUS_WORLD_COUNTER",index]，用于保存售卖数量状态
    }
```

### 失败确认

* 所有的账号都可以对失败的拍卖进行重启，主要是防止出现以下的情况：
  1. 使用initiator来验证的话，因其是启动世界的临时账号，出现遗忘的情况，就完蛋了。
  2. 使用上个World所有者来验证的话，其有可能不做推进，来人为减少World的发布，提高稀缺度。
  
```Rust
    //确认拍卖失败的情况，任何人都可以执行
    pub fn world_restart(
        ctx: Context<>, 
        index: u32,
    ) -> Result<()> {
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD_DEFAULT"]账号
        //0.2. 是否已经存在PDA["WORLD_AUCTION",index]账号
        //0.3. 确认上一次的操作已经过期

        //1. 创建新一轮的World发布操作
        //1.1. 当拍卖没有到达3轮的时候，在rounds里插入一个`拍卖`的数据{type:1,start:BLOCK_HEIGHT,end:BLOCK_HEIGHT,pledge:PLEDGE_FEE,pool:[ACCOUNT...]}
        //1.2. 当拍卖达到3轮的时候，在rounds里插入一个`随机选择`的数据{type:2,start:BLOCK_HEIGHT,end:BLOCK_HEIGHT,pledge:PLEDGE_FEE,pool:[ACCOUNT...],winner:""}
    }
```

## World的配置

### 参数设置

* World所有者，对参数进行设置，会影响所有的玩家，是需要谨慎的操作。也是通过参数的设置，可以塑造风格各异的World，形成丰富的世界。

```Rust
    //更新世界的配置的操作
    pub fn world_setting_update(
        ctx: Context<>, 
        world:u32,              //world index
        key:String,             //配置里的键值
        value:String,           //JSON格式数据
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 是否请求账号为世界所有者
        //0.3. 检测key是否存在
        //0.4. 检测value是否合法

        //1. 更新PDA["SEPTOPUS_WORLD",world]账号数据
        //1.1.将 key --> value的数据写入
    }
```

### 附属物

* 对于World不支持的adjunct, 前端报错，然后放弃解析数据。

```Rust
    //给世界增加adjunct的操作
    pub fn world_adjucnt_add(
        ctx: Context<>, 
        world: u32,                 //world index
        adjunct: u32,               //adjucnt的ID
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 是否请求账号为世界所有者

        //1. 更新PDA["SEPTOPUS_WORLD",world]账号数据
        //1.1.将adjunct ID添加到adjunct --> list数组里
    }
```

```Rust
    //给世界移除adjunct的操作
    pub fn world_adjucnt_remove(
        ctx: Context<>, 
        world: u32,
        adjucnt: u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 是否请求账号为世界所有者

        //1. 更新PDA["SEPTOPUS_WORLD",world]账号数据
        //1.1.将adjunct ID从adjunct --> list数组里移除
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
        world:u32,              //world index
        price:u64,              //销售价格(SOL)
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 是否请求账号为世界所有者

        //1. 设置销售状态及价格
        //1.1. 设置 selling值为price
    }
```

```Rust
    //购买世界所有权
    pub fn world_buy(
        ctx: Context<>, 
        world:u32,            //world index
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 是否selling值为0

        //1. 转账
        //1.1. 按照selling的值，支付给现在world的owner

        //2. 设置新的所有者
        //2.1. 设置 owner为支付者的账号
        //2.2. 设置 selling 为 0
    }
```

```Rust
    //撤销世界所有权售卖状态
    pub fn world_revoke(
        ctx: Context<>, 
        world:u32,          //world index
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 是否请求账号为世界所有者

        //1. 撤销销售状态
        //1.1. 设置 selling值为0
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
  2. 用Bit位来标识指定block是否已经销售，例如[x,y],即去查询PDA[y]，该账号长度为512字节(8*512=4096)来存储状态。该方法也可以满足遍历要求，看看哪些block还可以购买。
* Block的数据，存储在PDA[world,x,y]的独立账号里，由购买者支付租金。

### Block买卖

```Rust
    //以初始化的价格购买block的过程，可以批量购买
    pub fn block_init(
        ctx: Context<>, 
        world:u32,          //world index
        x:u32,              //开始的x坐标
        y:u32,              //开始的y坐标
        ex:u32,             //x方向数量，默认为0
        ey:u32              //y方向数量，默认为0
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否已经存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 根据ey值获取PDA["SEPTOPUS_WORLD",y]...，检测是否已经被初始化过

        //1. 创建PDA["SEPTOPUS_BLOCK",world,x,y]账号
        //1.1. 创建账号，保存基本数据[0,1,[],OWNER,0];        //注意，owner不参与PDA账号关联，不然交易有问题

        //2. 更新PDA["SEPTOPUS_WORLD",y]...的初始化状态
        //2.1. 位操作，在PDA["SEPTOPUS_WORLD",y]中修改x～(x+ex)为1。PDA["SEPTOPUS_WORLD",y]不存在时，创建下

        //3. 更新PDA["SEPTOPUS_WORLD_COUNTER",index]
        //3.1. 增加计数器(ex*ey)值，记录销售状态

        //4. 检测是否可以开始新world的销售 （后继世界的销售，都依靠这里设置）
        //4.0. 取出PDA["SEPTOPUS_WORLD_INDEX"],和world进行比较，是否为最新的世界
        //4.1. 取出PDA["SEPTOPUS_WORLD_DEFAULT"]，根据world --> block 的值，计算出TOTAL的block数量
        //4.2. 如果100*COUNTER/TOTAL > RATE， RATE为 world --> rate的值，即销售率
        //4.3. 开启新的World的拍卖， 和`world_start`方法一致
    }
```

```Rust
    pub fn block_sell(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
        price:u64,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号
        //0.2. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0]中ROW[3]是否和请求账号一致

        //1. 设置销售状态
        //1.1. 设置ROW[4]的值为传入的price,即为设置好block的销售价格

        //触发事件(BLOCK.sell)，细节待描述
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
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号
        //0.2. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0]中ROW[3]是否和请求账号一致

        //1. 设置销售状态
        //1.1. 设置ROW[4]的值为0，撤销销售状态

        //触发事件(BLOCK.revoke)，细节待描述
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
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号
        //0.2. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,9000000]，价格ROW[4]是否不为0

        //1. 支付购买费用
        //1.1. 支付ROW[4]的SOL给ROW[3]的owner

        //2. 修改所有者
        //2.1. 将ROW[3]修改给支付者的Account
        //2.2. 将ROW[4]修改为0

        //触发事件(BLOCK.sold)，细节待描述
    }
```

### Block更新

```Rust
    //更新block的内容
    pub fn block_update(
        ctx: Context<>, 
        world:u32,                  //world index
        x:u32,
        y:u32,
        content:String              //JSON格式的数据
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号
        //0.2. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0]中ROW[3]是否和请求账号一致

        //1. 修改数据
        //1.1. 解析JSON串content
        //1.2. 设置到ROW里
    }
```

### Complain管理

* 举报可以由任何人发起，但是处理举报的是world的owner，通过对举报的处理，也在塑造着world的形态。

```Rust
    //举报block的内容
    pub fn block_complain(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
        signature:String,            //对应的block内容的signature, last update
        comment:String,              //JSON comment
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号
        //0.2. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0]中ROW[3]是否和请求账号一致。不能自己举报自己

        //1. 记录complain的值
        //1.1. 创建PDA["BLOCK_COMPLAIN",world,x,y]来保存数据
        //1.2. 保存complain的数据{whistle:ACCOUNT,signature:BLOCK_CONTENT_SIGNATURE,comment:{type:1,words:""},result:1};

        //2. 将complain添加到队列
        //2.1. 获取PDA["BLOCK_COMPLAIN_QUEUE",world]
        //2.2. 插入数据[x,y]，管理者可以遍历PDA["BLOCK_COMPLAIN_QUEUE",world]来处理举报内容

        //触发事件(COMPLAIN.added)，细节待描述
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
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 判断请求是否来自World的owner
        //0.3. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号

        //1. 修改block的状态
        //1.1. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0],设置ROW[1]为0（0为被禁止访问，需要前端解析器支持）

        //2. 处理队列数据
        //2.1. 获取PDA["BLOCK_COMPLAIN_QUEUE",world]
        //2.2. 移除数据[x,y]

        //3. 修改complain的结果
        //3.1. 获取PDA["BLOCK_COMPLAIN",world,x,y]来保存数据
        //3.2. 修改result为1,(1.禁止;6.不禁止) }

        //触发事件(COMPLAIN.solved)，细节待描述
```

```Rust
    //忽略block禁止访问的操作
    pub fn block_ignore(
        ctx: Context<>, 
        world:u32,
        x:u32,
        y:u32,
    ) -> Result<()> {  
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 判断请求是否来自World的owner
        //0.3. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号

        //1. 修改block的状态
        //1.1. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0],设置ROW[1]为0（0为被禁止访问，需要前端解析器支持）

        //2. 处理队列数据
        //2.1. 获取PDA["BLOCK_COMPLAIN_QUEUE",world]
        //2.2. 移除数据[x,y]

        //3. 修改complain的结果
        //3.1. 获取PDA["BLOCK_COMPLAIN",world,x,y]来保存数据
        //3.2. 修改result为6,(1.禁止;6.不禁止) }

        //触发事件(COMPLAIN.solved)，细节待描述
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
        //0. 数据检测
        //0.1. 是否存在PDA["SEPTOPUS_WORLD",world]账号
        //0.2. 判断请求是否来自World的owner
        //0.3. 是否存在PDA["SEPTOPUS_BLOCK",world,x,y]账号

        //1. 修改block的状态
        //1.1. PDA["SEPTOPUS_BLOCK",world,x,y]中记录为ROW[0,1,[],OWNER,0],设置ROW[1]为1（0为被禁止访问，需要前端解析器支持）

        //触发事件(BLOKC.recover)，细节待描述
    }
```