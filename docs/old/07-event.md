# 事件系统

## 概述

事件系统（Event System）是Septopus World的核心通信机制，支持组件间的事件订阅、发布和触发。

## 事件分类

```javascript
const events = {
    system: {
        init: {},       // 系统初始化
        launch: {},     // 系统启动
        off: {},        // 系统停止
        restart: {},    // 系统重启
        update: {},     // 系统更新
    },
    block: {
        in: {},         // 进入Block
        out: {},        // 离开Block
        hold: {},       // 停留在Block
        stop: {},       // 被阻挡
        loaded: {},     // Block加载完成
        cross: {},      // 越过Block边界
        unload: {},     // Block卸载
    },
    trigger: {
        in: {},         // 进入触发器范围
        hold: {},       // 停留在触发器范围
        out: {},        // 离开触发器范围
    },
    stop: {
        on: {},         // 站在阻拦体上
        leave: {},      // 离开阻拦体
        beside: {},     // 在阻拦体旁
    },
    player: {
        fall: {},       // 玩家掉落
        death: {},      // 玩家死亡
        start: {},      // 玩家开始
        hold: {},       // 玩家停留
        rotate: {},     // 玩家旋转
    },
    module: {
        parsed: {},     // 模型解析完成
    },
    datasource: {
        request: {},    // 数据请求
        update: {},     // 数据更新
        blocked: {},    // 游戏模式下阻断
        recover: {},    // 游戏模式下恢复
    },
}
```

## 事件注册

### 1. 组件事件注册
```javascript
const component = {
    name: "custom_adjunct",
    category: 'adjunct',
    events: ["in", "out", "touch"],
}

// 在组件注册时注册事件
if (component.events) {
    VBW.event.reg(component.name, component.events);
}
```

### 2. 注册到事件系统
```javascript
VBW.event.reg = (cat, list) => {
    if (!events[cat]) {
        events[cat] = {};
    }

    for (const evt of list) {
        events[cat][evt] = {};
    }
}
```

## 事件绑定

### 1. 绑定全局事件
```javascript
VBW.event.on = (cat, event, fun, obj) => {
    if (!events[cat]) {
        return { error: "Invalid event type" };
    }

    if (!events[cat][event]) {
        return { error: "Invalid special event" };
    }

    if (obj === undefined) {
        // 全局绑定：生成随机名称
        const name = self.randomName();
        events[cat][event][name] = fun;
        return name;
    } else {
        // 对象级绑定：生成对象名称
        const name = self.getNameByObj(obj);
        if (name.error) return name;

        events[cat][event][name] = fun;
        return true;
    }
}
```

### 2. 生成随机名称
```javascript
self.randomName = (n) => {
    const len = !n ? 12 : n;
    let hash = 'event_';
    const hexChars = '0123456789abcdef';

    for (let i = 0; i < len; i++) {
        hash += hexChars[Math.floor(Math.random() * 16)];
    }

    return hash;
}
```

### 3. 生成对象名称
```javascript
self.getNameByObj = (obj) => {
    if (typeof obj === 'string' || obj instanceof String) {
        return obj;
    }

    if (!obj.x || !obj.y || !obj.adjunct || obj.index === undefined) {
        return { error: "Invalid event object." };
    }

    return `${obj.x}_${obj.y}_${obj.world || 0}_${obj.adjunct}_${obj.index}`;
}
```

## 事件解绑

```javascript
VBW.event.off = (cat, event, obj) => {
    if (!events[cat]) {
        return { error: "Invalid event type" };
    }

    if (!events[cat][event]) {
        return { error: "Invalid special event" };
    }

    const name = self.getNameByObj(obj);
    delete events[cat][event][name];
}
```

## 事件触发

### 1. 触发全局事件
```javascript
VBW.event.trigger = (cat, event, param, obj) => {
    if (!events[cat]) {
        return { error: "Invalid event type" };
    }

    if (self.empty(events[cat][event])) {
        return { error: "Invalid special event" };
    }

    if (obj === undefined) {
        // 触发所有绑定函数
        for (let name in events[cat][event]) {
            events[cat][event][name](param);
        }
    } else {
        // 触发对象级事件
        for (let name in events[cat][event]) {
            const target = self.getNameByObj(obj);

            if (name === target) {
                const fun = events[cat][event][name];
                fun(param);
            }
        }
    }
}
```

### 2. 检查空对象
```javascript
self.empty = (obj) => {
    if (obj === null) return true;
    for (let k in obj) return false;
    return true;
}
```

## 系统事件

### 1. 系统初始化
```javascript
// 在World.init中触发
VBW.event.trigger("system", "init", { stamp: Toolbox.stamp() });

// 组件可以监听
VBW.event.on("system", "init", (ev) => {
    console.log("System initialized", ev.stamp);
});
```

### 2. 系统启动
```javascript
// 所有Block加载完成后触发
VBW.event.trigger("system", "launch", { stamp: Toolbox.stamp() });

// 启动动画系统
VBW.event.on("system", "launch", (ev) => {
    const world = env.player.location.world;
    env.animation = {
        queue: {},
        checkpoint: {},
        frame: 0,
        start: ev.stamp,
    };
    self.structEffects(world, dom_id);

    // 添加动画到帧同步队列
    const chain = ["block", dom_id, world, "loop"];
    const queue = VBW.cache.get(chain);
    queue.push({ name: "three_animation", fun: self.animate });
});
```

### 3. 系统更新
```javascript
// 数据更新后触发
VBW.event.trigger("system", "update", {
    stamp: Toolbox.stamp(),
    container: dom_id,
    world: world
});
```

## Block事件

### 1. Block加载完成
```javascript
// Block数据解析完成后触发
const evt = { x: x, y: y, world: world };
VBW.event.trigger("block", "loaded", evt, {
    x: x,
    y: y,
    world: world,
    index: 0,
    adjunct: "block",
    stamp: Toolbox.stamp()
});

// 监听Block加载
VBW.event.on("block", "loaded", (ev) => {
    console.log("Block loaded:", ev);
}, target);
```

### 2. 进入/离开Block
```javascript
// 玩家移动到新Block时触发
VBW.event.trigger("block", "in", {
    stamp: Toolbox.stamp()
}, {
    x: new_block_x,
    y: new_block_y,
    world: world,
    index: 0,
    adjunct: "block"
});

VBW.event.trigger("block", "out", {
    stamp: Toolbox.stamp()
}, {
    x: old_block_x,
    y: old_block_y,
    world: world,
    index: 0,
    adjunct: "block"
});
```

### 3. Block阻挡
```javascript
// 玩家被Block高度阻挡时触发
VBW.event.trigger("block", "stop", {
    stamp: Toolbox.stamp()
}, [block_x, block_y]);
```

## 触发器事件

### 1. 触发器进入
```javascript
// 玩家进入触发器范围时触发
const target = {
    x: x,
    y: y,
    world: world,
    index: trigger_index,
    adjunct: "trigger",
    start: Toolbox.stamp(),
    hold: false,
    container: runtime.container,
};

VBW.event.trigger("trigger", "in", evt, Toolbox.clone(target));

// 触发器内部处理
if (env.trigger === null && orgin !== false) {
    env.trigger = target;
    VBW.event.trigger("trigger", "in", evt, Toolbox.clone(target));
}
```

### 2. 触发器停留
```javascript
// 玩家在触发器内停留超过阈值时触发
if (env.trigger.hold === false) {
    const delta = Toolbox.stamp() - env.trigger.start;
    if (delta > config.hold) {
        VBW.event.trigger("trigger", "hold", evt, Toolbox.clone(env.trigger));
        env.trigger.hold = true;
    }
}
```

### 3. 触发器离开
```javascript
// 玩家离开触发器范围时触发
if (orgin === false) {
    VBW.event.trigger("trigger", "out", evt, Toolbox.clone(env.trigger));
    env.trigger = null;
}
```

## 玩家事件

### 1. 玩家掉落
```javascript
// 玩家掉落时触发
const evt = {
    from: { ... },
    fall: height,
    stamp: Toolbox.stamp(),
}

VBW.event.trigger("player", "fall", evt);

// 玩家监听
VBW.event.on("player", "fall", (ev) => {
    if (env.lock) return false;
    env.lock = true;

    const cfg = {
        height: ev.fall,
        convert: self.getConvert()
    };

    VBW.effects.get("camera", "fall", cfg, () => {
        env.lock = false;
    });
});
```

### 2. 玩家死亡
```javascript
// 玩家掉落高度超过阈值时触发
VBW.event.trigger("player", "death", {
    from: { ... },
    fall: fall_height,
    stamp: Toolbox.stamp(),
});

// 玩家监听
VBW.event.on("player", "death", (ev) => {
    env.lock = true;
    const cfg = {
        height: ev.fall,
        convert: self.getConvert(),
        skip: true
    };

    VBW.effects.get("camera", "fall", cfg, () => {
        UI.show("countdown", 10, {
            callback: () => {
                env.lock = false;
            }
        });
    });
});
```

## 阻拦体事件

### 1. 站在阻拦体
```javascript
// 玩家站在阻拦体上时触发
const target = {
    stamp: Toolbox.stamp(),
    adjunct: orgin.adjunct,
    index: orgin.index,
    world: player.location.world,
    x: player.location.block[0],
    y: player.location.block[1],
}

VBW.event.trigger("stop", "on", { stamp: Toolbox.stamp() }, target);
```

### 2. 离开阻拦体
```javascript
// 玩家离开阻拦体时触发
VBW.event.trigger("stop", "leave", {
    stamp: Toolbox.stamp()
}, target);

// 更新玩家状态
location.stop.on = false;
location.stop.adjunct = "";
location.stop.index = 0;
location.position[2] = 0;
```

### 3. 在阻拦体旁
```javascript
// 玩家移动被阻拦体阻挡时触发
VBW.event.trigger("stop", "beside", { stamp: Toolbox.stamp() }, check.orgin);
```

## 模块事件

### 1. 模型解析完成
```javascript
// 3D模型解析完成后触发
const ev = { id: id, stamp: Toolbox.stamp() };
VBW.event.trigger("module", "parsed", ev);

// 替换占位Mesh
VBW.event.on("module", "parsed", self.replaceFun(target), target);

const self.replaceFun = (target) => {
    return ((adj) => {
        return (ev) => {
            if (adj.module !== ev.id) return false;

            const chain = ["resource", "module", ev.id, "three"];
            const obj = VBW.cache.get(chain);

            // 获取占位Mesh并替换
            const md = self.getMeshFromModule(obj, mesh);
            scene.add(md);
            scene.remove(mesh);

            if (mesh.material.map) {
                mesh.material.map.dispose();
            }
            mesh.geometry.dispose();
            mesh.material.dispose();
        };
    })(target);
}
```

## 事件配置

### 1. 事件配置
```javascript
const config = {
    hold: {
        block: 20000,      // Block停留阈值
        trigger: 5000,     // 触发器停留阈值
    },
    beside: {
        stop: 0.5,         // 阻拦体旁距离
        block: 1,           // Block旁距离
        trigger: 1,         // 触发器旁距离
    },
}
```

### 2. 持有检测时间
```javascript
// 触发器hold事件阈值
const config = {
    hold: 3000,  // 3秒
}

if (delta > config.hold) {
    // 触发hold事件
    VBW.event.trigger("trigger", "hold", evt, target);
    env.trigger.hold = true;
}
```

## 运行时环境

```javascript
const runtime = {
    player: null,        // 玩家数据
    active: null,        // 活动实例
    block: null,         // Block数据
    trigger: null,       // 当前触发器
    stop: null,          // 当前阻拦体
    system: {
        init: false,      // 系统初始化状态
    },
}
```

## 事件启动

### 1. 启动事件系统
```javascript
VBW.event.start = (world, dom_id) => {
    // 1. 设置帧同步函数
    const frame_chain = ["block", dom_id, world, "loop"];
    const queue = VBW.cache.get(frame_chain);
    queue.push({ name: "event_checker", fun: self.checker });

    // 2. 获取环境用于检测
    if (runtime.player === null) {
        runtime.player = VBW.cache.get(["env", "player"]);
    }

    if (runtime.active === null) {
        runtime.active = VBW.cache.get(["active"]);
    }
}
```

### 2. 事件检查器
```javascript
self.checker = () => {
    // 1. 检测玩家位置
    // 2. 检测触发器事件
    // 3. 检测阻拦体事件
}
```

## 事件监听示例

### 1. 监听Block事件
```javascript
// 进入Block
VBW.event.on("block", "in", (ev) => {
    console.log("Entered block", ev);
}, { x: 2025, y: 619, world: 0, adjunct: "block", index: 0 });

// 离开Block
VBW.event.on("block", "out", (ev) => {
    console.log("Left block", ev);
}, { x: 2025, y: 619, world: 0, adjunct: "block", index: 0 });
```

### 2. 监听触发器事件
```javascript
const target = {
    x: 2025,
    y: 619,
    world: 0,
    index: 0,
    adjunct: "trigger"
}

VBW.event.on("trigger", "in", (ev) => {
    console.log("Entered trigger", ev);
}, target);

VBW.event.on("trigger", "hold", (ev) => {
    console.log("Holding in trigger", ev);
}, target);

VBW.event.on("trigger", "out", (ev) => {
    console.log("Left trigger", ev);
}, target);
```

### 3. 监听玩家事件
```javascript
VBW.event.on("player", "fall", (ev) => {
    console.log("Player fall", ev.fall);
});

VBW.event.on("player", "death", (ev) => {
    console.log("Player death", ev.fall);
});
```

### 4. 监听附属物事件
```javascript
const target = {
    x: 2025,
    y: 619,
    world: 0,
    index: 0,
    adjunct: "box"
}

VBW.event.on("box", "touch", (ev) => {
    console.log("Touched box", ev);
}, target);

VBW.event.on("box", "in", (ev) => {
    console.log("Entered box range", ev);
}, target);

VBW.event.on("box", "out", (ev) => {
    console.log("Left box range", ev);
}, target);
```

## 事件清理

### 1. 移除事件绑定
```javascript
// 解绑特定事件
const name = VBW.event.on(cat, event, fun, obj);
// 使用后
VBW.event.off(cat, event, obj);

// 重新绑定
VBW.event.on(cat, event, newFun, obj);
```

### 2. 清空事件类型
```javascript
// 清空某个类型的所有绑定
delete events[cat][event];
```

## 事件优先级

### 1. 事件执行顺序
```javascript
// 事件触发时按照绑定顺序执行
const handlers = events[cat][event];

for (const name in handlers) {
    handlers[name](param);
}
```

### 2. 对象级事件优先级
```javascript
// 对象级事件优先于全局事件
if (obj !== undefined) {
    const targetName = self.getNameByObj(obj);
    // 只执行匹配对象的事件
    for (const name in handlers) {
        if (name === targetName) {
            handlers[name](param);
        }
    }
} else {
    // 执行所有全局事件
    for (const name in handlers) {
        handlers[name](param);
    }
}
```

## 性能优化

### 1. 事件缓存
```javascript
// 缓存事件处理器
const eventCache = {
    [cat]: {
        [event]: {
            [name]: handler
        }
    }
}
```

### 2. 按需监听
```javascript
// 只在需要时监听
let listening = false;

const startListen = () => {
    if (!listening) {
        VBW.event.on(cat, event, handler, obj);
        listening = true;
    }
}

const stopListen = () => {
    if (listening) {
        VBW.event.off(cat, event, obj);
        listening = false;
    }
}
```

### 3. 批量触发
```javascript
// 批量触发事件减少函数调用
const eventsToTrigger = [
    { cat, event, param },
    { cat, event, param },
];

for (const evt of eventsToTrigger) {
    VBW.event.trigger(evt.cat, evt.event, evt.param);
}
```
