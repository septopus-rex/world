# 如何创建一个附属物 (Creating an Adjunct)

附属物 (Adjunct) 是 Septopus 世界中最关键的构建块（相当于 Mod 或插件组件）。如果你想在三维世界里添加一种新型的“家具”、“武器”或是隐形的“游戏机关”，你就需要编写一个自定义的 Adjunct。

## 1. 附属物的生命周期结构

一个符合协议的规范 Adjunct 文件（如 `my_box.js`）通常必须对外暴露以下几个核心对象：

### 注册信息 (Registration)
告诉引擎你的名字、微缩编码（为了极限链上压缩而存在的 Short Hash）以及你将引发哪些事件。

```javascript
const reg = {
    name: "my_custom_box",    // 全局唯一名称
    category: 'basic',        // 大类：basic/module/logic
    desc: "这是一个自定义的魔法盒子",
    short: "mb",              // 2-3个字符的压缩键，存储在区块链上时只会存 "mb"
    events: ["touch", "in"]   // 我支持碰撞和进入监测
}
```

### 生命钩子 (Hooks)
这些是供引擎随时回调的数据接口：

```javascript
const hooks = {
    // 引擎用它来登记你的组件
    reg: () => { return reg },
    
    // 如果你有特殊的逻辑需求或者初始配置
    def: (data) => { ... },
    
    // 当你的物体被赋予一个动画标记时，引擎将问你拿到对应的位图公式
    animate: (effect_id, param) => { 
        // return 一个 Animation Std 对象
    }
}
```

## 2. 数据多态降维 (Transform 管线)

引擎本身不知道你在链上存的那些短巧精悍的数组是什么意思（这就是协议数据隔离），这是自定义 Adjunct 最重要的职责所在——你需要实现一套 `transform` 接口，把压缩数组翻译成渲染需要的内容：

```javascript
const transform = {
    // 【阶段一】把链上 Raw 数据转成人类能看懂的标准 JSON 格式 (STD)
    raw_std: (arr, cvt) => {
        // arr 大致看起来像：["mb", [[2,2,2], [0,0,0], [0,90,0], 12]]
        // 需要返回解析好的包含 x, y, z, rx, ry, material 等字段的对象数组
        return stds; 
    },
    
    // 【阶段二】把标准对象变成能塞进浏览器的 Three.js 骨架 (3D/BoxGeometry 等)
    std_3d: (stds, base_va) => {
        // ...根据 std 创建 Three.js 所需的数据定义格式
        return threeObjDatas;
    }
}
```

## 3. 防穿模物理阻挡 (Stop 属性)

如果你发现你写的盒子总是被玩家直接穿透过去，那是因为在你的数据管线中漏加了一个阻断标记。
在 `std_3d` 时，只需要检查数据标位，并给网格强行挂上一个 `stop`：

```javascript
if (row.isSolid) {
    singleObject.stop = {
        opacity: 0, 
        color: 0xffffff
    };
}
```

经过引擎底层的扫描管线，这将会作为射线检测的挡板存在。
