# World Details

* Virtual Block World instance sample data.

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

* 数据在链上的保存方式，用index来进行访问

```javascript
    [
        {WORLD},            //单一世界的配置
        {WORLD},
        ...
    ]
```