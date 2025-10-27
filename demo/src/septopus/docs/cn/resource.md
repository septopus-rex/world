# Resource Protocol

* 对所有链上数据进行格式化的协议，因3D需要调用大量的资源，放在合约不合适，就需要存储在IPFS上。
* 使用base64格式，需要解码才能恢复，避免被直接运行，提升一点安全性。
* 使用明文的方式来说明，便于人工审查。
* 关键字如下
  
| 键名 | 说明 | 可选值 |
| --- | --- | --- |
| type | Meta Septopus支持的类型 | [module,texture,avatar,lines,block,adjunct,chord...] |
| format | 原始文件类型 |  |
| raw | base64格式编码的字符串 |  |
| metadata | 扩展配置 |  |

## 支持类型

### Module

* 各种导出的3D模型文件，需要明确format进行解析。因为需要将模型的尺寸整合到系统里，需奥metadata里的参数来对其尺寸进行修正。
  
    ```Javascript
    {
        type:"module",
        format:"fbx",               //[gltb,fbx,obj,mf]
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            size:[4,10,6],          //修正后的模型放置尺寸
            scale:[1,1,1],          //原始模型缩放到m为单位的比例
            rotation:[0,0,0],       //设置旋转值来调整模型到符合septopus的坐标系
        },
    }
    ```

### Texture

* 纹理类型，主要是图像。

    ```Javascript
    {
        type:"texture",
        format:"png",               //[jpg,png]
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            size:[2,2],             //贴图对应的物理尺寸，用于进行贴图的repeat计算
        },
    }
    ```

### Lines

* 台词文字数据，供调用。
  
    ```Javascript
    {
        type:"lines",
        format:"json",
        raw:"BASE64_ENCODE_STRING",     //{en:[],zh:[]}, support lang in array
        metadata:{
            lang:["zh","en"],
            encode:"utf8",              //文字编码设置
        },
    }
    ```

* 台词的数据结构如下：

    ```Javascript
    {
        en:[

        ],
        cn:[

        ],
    }
    ```

### Block

* Meta Septopus里的完整的block数据。
  
    ```Javascript
    {
        type:"block",
        format:"json",
        raw:"BASE64_ENCODE_STRING",
    }
    ```

### Adjunct

* Meta Septopus里的完整的block数据。
  
    ```Javascript
    {
        type:"adjunct",
        format:"js",
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            version:"2.0.0",
        }
    }
    ```

### Avatar

* Meta Septopus支持的avatar数据。

    ```Javascript
    {
        type:"avatar",
        format:"gltf",
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            size:[4,10,6],
            scale:[1,1,1],      //原始模型缩放到m为单位的比例
            rotation:[0,0,0],   //设置旋转值来调整模型到符合septopus的坐标系
            status:{            //运动对应的动画的索引
                walk:0,                  
                run:1,
                sit:2,
                death:9,
            }
        }
    }
    ```

### Audio

* 音效类型

    ```Javascript
    {
        type:"audio",
        format:"mp3",
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            
        }
    }
    ```

### IDL

* Solana合约的IDL文件，供前端进行调用。

    ```Javascript
    {
        type:"idl",
        format:"json",
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            program:"",
            framework:"",
        }
    }
    ```

### Chord

* Meta Septopus支持的chord模版，用于快速建造。

    ```Javascript
    {
        type:"chord",
        format:"json",
        raw:"BASE64_ENCODE_STRING",
        metadata:{
            size:[4,4,4],
            style:"",
        }
    }
    ```

* Chord的数据结构如下：