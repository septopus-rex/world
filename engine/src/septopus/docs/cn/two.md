# 2D功能实现

* 采用和`3D`一致的逻辑，由代码生成统一的`2D标准格式`再交由渲染器进行处理。这么做的好处是，便于调试，可以通过参看输出的`2D标准格式`数据来检查程序的运行情况。同时，也将渲染器和组件解耦，各自独立，易于升级和维护。
* 对于`动画效果`，同样也是通过对`动画标准格式`的解析来实现的，独立于3D渲染器实现的动画。

## 数据在坐标系的转换

* Septopus有以下3中主要的坐标系统，2D需要处理

|  坐标系   | 说明  |
|  ----  | ----  |
| 地块坐标  | 以`地块`来定位的坐标，最大为地块的XY尺寸的限制 |
| 世界坐标  | 以`世界`来定位的坐标，最大为世界`地块`的XY数量限制 |
| 显示坐标  | 以用户显示屏幕的坐标 |

## Canvas绘制

### 绘制图形的支持

* 2D绘图的实现如下，
  
    ```Javascript
        {
            line:{

                //对输入的数据进行格式化
                format:(raw)=>{     
                    const fmt={ points:[] };
                    fmt.points.push(raw.from);
                    fmt.points.push(raw.to);
                    if(raw.segement){
                        fmt.segement=[];
                    }
                    return fmt;
                },

                //具体绘制功能的实现
                drawing:(data,pen,env,cfg)=>{
                    const {scale, offset, height, density, ratio } = env;
                    const antiHeight = cfg.anticlock?height * ratio:0;
                    const pBtoC = self.calculate.point.b2c;

                    //1. line drawing
                    const start = pBtoC(data.points[0], scale, offset, density, antiHeight);
                    const end = pBtoC(data.points[1], scale, offset, density, antiHeight);
                    pen.beginPath();
                    pen.moveTo(start[0] + 0.5, start[1] + 0.5);
                    pen.lineTo(end[0] + 0.5, end[1] + 0.5);
                    pen.stroke();
            
                    //2. segements drawing
                    if(data.segement){}
                },

                 //样板输入数据
                sample:{       
                    from:[0,100],
                    to:[300,600],
                    segement:3,
                },
            }
        }
    ```

* `line`,
* `rectangle`,
* `arc`,
* `ring`,
* `polygons`,
* `curves`,
* `text`,
* `image`,