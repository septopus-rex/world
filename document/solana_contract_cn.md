# Solana Program of Septopus World

## World

* 总计可以发行10个世界，在计数器达到后，允许开启下一个世界。
* 世界的设置不可以进行更新，防止Block的增发。
* 在开启一个世界的时候，可以设定block的数量，用来调节总需求。

## Block

* Block是单独mint出来的，只要不存在，就可以mint
* Block的内容，支持两种方式，一种是直接写数据，一种是存IPFS的Hash

```javascript
    //1. raw data on Solana
    [
        0.2,                                //elevation of block
        [                                   //adjuncts list
            [
                0x00a1,                     //adjunct unique index
                [SINGLE_ADJUNCNT_DATA]      //adjuncts
            ],
            ...       
        ]
    ]

    //2. raw data on IPFS
    [
        0.2,                //elevation of block
        IPFS_HASH_STRING,   //IPFS hash   
    ]

```

## Resource

* 合约里仅维持index计数，保存IPFS的hash用于访问
* IPFS保存的文件并非为原始的3D软件导出文件，格式如下：

```javascript
    {
        type:"module",                          //["texture","module", ... ]
        format:"3ds",                           //file format
        compress:{                              //wether compressed
            format:"zip",                   
            version:"0.0.1",
        },
        data:"BASE64_STRING_OF_RAW_FILE",
    }
```

## Management

* 可以对内容进行屏蔽和恢复，后继采用公共管理的方式进行。
