# Block Basic Component

* Block sample data.

```Javascript
    [
        0,                          //elevation
        BLOCK_STATUS,               //block status，link to {world}.block.status
        [                           //adjunct list
            [0xb1,[DATA_ARRAY]],
            [0xb2,[DATA_ARRAY]],
            [0xa1,[DATA_ARRAY]],
            [0xa2,[DATA_ARRAY]]
        ],
    ]
```

```php
    //之前跑在php上版本的数据
    private $block=array(
        'preter'        =>  'earth',                    //土地数据解释器
        'extra'         =>  '{}',                       //扩展数据位位，所有的扩展参数都放在这里
        'elevation'     =>  0.2,                        //土地基底高度(m)
        'sideLength'    =>  16,                         //土地边长(m)
        'stop'          =>  '[]',                       //土地内的阻拦体
        'trigger'       =>  '[]',                       //触发器阵列
        'status'        =>  BLOCK_STATUS_ORIGIN,        //土地状态
        'uuid'          =>  BLOCK_DEFALT_UUID,          //土地所属的uuid，配置世界所有者的uuid
        'adjunct'       =>  '{}',                       //土地附属物的数据,目前是建筑物,数据可以指定解释器进行处理
        'rate'          =>  0,                          //(1~10)的系数，用来评估土地，暂时不用
        'transaction'   =>  0,                          //土地格子被交易的次数
        'view'          =>  0,                          //block被访问的次数
        'fav'           =>  0,                          //block收藏次数
        'ctime'         =>  0,                          //土地初次初始化的时间
        'stamp'         =>  0,                          //土地信息最后更新时间
        'light'         =>  '[]',                       //灯光阵列
        'coin'          =>  '{}',                       //积分发放数据
        'version'       =>  BLOCK_CURRENT_VERSION,      //数据版本号
    );
```