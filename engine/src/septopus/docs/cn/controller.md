# 控制器说明

## 控制器种类

* 根据程序需求，系统支持3种渲染器，其主要功能如下表：

|  资源类型   | 主要用途  | 设备支持  | 代码位置  |
|  ----  | ----  | ----  | ----  |
|  第一人称控制器  |  在3D世界里以第一人称运动的控制 |  [PC,Mobile] | `./control/control_fpv.js`  |
|  2D控制器 | 2D地图控制器  | [PC,Mobile] | `./control/control_2d.js`  |
|  观察者控制器  | 3D内容观察者控制器  | [PC,Mobile] |  `./control/control_observe.js`  |

## 程序结构

* 使用统一的控制器启动入口`Controller.start()`,这样可以被框架直接调用。

* `渲染器`需要构建运行的Dom结构，用于放置各种需要的内容。