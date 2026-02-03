# Framework 核心框架

## 概述

Framework是Septopus World的核心基础架构，负责组件注册、缓存管理、队列调度和数据结构转换。

## 核心结构

```javascript
const Framework = {
    init: () => {},
    component: {},  // 组件管理
    cache: {},      // 缓存系统
    queue: {},      // 队列系统
    setting: () => {},  // 配置获取
    mode: () => {},      // 模式切换
    load: () => {},      // 数据加载
    update: () => {},    // 数据更新
    loop: () => {}       // 帧同步循环
}
```

## 组件注册系统

### 1. 组件注册
```javascript
const regs = {
    core: [vbw_detect, vbw_sky, vbw_time, vbw_weather, vbw_block, ...],
    render: [render_3d, render_2d, render_observe, ...],
    controller: [control_fpv, control_2d, control_observe],
    adjunct: [basic_stop, basic_trigger, basic_light, basic_box, ...],
    plugin: [plug_link],
};

// 执行注册
for (let cat in regs) {
    const coms = regs[cat];
    for (let i = 0; i < coms.length; i++) {
        const component = coms[i];
        const cfg = component.hooks.reg();
        VBW.component.reg(cfg, component);

        // 初始化组件
        if (component.hooks.init !== undefined) {
            const res = component.hooks.init();
            VBW.cache.set(res.chain, res.value);
        }
    }
}
```

### 2. 组件结构
```javascript
const component = {
    hooks: {
        reg: () => { return reg },           // 返回组件注册信息
        init: () => { return { chain, value } },  // 初始化，返回缓存键值
        def: (data) => {},                // 定义数据
        animate: (router, param) => {}   // 动画定义
    },
    transform: {
        raw_std: (arr, cvt) => {},       // Raw → STD转换
        std_raw: (arr, cvt) => {},       // STD → Raw转换
        std_3d: (stds, va) => {},       // STD → 3D转换
        std_active: (stds, va, cvt) => {}, // STD → 编辑高亮转换
        std_border: (obj, va, cvt) => {}, // STD → 编辑边框转换
        std_2d: (stds, face) => {}     // STD → 2D转换
    },
    attribute: {
        add: (param, raw) => {},      // 添加附属物
        set: (param, raw, limit) => {}, // 设置附属物
        remove: (param, raw) => {},    // 删除附属物
        combine: (param, row) => {},   // 组合参数到行
        revise: (param, row, limit) => {} // 修订参数
    },
    menu: {
        pop: (std) => [],            // 弹出菜单
        sidebar: (std) => {}        // 侧边栏菜单
    },
    task: {}  // 触发器任务函数
}
```

### 3. 组件类型

#### System组件
```javascript
const reg = {
    name: "block",
    category: 'system',
    desc: "Block decoder, basic component of system.",
    version: "1.0.0",
    events:["in","out","hold","stop","loaded","cross","unload"],
}
```

#### Render组件
```javascript
const reg = {
    name: "rd_three",
    type: 'render',
    desc: "three.js renderer",
    version:"1.0.0",
    events:["ready","done"],
}
```

#### Controller组件
```javascript
const reg = {
    name: "con_first",
    category: 'controller',
    desc: "FPV controller for Septopus World",
    version: "1.0.0",
}
```

#### Adjunct组件
```javascript
const reg = {
    name: "box",
    category: 'basic',
    desc: "Basic adjunct of meta septopus.",
    version: "1.0.0",
    events: ["in","out","touch"],
    short: "bx"  // 缩写，减少链上数据
}
```

## 缓存系统

### 1. 缓存键结构
```javascript
const config = {
    keys: [
        "component",    // 组件注册信息
        "resource",     // 资源（module/texture）
        "queue",        // 系统队列
        "block",        // Block数据
        "map",          // 组件映射（short↔name）
        "env",          // 运行时环境
        "active",       // 活动状态
        "task",         // 修改任务
        "modified",     // 修改的Block
        "def",          // 世界和附属物定义
        "setting",      // 系统设置
    ],
}
```

### 2. 缓存操作
```javascript
VBW.cache = {
    // 获取缓存
    get: (chain, clone) => {
        if (!Array.isArray(chain)) return { error: "Invalid path chain" };
        let tmp = cache;
        for (let i = 0; i < chain.length; i++) {
            if (tmp[chain[i]] === undefined) return { error: "Invalid data" };
            tmp = tmp[chain[i]];
        }
        return !clone ? tmp : Toolbox.clone(tmp);
    },

    // 检查存在
    exsist: (chain) => {
        let tmp = cache;
        for (let i = 0; i < chain.length; i++) {
            if (tmp[chain[i]] === undefined) return false;
            tmp = tmp[chain[i]];
        }
        return true;
    },

    // 设置缓存
    set: (chain, value) => {
        if (cache[chain[0]] === undefined) return { error: "Invalid root key" };
        Toolbox.extend(chain, value, true, cache);
        return true;
    },

    // 删除缓存
    remove: (chain) => {
        let tmp = cache;
        for (let i = 0; i < chain.length - 1; i++) {
            tmp = tmp[chain[i]];
        }
        delete tmp[chain[chain.length - 1]];
        return true;
    }
}
```

### 3. Block数据缓存结构
```javascript
cache.block = {
    [dom_id]: {
        [world]: {
            [`${x}_${y}`]: {
                raw: BLOCK_RAW_DATA,      // 原始链上数据
                recover: BLOCK_RAW_DATA,   // 恢复数据（用于撤销）
                std: STD_DATA,            // 标准中间数据
                three: THREE_DATA,         // Three.js渲染数据
                stop: STOP_ARRAY,          // 阻拦体数据
                trigger: TRIGGER_ARRAY,    // 触发器数据
                elevation: number,         // Block标高
                animate: {                // 动画数据映射
                    [key]: THREE_MESH_ARRAY
                }
            },
            sky: THREE_SKY_OBJECT,        // 天空对象
            queue: FRAME_FUNCTIONS,         // 帧同步函数队列
            loop: FRAME_FUNCTIONS          // 帧同步队列别名
        },
        edit: {                        // 编辑模式数据
            x, y, world,
            border: [],                 // 边框对象
            helper: [],                 // 高亮辅助对象
            grid: {
                raw: null,              // 网格参数
                line: [],               // 网格线
                points: []             // 网格点
            },
            selected: {
                adjunct: "",            // 选中的附属物
                index: 0,              // 选中索引
                face: ""               // 选中的面
            },
            objects: {
                stop: null,
                helper: null,
                grid: null
            }
        }
    }
}
```

### 4. 环境缓存结构
```javascript
cache.env = {
    world: {
        side: [16000, 16000],          // Block尺寸
        accuracy: 1000,                 // 坐标转换精度
        block: { limit: [4096, 4096] }, // 世界范围
        common: { ... }                 // 通用定义
    },
    player: {
        location: {
            block: [x, y],            // 当前Block坐标
            position: [x, y, z],       // 相对位置
            rotation: [x, y, z],       // 玩家朝向
            world: 0,                 // 世界索引
            extend: 2,                 // 加载范围
            stop: { on: false, adjunct: "", index: 0 }
        },
        address: "",                   // 玩家地址
        body: { height: 1.7, ... }, // 身体参数
        capacity: { ... }             // 能力参数
    },
    device: { mobile: false },        // 设备类型
    datasource: { ... },            // 数据源配置
}
```

## 队列系统

### 1. 队列类型
```javascript
config.queue = {
    block: "block_loading",          // Block加载队列
    resource: "resource_loading",    // 资源加载队列
    trigger: "trigger_runtime"      // 触发器运行队列
}
```

### 2. 队列操作
```javascript
VBW.queue = {
    // 初始化队列
    init: (qu) => {
        const chain = ["queue", qu];
        VBW.cache.set(chain, []);
        return true;
    },

    // 清空队列
    clean: (qu) => {
        const chain = ["queue", qu];
        VBW.cache.set(chain, []);
        return true;
    },

    // 推入队列
    push: (qu, val) => {
        const chain = ["queue", qu];
        if (!VBW.cache.exsist(chain)) VBW.queue.init(qu);
        const arr = VBW.cache.get(chain);
        arr.push(val);
        return true;
    },

    // 推入（去重）
    insert: (qu, val) => {
        const chain = ["queue", qu];
        if (!VBW.cache.exsist(chain)) VBW.queue.init(qu);
        const arr = VBW.cache.get(chain);
        if (!arr.includes(val)) arr.push(val);
        return true;
    },

    // 从队列移除
    remove: (qu, val) => {
        const chain = ["queue", qu];
        const arr = VBW.cache.get(chain);
        const index = arr.indexOf(val);
        if (index < 0) return false;
        arr.splice(index, 1);
        return true;
    },

    // 按索引删除
    drop: (qu, index) => {
        const chain = ["queue", qu];
        const arr = VBW.cache.get(chain);
        arr.splice(index, 1);
        return true;
    },

    // 获取队列
    get: (qu) => {
        const chain = ["queue", qu];
        return VBW.cache.get(chain);
    }
}
```

## 数据转换系统

### 1. Raw → STD转换
```javascript
framework.structSingle = (x, y, world, dom_id) => {
    const key = `${x}_${y}`;
    const cvt = VBW.cache.get(["env", "world", "accuracy"]);
    const side = VBW.cache.get(["env", "world", "side"]);
    const raw_chain = ["block", dom_id, world, key, "raw"];
    const bk = VBW.cache.get(raw_chain);
    const std = {};

    // 1. 构建Block数据
    std.block = Framework.block.transform.raw_std(bk.data, cvt, side);

    // 2. 设置Block标高
    const va = std.block[ELEVATION_INDEX].elevation;
    VBW.cache.set(["block", dom_id, world, key, "elevation"], va);

    // 3. 构建所有附属物
    const adjs = bk.data[ADJUNCT_INDEX];
    for (let i = 0; i < adjs.length; i++) {
        const [short, list] = adjs[i];
        const name = Framework.getNameByShort(short);
        std[name] = Framework[name].transform.raw_std(list, cvt);
    }

    VBW.cache.set(["block", dom_id, world, key, "std"], std);
    return gameSetting;
}
```

### 2. STD → 3D转换
```javascript
framework.structRenderData = (x, y, world, dom_id) => {
    const std_chain = ["block", dom_id, world, `${x}_${y}`, "std"];
    const map = VBW.cache.get(std_chain);
    const va = VBW.getElevation(x, y, world, dom_id);

    const rdata = {};
    const stops = [];
    const triggers = [];
    const preload = { module: [], texture: [] };

    // 遍历STD数据转换为3D格式
    for (let name in map) {
        const std = map[name];
        const data = Framework[name].transform.std_3d(std, va);

        for (let i = 0; i < data.length; i++) {
            const row = data[i];

            // 1. 过滤纹理
            if (row.material && row.material.texture) {
                preload.texture.push(row.material.texture);
            }

            // 2. 过滤模块
            if (row.module) {
                preload.module.push(row.module);
            }

            // 3. 过滤阻拦体
            if (row.stop) {
                const obj = Toolbox.clone(row.params);
                obj.material = row.stop;
                obj.orgin = { adjunct: name, index: i, type: row.type };
                stops.push(obj);
            }

            // 4. 过滤触发器
            if (name === "trigger") {
                const tgr = Toolbox.clone(row.params);
                tgr.material = row.material;
                tgr.orgin = { type: row.type, index: i, adjunct: name };
                triggers.push(tgr);
            }
        }

        rdata[name] = data;
    }

    // 保存到缓存
    VBW.cache.set(["block", dom_id, world, key, "three"], rdata);
    VBW.cache.set(["block", dom_id, world, key, "stop"], stops);
    VBW.cache.set(["block", dom_id, world, key, "trigger"], triggers);

    return preload;
}
```

## 模式系统

### 1. 模式切换
```javascript
framework.mode = (mode, target, ck, cfg) => {
    const { x, y, world, container } = target;
    const def = VBW.cache.get(["def", "common"]);

    switch (mode) {
        case def.MODE_NORMAL:
            cache.active.containers[container].mode = def.MODE_NORMAL;
            // 删除编辑数据
            if (cache.block[container] &&
                cache.block[container][world] &&
                cache.block[container][world].edit) {
                delete cache.block[container][world].edit;
            }
            ck && ck();
            break;

        case def.MODE_EDIT:
            cache.active.containers[container].mode = def.MODE_EDIT;
            const pre = framework.toEdit(x, y, world, container);
            if (cfg && cfg.selected) {
                framework.toSelect(x, y, world, container);
            }
            ck && ck(pre);
            break;

        case def.MODE_GAME:
            cache.active.containers[container].mode = def.MODE_GAME;
            break;

        case def.MODE_GHOST:
            if (!cache.active.containers[container].mode) {
                cache.active.containers[container].mode = def.MODE_GHOST;
            }
            break;
    }
}
```

### 2. 编辑模式数据转换
```javascript
framework.toEdit = (x, y, world, dom_id) => {
    const preload = { module: [], texture: [] };

    const std_chain = ["block", dom_id, world, `${x}_${y}`, "std"];
    const map = VBW.cache.get(std_chain);
    const cvt = VBW.getConvert();
    const va = VBW.getElevation(x, y, world, dom_id);

    const edit = VBW.cache.get(["block", dom_id, world, "edit"]);

    // 1. Block边框数据
    const bk = Framework.block.transform.std_border(map.block, va, cvt);
    if (bk.helper && bk.helper.length !== 0) {
        edit.border.length = 0;
        for (let i = 0; i < bk.helper.length; i++) {
            const row = bk.helper[i];
            if (row.material && row.material.texture) {
                preload.texture.push(row.material.texture);
            }
            if (row.module) {
                preload.module.push(row.module);
            }
            edit.border.push(row);
        }
    }

    return preload;
}
```

## 帧同步循环

### 1. 循环入口
```javascript
framework.loop = (ev) => {
    // 1. 获取活动场景
    const dom_id = VBW.cache.get(["active", "current"]);
    if (dom_id.error) return false;

    const active = VBW.getActive(dom_id);
    const world = VBW.cache.get(["env", "player", "location", "world"]);

    // 2. 帧同步队列
    const list = VBW.getLoopQueue(world, dom_id);
    if (!list.error) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].fun) list[i].fun();
        }
    }

    // 3. 渲染场景
    active.render.render(active.scene, active.camera);
    active.status.update();
}
```

### 2. 队列注册
```javascript
world.setChecker = (dom_id, world) => {
    const chain = ["block", dom_id, world, "loop"];
    const queue = VBW.cache.get(chain);
    if (queue.error) return false;

    queue.push({ name: "block_checker", fun: world.checkBlock });
    queue.push({ name: "resource_checker", fun: world.checkResource });
    queue.push({ name: "trigger_runtime", fun: world.runTrigger });
}
```

## 更新系统

### 1. 任务执行
```javascript
framework.excute = (arr, dom_id, world, ck, failed) => {
    if (failed === undefined) failed = [];

    if (arr.length === 0) {
        // 退出前清理所有需要刷新的Block
        const ups = VBW.cache.get(["modified", dom_id, world]);
        return ck && ck(failed);
    }

    const task = arr.pop();

    // 1. Block任务
    if (task.block !== undefined) {
        if (Framework.block.attribute[task.action]) {
            const [x, y] = task.block;
            Framework.block.attribute[task.action](x, y,
                !task.param ? {} : task.param, world, dom_id);
        }
        return framework.excute(arr, dom_id, world, ck, failed);
    }

    // 2. 附属物任务
    if (!Framework[task.adjunct] ||
        !Framework[task.adjunct].attribute ||
        !Framework[task.adjunct].attribute[task.action]) {
        failed.push({ error: `Invalid task` });
        return framework.excute(arr, dom_id, world, ck, failed);
    }

    const fun = Framework[task.adjunct].attribute[task.action];
    const key = `${task.x}_${task.y}`;
    const raw = VBW.cache.getRawByName(task.adjunct,
        VBW.cache.get(["block", dom_id, world, key, "raw", "data"]));

    task.limit !== undefined
        ? fun(task.param, raw, task.limit)
        : fun(task.param, raw);

    // 3. 保存修改
    const m_chain = ["modified", dom_id, world];
    if (!VBW.cache.exsist(m_chain)) VBW.cache.set(m_chain, {});
    VBW.cache.get(m_chain)[key] = Toolbox.stamp();

    return framework.excute(arr, dom_id, world, ck, failed);
}
```

## 数据源中间件

```javascript
framework.middle = (fun) => {
    return ((fun) => {
        return (...args) => {
            const dom_id = cache.active.current;
            if (!dom_id ||
                !cache.active.containers[dom_id] ||
                !cache.def.common ||
                !cache.def.common.MODE_GAME) {
                return fun(...args);
            }

            const mode = cache.active.containers[dom_id].mode;
            if (mode !== cache.def.common.MODE_GAME) {
                return fun(...args);
            }

            // 游戏模式下停止网络请求
            console.log("Stop requesting in game mode.");
            return { error: "In game mode, failed to get data." };
        }
    })(fun)
}
```

## 配置系统

```javascript
framework.setting = (key) => {
    if (key === undefined) return cache.setting;
    if (cache.setting[key] === undefined) return false;
    return cache.setting[key];
}
```

## 辅助方法

### 1. 获取转换系数
```javascript
framework.getConvert = () => {
    return VBW.cache.get(["env", "world", "accuracy"]);
}
```

### 2. 获取Block尺寸
```javascript
framework.getSide = () => {
    return VBW.cache.get(["env", "world", "side"]);
}
```

### 3. 获取标高
```javascript
framework.getElevation = (x, y, world, dom_id) => {
    return VBW.cache.get(["block", dom_id, world, `${x}_${y}`, "elevation"]);
}
```

### 4. 名称映射
```javascript
framework.getNameByShort = (short) => {
    if (cache.map[short] === undefined) return false;
    return cache.map[short];
}

framework.getRawByName = (name, list) => {
    if (!cache.map[name]) return { error: "Invalid adjunct name" };
    const short = cache.map[name];
    for (const row of list) {
        if (row[0] === short) return row[1];
    }
    return { error: "No adjunct raw data." };
}
```
