# 附属物系统

## 概述

附属物（Adjunct）是可以放置在Block上的内容物，包括基础组件（盒子、墙、水、触发器等）和可自定义组件。

## 附属物分类

### 1. 基础组件
```javascript
const basic_adjuncts = [
    "basic_box",       // 基础盒子
    "basic_light",     // 基础灯光
    "basic_trigger",   // 基础触发器
    "basic_stop",      // 基础阻拦体
    "basic_module",    // 基础模块
]
```

### 2. 自定义附属物
```javascript
const custom_adjuncts = [
    "adjunct_wall",     // 墙壁
    "adjunct_water",    // 水
    "adjunct_cone",     // 圆锥
    "adjunct_ball",     // 球体
    "adjunct_sample",   // 示例
]
```

## 附属物注册

### 1. 注册信息结构
```javascript
const reg = {
    name: "box",                // 组件名称
    category: 'basic',            // 类别
    desc: "Basic adjunct",         // 描述
    version: "1.0.0",          // 版本
    short: "bx",                // 缩写（用于链上数据压缩）
    events: ["in", "out", "touch"],  // 支持的事件
}
```

### 2. Hooks结构
```javascript
const hooks = {
    // 返回注册信息
    reg: () => { return reg },

    // 定义数据（从World设置中获取）
    def: (data) => { definition = data },

    // 动画定义（返回标准动画格式）
    animate: (effect, param) => { ... }
}
```

## 数据转换

### 1. Raw → STD转换
```javascript
transform.raw_std = (arr, cvt) => {
    const rst = [];
    for (let i in arr) {
        const d = arr[i];
        const [x, y, z] = d[0];           // 尺寸
        const [ox, oy, oz] = d[1];        // 偏移
        const [rx, ry, rz] = d[2];        // 旋转
        const tid = d[3];                   // 纹理ID
        const [rpt_x, rpt_y] = d[4];     // 重复参数
        const animate = d[5];              // 动画设置
        const event = d[7];                 // 事件设置（可选）

        const dt = {
            x: x * cvt,
            y: y * cvt,
            z: z * cvt,
            ox: ox * cvt,
            oy: oy * cvt,
            oz: oz * cvt,
            rx: rx,
            ry: ry,
            rz: rz,
            material: {
                texture: tid,
                repeat: [2, 2],        // 默认重复
                offset: [0, 0],
                rotation: Math.PI * 0.25,
                color: config.color,
            },
            stop: !d[6] ? false : true,  // 是否为阻拦体
        };

        // 动画设置
        if (d[5] !== undefined) {
            if (Array.isArray(d[5])) {
                dt.animate = {
                    router: d[5][0],
                    param: [...d[5].slice(1)],
                }
            } else {
                if (router[d[5] - 1] !== undefined) {
                    dt.animate = { router: d[5] };
                }
            }
        }

        // 事件设置
        if (d[7] !== undefined) {
            const [index, condition, todo] = d[7];
            if (index >= 0 && index < reg.events.length) {
                dt.event = {};
                dt.event[reg.events[index]] = {
                    adjunct: reg.name,
                    index: i,
                    condition: condition,
                    todo: todo,
                }
            }
        }

        rst.push(dt);
    }

    return rst;
}
```

### 2. STD → 3D转换
```javascript
transform.std_3d = (stds, va) => {
    const arr = [];
    for (let i = 0; i < stds.length; i++) {
        const row = stds[i];
        const single = {
            type: "box",
            index: i,
            params: {
                size: [row.x, row.y, row.z],
                position: [row.ox, row.oy, row.oz + va],
                rotation: [row.rx, row.ry, row.rz],
            },
            material: row.material,
            animate: row.animate,
        };

        // 阻拦体材质
        if (row.stop) {
            single.stop = {
                opacity: config.stop.opacity,
                color: !config.stop.color ? 0xfffffff : config.stop.color
            };
        }

        // 事件
        if (row.event) {
            single.event = row.event;
        }

        arr.push(single);
    }

    return arr;
}
```

### 3. 编辑高亮转换
```javascript
transform.std_active = (stds, va, index) => {
    const ds = { stop: [], helper: [] };
    // 可以添加选中高亮的辅助对象
    return ds;
}
```

### 4. 2D转换
```javascript
transform.std_2d = (stds, face, faces) => {
    const objs = [];
    for (let i = 0; i < stds.length; i++) {
        const std = stds[i];
        switch (face) {
            case faces.TOP:
                const row = {
                    type: "rectangle",
                    index: i,
                    params: {
                        size: [std.x, std.y],
                        position: [std.ox, std.oy],
                        rotation: std.rz,
                    },
                    style: {
                        fill: 0xfa3312,
                        color: 0xfa0012,
                        opacity: 0.6,
                        width: 1,
                    }
                };
                objs.push(row);
                break;

            default:
                break;
        }
    }
    return objs;
}
```

## 属性操作

### 1. 添加附属物
```javascript
attribute.add = (p, raw) => {
    raw.push(attribute.combine(p));
    return raw;
}
```

### 2. 设置附属物
```javascript
attribute.set = (p, raw, limit) => {
    if (p.index === undefined) return false;
    const index = p.index;

    if (limit === undefined) {
        raw[index] = attribute.combine(p, raw[index]);
    } else {
        // 在限定范围内设置
        const pp = attribute.revise(p, raw[index], limit);
        raw[index] = attribute.combine(pp, raw[index]);
    }

    return raw;
}
```

### 3. 删除附属物
```javascript
attribute.remove = (p, raw) => {
    if (p.index === undefined) return false;
    const rst = [];
    for (let i in raw) {
        if (i != p.index) rst.push(raw[i]);
    }
    return rst;
}
```

### 4. 组合参数
```javascript
attribute.combine = (p, row) => {
    const dd = row || JSON.parse(JSON.stringify(config.default));
    dd[0][0] = p.x === undefined ? dd[0][0] : p.x;
    dd[0][1] = p.y === undefined ? dd[0][1] : p.y;
    dd[0][2] = p.z === undefined ? dd[0][2] : p.z;
    dd[1][0] = p.ox === undefined ? dd[1][0] : p.ox;
    dd[1][1] = p.oy === undefined ? dd[1][1] : p.oy;
    dd[1][2] = p.oz === undefined ? dd[1][2] : p.oz;
    dd[2][0] = p.rx === undefined ? dd[2][0] : p.rx;
    dd[2][1] = p.ry === undefined ? dd[2][1] : p.ry;
    dd[2][2] = p.rz === undefined ? dd[2][2] : p.rz;
    dd[3] = p.texture === undefined ? dd[3] : p.texture;
    dd[5] = p.animate === undefined ? dd[5] : p.animate;
    return dd;
}
```

### 5. 修订参数（编辑限制）
```javascript
attribute.revise = (p, row, limit) => {
    const reviseSizeOffset = self.reviseSizeOffset;

    // 尺寸修订
    if (p.x !== undefined) {
        const o = row[1][0];
        const s = limit[0];
        const rst = reviseSizeOffset(o, p.x, s);
        p.ox = rst.offset !== o ? rst.offset : p.ox;
        p.x = rst.size !== p.x ? rst.size : p.x;
    }

    if (p.y !== undefined) {
        const o = row[1][1];
        const s = limit[1];
        const rst = reviseSizeOffset(o, p.y, s);
        p.oy = rst.offset !== o ? rst.offset : p.oy;
        p.y = rst.size !== p.y ? rst.size : p.y;
    }

    if (p.z !== undefined) {
        const o = row[1][2];
        const s = limit[2];
        const rst = reviseSizeOffset(o, p.z, s);
        p.oz = rst.offset !== o ? rst.offset : p.oz;
        p.z = rst.size !== p.z ? rst.size : p.z;
    }

    // 偏移修订
    if (p.ox !== undefined) {
        const w = row[0][0];
        const s = limit[0];
        const rst = reviseSizeOffset(p.ox, w, s);
        p.ox = rst.offset !== p.ox ? rst.offset : p.ox;
        p.x = rst.size !== w ? rst.size : w;
    }

    return p;
}
```

## 菜单系统

### 1. 弹出菜单
```javascript
menu.pop = (std) => {
    return [
        {
            type: "button",
            label: "Info",
            icon: "",
            action: (ev) => {
                console.log(ev);
            }
        },
        {
            type: "button",
            label: "Remove",
            icon: "",
            action: (ev) => {
                console.log(ev);
            }
        },
        {
            type: "button",
            label: "Copy",
            icon: "",
            action: (ev) => {
                console.log(ev);
            }
        }
    ];
}
```

### 2. 侧边栏菜单
```javascript
menu.sidebar = (std) => {
    return {
        size: [
            { type: "number", key: "x", value: std.x, label: "X", icon: "",
              desc: "X of wall", valid: (val, cvt) => valid.x(val, cvt, std) },
            { type: "number", key: "y", value: std.y, label: "Y", icon: "",
              desc: "Y of wall", valid: (val, cvt) => valid.y(val, cvt, std) },
            { type: "number", key: "z", value: std.z, label: "Z", icon: "",
              desc: "Z of wall", valid: (val, cvt) => valid.z(val, cvt, std) },
        ],
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X", icon: "",
              desc: "X of position", valid: (val, cvt) => valid.ox(val, cvt, std) },
            { type: "number", key: "oy", value: std.oy, label: "Y", icon: "",
              desc: "Y of position", valid: (val, cvt) => valid.oy(val, cvt, std) },
            { type: "number", key: "oz", value: std.oz, label: "Z", icon: "",
              desc: "Z of position", valid: (val, cvt) => valid.oz(val, cvt, std) },
        ],
        rotation: [
            { type: "number", key: "rx", value: std.rx, label: "X", icon: "",
              desc: "X of rotation", valid: (val, cvt) => valid.rx(val, cvt, std) },
            { type: "number", key: "ry", value: std.ry, label: "Y", icon: "",
              desc: "Y of rotation", valid: (val, cvt) => valid.ry(val, cvt, std) },
            { type: "number", key: "rz", value: std.rz, label: "Z", icon: "",
              desc: "Z of rotation", valid: (val, cvt) => valid.rz(val, cvt, std) },
        ],
    }
}
```

## 动画系统

### 1. 动画定义
```javascript
const effects = {
    // 旋转动画
    rotate: (param) => {
        const val = !param ? Math.PI / 180 : param[0];
        return {
            name: "rotate",
            duration: 0,          // 0表示无限循环
            loops: 0,             // 0表示无限循环
            category: "mesh",
            timeline: [
                {
                    type: "rotate",
                    mode: "add",
                    axis: "XYZ",
                    time: 0,
                    value: val,
                }
            ],
        };
    },

    // Z轴旋转
    rotateZ: (param) => {
        const val = !param ? 5 * Math.PI / 180 : param[0];
        return {
            name: "rotateZ",
            duration: 0,
            loops: 0,
            timeline: [
                {
                    type: "rotate",
                    mode: "add",
                    axis: "Z",
                    time: 0,
                    value: val,
                }
            ]
        }
    },

    // X轴旋转
    rotateX: (param) => {
        const val = !param ? 5 * Math.PI / 180 : param[0];
        return {
            name: "rotateX",
            duration: 0,
            loops: 0,
            timeline: [
                {
                    type: "rotate",
                    mode: "add",
                    axis: "X",
                    time: 0,
                    value: val,
                }
            ]
        }
    },

    // 转动动画
    turning: (param) => {
        return {
            name: "turning",
            duration: 5000,
            pending: [300, 600],
            loops: 10,
            timeline: [
                {
                    type: "move",
                    mode: "add",
                    axis: "Y",
                    time: [0, 2500],
                    value: 100,
                },
                {
                    type: "move",
                    mode: "add",
                    axis: "Y",
                    time: [2500, 5000],
                    value: -100,
                },
            ],
        };
    },

    // 震动动画
    shake: (param) => {
        return {
            name: "shake",
            duration: 3000,
            pending: 1200,
            loops: 3,
            timeline: [
                {
                    type: "move",
                    time: 0,
                    mode: "add",
                    axis: "XYZ",
                    value: [0, 0.3],
                },
                {
                    type: "rotate",
                    time: 1000,
                    mode: "set",
                    axis: "Y",
                    value: [0, 0.3],
                }
            ],
        }
    },

    // 正弦运动
    sin: (param) => {
        return {
            name: "curve",
            duration: 2000,
            loops: 0,
            timeline: [
                {
                    type: "move",
                    time: [0, 1000],
                    mode: "add",
                    axis: "Y",
                    value: (n) => { return 20; },
                },
                {
                    type: "move",
                    time: [1000, 2000],
                    mode: "add",
                    axis: "Y",
                    value: (n) => { return -20; },
                }
            ],
        }
    },
}
```

### 2. 动画路由
```javascript
const router = [
    effects.rotate,     // 动画1
    effects.rotateZ,    // 动画2
    effects.rotateX,    // 动画3
    effects.turning,    // 动画4
    effects.shake,      // 动画5
    effects.sin,        // 动画6
]
```

### 3. 动画获取
```javascript
hooks.animate = (effect, param) => {
    const index = effect - 1;
    if (!router[index]) return false;

    if (typeof router[index] === 'function') {
        return router[index](param);
    }

    return JSON.parse(JSON.stringify(router[index]));
}
```

## 任务函数

```javascript
const task = {
    // 跳舞任务
    dance: (meshes, cfg) => {
        let count = 100;
        let fun = (n) => {
            for (let i = 0; i < meshes.length; i++) {
                const mesh = meshes[i];
                mesh.scale.x = mesh.scale.x * Toolbox.rand(0.3, 1.9);
                mesh.scale.y = mesh.scale.y * Toolbox.rand(0.3, 1.9);
                mesh.scale.z = mesh.scale.z * Toolbox.rand(0.3, 1.9);
            }
        };
        return [fun, count];
    },

    // 隐藏任务
    hide: (meshes, cfg) => {
        // TODO: 实现隐藏
    },

    // 显示任务
    show: (meshes, cfg) => {
        // TODO: 实现显示
    },

    router: [
        { method: "hide", gameonly: true },
        { method: "show", gameonly: true },
        { method: "dance", gameonly: true },
    ],
}
```

## 配置示例

### 1. 盒子附属物
```javascript
const config = {
    color: 0xf3f5f6,
    stop: {
        offset: 0.05,
        color: 0xffffff,
        opacity: 0.5,
    },
}
```

### 2. 墙壁附属物
```javascript
const config = {
    color: 0x8b5cf6,
    stop: {
        offset: 0.02,
        color: 0xffffff,
        opacity: 0.3,
    },
}
```

### 3. 水附属物
```javascript
const config = {
    color: 0x3b82f6,
    opacity: 0.7,
    stop: false,  // 水不是阻拦体
}
```

## 验证函数

```javascript
const valid = {
    // 验证X尺寸
    x: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },

    // 验证Y尺寸
    y: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },

    // 验证Z尺寸
    z: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },

    // 验证X偏移
    ox: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return n;
    },

    // 验证Y偏移
    oy: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },

    // 验证Z偏移
    oz: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },

    // 验证X旋转
    rx: (val, cvt, std) => {
        // TODO: 实现验证
    },

    // 验证Y旋转
    ry: (val, cvt, std) => {
        // TODO: 实现验证
    },

    // 验证Z旋转
    rz: (val, cvt, std) => {
        // TODO: 实现验证
    },
}
```

## 事件系统

### 支持的事件类型
```javascript
const events = [
    "in",       // 进入附属物范围
    "out",      // 离开附属物范围
    "touch"     // 触摸附属物
]
```

### 事件绑定示例
```javascript
// 进入事件
VBW.event.on("box", "in", (ev) => {
    console.log("Entered box", ev);
}, { x: 2025, y: 619, world: 0, adjunct: "box", index: 0 });

// 触摸事件
VBW.event.on("box", "touch", (ev) => {
    console.log("Touched box", ev);
}, { x: 2025, y: 619, world: 0, adjunct: "box", index: 0 });

// 离开事件
VBW.event.on("box", "out", (ev) => {
    console.log("Left box", ev);
}, { x: 2025, y: 619, world: 0, adjunct: "box", index: 0 });
```

## 阻拦体

### 1. 阻拦体定义
```javascript
// 在附属物数据中设置stop属性
const dt = {
    ...other_params,
    stop: !d[6] ? false : true,  // d[6]为阻拦体标记
}

// 阻拦体材质
if (row.stop) {
    single.stop = {
        opacity: config.stop.opacity,
        color: !config.stop.color ? 0xfffffff : config.stop.color
    };
}
```

### 2. 阻拦体用途
- 阻止玩家通过
- 创建物理边界
- 构建封闭空间
- 支持攀爬、站立等交互

## 触发器

### 1. 触发器数据结构
```javascript
const trigger_data = [
    [x, y, z],              // 尺寸
    [ox, oy, oz],          // 偏移
    [rx, ry, rz],          // 旋转
    texture_id,             // 纹理ID
    [rx_px, ry_px],        // 旋转精度
    animate,                // 动画设置
    [event_index, condition, todo]  // 事件定义
]
```

### 2. 事件定义
```javascript
const event_def = {
    adjunct: "trigger",      // 触发器附属物
    index: 0,               // 触发器索引
    condition: "...",        // 触发条件
    todo: "..."             // 触发后执行的代码
}
```

### 3. 触发器事件
```javascript
const trigger_events = [
    "in",       // 进入触发范围
    "hold",     // 停留在触发范围
    "out"       // 离开触发范围
]
```

## 扩展附属物

### 1. 创建新附属物
```javascript
const new_adjunct = {
    hooks: {
        reg: () => {
            return {
                name: "custom_adjunct",
                category: 'adjunct',
                short: "ca",
                desc: "Custom adjunct description",
                version: "1.0.0",
                events: ["in", "out", "touch"]
            };
        },
        def: (data) => { definition = data },
        animate: (effect, param) => { ... }
    },
    transform: {
        raw_std: (arr, cvt) => { ... },
        std_3d: (stds, va) => { ... },
        std_active: (stds, va, cvt) => { ... },
        std_raw: (arr, cvt) => { ... },
        std_box: (obj) => { ... },
        std_2d: (stds, face) => { ... }
    },
    attribute: {
        add: (p, raw) => { ... },
        set: (p, raw, limit) => { ... },
        remove: (p, raw) => { ... },
        combine: (p, row) => { ... },
        revise: (p, row, limit) => { ... }
    },
    menu: {
        pop: (std) => { ... },
        sidebar: (std) => { ... }
    },
    task: { ... }
}

export default new_adjunct;
```

### 2. 注册自定义附属物
```javascript
// 在World初始化时注册
const regs = {
    adjunct: [
        basic_stop,
        basic_trigger,
        basic_light,
        basic_box,
        basic_module,
        adj_wall,
        adj_water,
        adj_cone,
        adj_ball,
        custom_adjunct,  // 添加自定义附属物
    ],
}
```
