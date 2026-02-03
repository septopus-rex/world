# Block 系统

## 概述

Block是Septopus World的基础构成单元，每个Block为16M×16M的空间，由单一拥有者控制，可以包含多个附属物。

## Block数据结构

### 1. Raw数据（链上存储格式）
```javascript
const BLOCK_RAW = [
    elevation,       // 标高（浮点数）
    status,          // Block状态（整数）
    [               // 附属物数组
        [short, [data]],   // [附属物缩写, 附属物数据]
        ...
    ],
    gameSetting      // 游戏设置（可选）
]
```

### 2. 数据索引定义
```javascript
const definition = {
    BLOCK_INDEX_ELEVACATION: 0,  // 标高索引
    BLOCK_INDEX_STATUS: 1,        // 状态索引
    BLOCK_INDEX_ADJUNCTS: 2,     // 附属物索引
    BLOCK_INDEX_GAME_SETTING: 3  // 游戏设置索引
}
```

### 3. Holder数据（占位符）
```javascript
const BLOCK_HOLDER = {
    x: number,          // Block X坐标
    y: number,          // Block Y坐标
    world: number,       // 世界索引
    data: BLOCK_HOLDER_RAW,  // 占位数据
    owner: string,       // 拥有者地址
    loading: boolean     // 是否正在加载
}

const BLOCK_HOLDER_RAW = [0.2, 1, []];
// [elevation, status, adjuncts]
```

## Block组件结构

```javascript
const vbw_block = {
    holder: () => BLOCK_HOLDER_RAW,  // 返回占位数据
    hooks: {
        reg: () => reg,              // 注册信息
        def: (data) => {},          // 定义数据
    },
    transform: {
        raw_std: (obj, cvt, side) => {},   // Raw → STD
        std_3d: (bks) => {},                // STD → 3D
        std_active: (std, va) => {},         // 编辑高亮
        std_border: (obj, va, cvt) => {},    // 编辑边框
        std_raw: (arr, cvt) => {},           // STD → Raw
        std_box: (obj) => {},                 // STD → Bounding Box
        std_2d: (bks, face, faces) => {}     // STD → 2D
    },
    attribute: {
        load: (x, y, param, world, dom_id) => {},      // 加载Block
        unload: (x, y, param, world, dom_id) => {},    // 卸载Block
        set: (x, y, param, world, dom_id) => {},      // 设置Block
        backup: (x, y, param, world, dom_id) => {},    // 备份Block
        recover: (x, y, param, world, dom_id) => {},   // 恢复Block
    },
    menu: {
        pop: (std) => [],           // 弹出菜单
        sidebar: (std) => {}        // 侧边栏菜单
    },
    task: {}  // 触发器任务
}
```

## 数据转换

### 1. Raw → STD转换
```javascript
block.transform.raw_std = (obj, cvt, side) => {
    const va = obj[BLOCK_INDEX_ELEVATION];  // 标高
    const status = obj[BLOCK_INDEX_STATUS];    // 状态
    const s = side[0];                         // Block边长
    const hs = 0.5 * s;                        // 半边长
    const bh = 0.1 * cvt;                     // Block默认厚度

    const data = {
        x: s,
        y: s,
        z: va * cvt + bh,              // Block总高度
        ox: hs,                       // 中心X偏移
        oy: hs,                       // 中心Y偏移
        oz: va * cvt * 0.5 - 0.5 * bh,  // 中心Z偏移
        rx: 0,                        // X旋转
        ry: 0,                        // Y旋转
        rz: 0,                        // Z旋转
        status: status,
        elevation: va * cvt,
        material: {
            texture: 206,            // 默认地面纹理
            color: 0xdddddd,
            repeat: [10, 10],
        },
    };

    // 游戏设置
    if (obj[BLOCK_INDEX_GAME_SETTING] !== undefined) {
        data.game = obj[BLOCK_INDEX_GAME_SETTING];
    }

    return [data];
}
```

### 2. STD → 3D转换
```javascript
block.transform.std_3d = (bks) => {
    const arr = [];
    for (let i = 0; i < bks.length; i++) {
        const row = bks[i];
        arr.push({
            type: "box",
            params: {
                size: [row.x, row.y, row.z],
                position: [row.ox, row.oy, row.oz],
                rotation: [row.rx, row.ry, row.rz],
            },
            material: row.material,
        });
    }
    return arr;
}
```

### 3. 编辑边框转换（编辑模式）
```javascript
block.transform.std_border = (obj, va, cvt) => {
    const ds = { stop: [], helper: [] };
    const cfg = {
        height: 0.5,                // 边框高度（米）
        color: {
            north: 0xe11d48,    // 北 - 红色
            south: 0x6b7280,    // 南 - 黑色
            east: 0x3b82f6,      // 东 - 蓝色
            west: 0x10b981,      // 西 - 绿色
        }
    };
    const h = cfg.height * cvt;
    const row = obj[0];
    const cc = 0.5 * row.x;  // 中心点
    const oz = va + h * 0.5;
    const w = 0.02 * cvt;        // 边框线宽

    // 四个方向的边框
    const arr = [
        // 南边框
        {
            type: "box",
            params: {
                size: [row.x, w, h],
                position: [cc, 0, oz],
                rotation: [0, 0, 0],
            },
            material: { color: cfg.color.south },
        },
        // 东边框
        {
            type: "box",
            params: {
                size: [w, row.y, h],
                position: [cc + cc, cc, oz],
                rotation: [0, 0, 0],
            },
            material: { color: cfg.color.east },
        },
        // 北边框
        {
            type: "box",
            params: {
                size: [row.x, w, h],
                position: [cc, cc + cc, oz],
                rotation: [0, 0, 0],
            },
            material: { color: cfg.color.north },
        },
        // 西边框
        {
            type: "box",
            params: {
                size: [w, row.y, h],
                position: [0, cc, oz],
                rotation: [0, 0, 0],
            },
            material: { color: cfg.color.west },
        },
    ];

    ds.helper = arr;
    return ds;
}
```

## Block属性操作

### 1. 加载Block
```javascript
block.attribute.load = (x, y, param, world, dom_id) => {
    World.load(dom_id, world, x, y);
}
```

### 2. 卸载Block
```javascript
block.attribute.unload = (x, y, param, world, dom_id) => {
    World.unload(dom_id, world, x, y);
}
```

### 3. 设置Block
```javascript
block.attribute.set = (x, y, param, world, dom_id) => {
    // TODO: 实现Block参数设置
}
```

### 4. 备份Block
```javascript
funs.backup = (x, y, world, dom_id) => {
    const key = `${x}_${y}`;
    const chain = ["modified", dom_id, world, key];

    if (!VBW.cache.exsist(chain)) {
        VBW.cache.set(chain, { final: null, backup: null });
    }

    const backup_data = VBW.cache.get(["block", dom_id, world, key, "raw"]);
    if (!backup_data || backup_data.error) {
        return { error: `No [${x}, ${y}] raw data to backup` };
    }

    const backup = Toolbox.clone(backup_data);
    VBW.cache.set([...chain, "backup"], backup);
    return true;
}
```

### 5. 恢复Block
```javascript
block.attribute.recover = (x, y, param, world, dom_id) => {
    // TODO: 实现Block恢复
}
```

## Block菜单

### 1. 弹出菜单
```javascript
block.menu.pop = (std) => {
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
        }
    ];
}
```

### 2. 侧边栏菜单
```javascript
block.menu.sidebar = (std) => {
    return {
        elevation: [
            {
                type: "number",
                key: "elevation",
                value: std.z,
                label: "",
                desc: "Elevation of block",
                valid: (val) => {}
            }
        ],
        status: [
            {
                type: "number",
                key: "status",
                value: std.status,
                label: "",
                desc: "Status of block",
                valid: (val) => {}
            }
        ]
    }
}
```

## Block事件

### 支持的事件类型
```javascript
const events = [
    "in",       // 进入Block
    "out",      // 离开Block
    "hold",     // 停留在Block
    "stop",     // 被阻挡
    "loaded",   // 加载完成
    "cross",    // 穿过Block边界
    "unload"    // 卸载
]
```

### 事件触发示例
```javascript
// Block加载完成
VBW.event.trigger("block", "loaded", {
    stamp: Toolbox.stamp()
}, { x, y, world, index: 0, adjunct: "block" });

// 进入Block
VBW.event.trigger("block", "in", {
    stamp: Toolbox.stamp()
}, { x, y, world, index: 0, adjunct: "block" });

// 被阻挡
VBW.event.trigger("block", "stop", {
    stamp: Toolbox.stamp()
}, [x, y]);
```

## Block配置

```javascript
const config = {
    opacity: 1,           // 不透明度
    texture: 206,         // 地面纹理ID
    color: 0xdddddd,       // 地面颜色
    repeat: [10, 10],      // 纹理重复
    active: {
        height: 0.5,       // 编辑模式下边框高度（米）
        color: {
            north: 0xe11d48,
            south: 0x6b7280,
            east: 0x3b82f6,
            west: 0x10b981,
        }
    },
    basic: 0.1,           // Block默认厚度（米）
}
```

## Block坐标计算

### 1. 世界坐标到Block内坐标
```javascript
const x_in_block = world_x % block_size;
const y_in_block = world_y % block_size;
```

### 2. Block内坐标到世界坐标
```javascript
const world_x = (block_x - 1) * block_size + x_in_block;
const world_y = (block_y - 1) * block_size + y_in_block;
```

### 3. Block中心点计算
```javascript
const center_x = (block_x - 1) * block_size + block_size / 2;
const center_y = (block_y - 1) * block_size + block_size / 2;
```

## Block缓存管理

### 1. 数据层次
```
cache.block[dom_id][world][`${x}_${y}`] = {
    raw: BLOCK_RAW,      // 链上原始数据
    recover: BLOCK_RAW,   // 恢复数据
    std: STD_DATA,       // 标准中间数据
    three: THREE_DATA,    // Three.js渲染数据
    stop: STOP_ARRAY,     // 阻拦体数据
    trigger: TRIGGER_ARRAY, // 触发器数据
    elevation: number,    // 标高
}
```

### 2. 清理Block数据
```javascript
funs.clean = (arr, world, dom_id) => {
    const chain_std = ["block", dom_id, world];
    const bks = VBW.cache.get(chain_std);

    for (let i = 0; i < arr.length; i++) {
        const row = arr[i];
        const key = `${row[0]}_${row[1]}`;
        delete bks[key];
    }

    return true;
}
```

## Block加载流程

### 1. 从链加载
```javascript
World.launch = (dom_id, x, y, ext, world, limit, ck, cfg) => {
    VBW.datasource.view(x, y, ext, world, (map) => {
        if (map.loaded !== undefined && !map.loaded) {
            // 1. 添加加载队列
            delete map.loaded;
            World.loadingBlockQueue(map, dom_id);

            // 2. 保存数据
            const failed = World.save(dom_id, world, map, world_info);
            if (failed) return;

            // 3. 构建占位符
            const range = { x, y, ext, world, container: dom_id };
            VBW.load(range, (pre) => {
                // 4. 预加载资源
                World.prefetch(pre.texture, pre.module, (failed) => {
                    return ck && ck(true);
                });
            }, cfg);
        }
    });
}
```

### 2. Block加载队列处理
```javascript
world.checkBlock = () => {
    const name = config.queue.block;
    const queue = VBW.queue.get(name);
    if (queue.error || queue.length === 0) return false;

    const todo = queue[0];
    const { x, y, world, container } = todo;

    // 检查数据是否加载
    const dt = VBW.cache.get(["block", container, world, todo.key, "raw"]);
    if (dt.error || dt.loading) return false;

    // 构建Block数据
    const range = { x, y, world, container };
    VBW.load(range, (pre) => {
        // 触发block.loaded事件
        const evt = { x, y, world };
        VBW.event.trigger("block", "loaded", evt, {
            x, y, world, index: 0, adjunct: "block", stamp: Toolbox.stamp()
        });

        // 加载所需资源
        World.loadingResourceQueue(pre, x, y, world, container);

        // 设置游戏模式按钮
        if (pre.game && pre.game.length !== 0) {
            World.updateGame(pre.game);
        }

        // 刷新渲染
        if (!World.outofRange(x, y)) {
            VBW[config.render].show(container, [x, y, world]);
        }
    }, {});

    queue.shift();
    runtime.counter.block--;
    if (runtime.counter.block === 0) {
        VBW.event.trigger("system", "launch", { stamp: Toolbox.stamp() });
    }
}
```

## Block与附属物关系

### 1. 附属物数据格式
```javascript
const ADJUNCT_RAW = [
    [short, [data]],  // [附属物缩写, 附属物数据]
    ...
]

// 附属物内部数据格式
const ADJUNCT_DATA = [
    [x, y, z],           // 尺寸
    [ox, oy, oz],         // 偏移
    [rx, ry, rz],         // 旋转
    texture_id,            // 纹理ID
    [rx_px, ry_px],       // 旋转精度
    animate,              // 动画设置
    event                 // 事件设置（可选）
]
```

### 2. 名称映射
```javascript
const map = {
    "wall": "wl",      // 墙壁
    "box": "bx",        // 盒子
    "water": "wt",      // 水
    "light": "lt",      // 灯光
    "trigger": "tr",    // 触发器
    "stop": "sp",       // 阻拦体
    "module": "md",     // 模块
    ...
}

// 双向映射
VBW.cache.set(["map"], {
    "wall": "wl", "wl": "wall",
    "box": "bx", "bx": "box",
    ...
});
```
