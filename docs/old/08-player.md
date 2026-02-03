# 玩家与运动系统

## 概述

玩家系统（Player System）管理玩家在Septopus World中的位置、状态和能力，运动系统（Movement System）提供运动计算。

## 玩家数据结构

```javascript
const player = {
    location: {
        block: [x, y],            // 当前Block坐标
        position: [x, y, z],       // 相对Block内的位置（米）
        rotation: [x, y, z],       // 玩家朝向（弧度）
        world: 0,                 // 世界索引
        extend: 2,                 // 加载扩展范围
        stop: {
            on: false,             // 是否站在阻拦体上
            adjunct: "",           // 阻拦体名称
            index: 0,               // 阻拦体索引
        }
    },
    address: "",                   // 玩家钱包地址
    body: {
        height: 1.7,             // 玩家身高（米）
        shoulder: 0.5,           // 肩部高度
        chest: 0.22,             // 胸部高度
        section: [0.3, 0.4, 0.2, 0.8],  // 身体分段
        head: [0.25, 0.05],       // 头部尺寸
        hand: [0.2, 0.2, 0.1],  // 手部尺寸
        leg: [0.5, 0.5, 0.1],    // 腿部尺寸
    },
    capacity: {
        move: 0.02,               // 移动速度（米/帧）
        rotate: 0.05,             // 旋转速度（弧度/帧）
        span: 0.31,               // 最大行走高度（米）
        squat: 0.1,               // 蹲下高度（米）
        jump: 1,                  // 最大跳跃高度（米）
        death: 4,                  // 死亡掉落高度（米）
        speed: 1.5,               // 移动速度（米/秒）
        strength: 1,               // 力量
    },
    bag: {                        // 背包
        max: 100,
    },
    avatar: {                     // 头像
        max: 2097152,
        scale: [2, 2, 2],
    },
}
```

## 能力参数

```javascript
const capacity = {
    move: 0.02,           // 移动速度：每帧移动0.02米（60fps下1.2米/秒）
    rotate: 0.05,         // 旋转速度：每帧旋转0.05弧度
    span: 0.31,           // 最大行走高度：0.31米，可以跨过这个高度
    squat: 0.1,           // 蹲下高度：0.1米
    jump: 1,              // 最大跳跃高度：1米
    death: 4,              // 死亡掉落高度：4米以上死亡
    speed: 1.5,           // 移动速度：1.5米/秒
    strength: 1,           // 力量：暂未使用
}
```

## 身体计算

### 1. 身体高度计算
```javascript
self.getHeight = (section) => {
    let h = 0;
    for (let i = 0; i < section.length; i++) {
        h += parseFloat(section[i]);
    }
    return h;
}

// 使用示例
const height = self.getHeight(player.body.section);
player.body.height = height;
```

### 2. 身体能力计算
```javascript
self.calcCapacity = (body) => {
    // 根据身体参数计算能力
    // TODO: 实现能力计算
}
```

## 玩家初始化

### 1. 启动玩家
```javascript
VBW.player.start = (dom_id, ck) => {
    // 1. 获取玩家位置
    const data = self.getPlayerLocation();

    if (env.player === null) {
        env.player = VBW.cache.get(["env", "player"]);
    }

    // 2. 设置自动更新和摄像机同步
    const world = data.world;
    const chain = ["block", dom_id, world, "loop"];
    if (!VBW.cache.exsist(chain)) {
        VBW.cache.set(chain, []);
    }
    const queue = VBW.cache.get(chain);
    queue.push({ name: "player", fun: self.auto });

    // 3. 设置摄像机
    if (env.camera[dom_id] === undefined) {
        const camera = VBW.cache.get(["active", "containers", dom_id, "camera"]);
        const scene = VBW.cache.get(["active", "containers", dom_id, "scene"]);
        env.camera[dom_id] = camera;
        VBW.effects.set(camera, scene);
    }

    // 4. 玩家事件
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

    return ck && ck(data);
}
```

### 2. 获取玩家位置
```javascript
self.getPlayerLocation = () => {
    const key = config.autosave.key;
    const pp = localStorage.getItem(key);

    if (pp === null) {
        return { world: config.defaultWorld };
    } else {
        try {
            const data = JSON.parse(pp);
            return data;
        } catch (error) {
            localStorage.removeItem(key);
            return { world: config.defaultWorld };
        }
    }
}
```

### 3. 格式化玩家数据
```javascript
VBW.player.format = (local, basic) => {
    // 1. 设置基本位置
    if (local.block === undefined) {
        env.player.location = basic.start;
    } else {
        env.player.location = basic.start;
    }

    // 2. 计算能力
    env.player.body = basic.body;
    env.player.body.height = self.getHeight(basic.body.section);
    self.calcCapacity(env.player.body);

    return env.player.location;
}
```

### 4. 初始化玩家位置
```javascript
VBW.player.initial = (local, dom_id) => {
    const side = self.getSide();
    const cvt = self.getConvert();
    const [x, y] = local.block;

    // 1. 设置玩家位置
    const pos = [
        env.camera[dom_id].position.x + (x - 1) * side[0] + local.position[0] * cvt,
        env.camera[dom_id].position.y + (y - 1) * side[1] + local.position[1] * cvt,
        local.position[2] * cvt + env.player.body.height * cvt
    ];

    env.camera[dom_id].position.set(pos[0], pos[2], -pos[1]);

    env.camera[dom_id].rotation.set(
        local.rotation[0],
        -local.rotation[2],
        local.rotation[1]
    );

    // 2. 重置玩家站立高度
    const target = {
        x: x,
        y: y,
        world: local.world,
        index: 0,
        adjunct: "block"
    };

    VBW.event.on("block", "loaded", (ev) => {
        const va = VBW.cache.get(["block", dom_id, ev.world, `${ev.x}_${ev.y}`, "raw", "data", 0]);
        self.syncCameraPosition([0, 0, va * cvt], true);
        VBW.event.off("block", "loaded", target);
    }, target);
}
```

## 玩家更新

### 1. 玩家同步更新
```javascript
VBW.player.update = (diff, check) => {
    if (env.lock) return false;

    // 1. 跨越处理
    if (check && check.cross) {
        self.prepareBlocks(check.block);
    }

    // 2.1 更新旋转
    if (diff.rotation) {
        self.syncCameraRotation(diff.rotation);
        self.updateRotation(diff.rotation);
    }

    // 2.2 更新XY位置
    if (diff.position) {
        const pos = [diff.position[0], diff.position[1], 0];
        self.syncCameraPosition(pos);
        self.updatePosition(pos, check.block === undefined ? false : check.block);
    }

    // 2.3 更新Z位置
    if (check && (check.delta || check.elevation || check.orgin === null)) {
        const pos = [0, 0, check.delta];
        self.updatePosition(pos);
        self.checkFall(check.delta, check.elevation, check.orgin);
    }

    // 3. 玩家状态更新
    if (diff.position) {
        self.updateStopStatus(!check.orgin ? null : check.orgin);
    }
}
```

### 2. 摄像机位置同步
```javascript
self.syncCameraPosition = (pos) => {
    for (let dom_id in env.camera) {
        const cam = env.camera[dom_id];
        cam.position.set(
            cam.position.x + pos[0],
            cam.position.y + pos[2],
            cam.position.z - pos[1]
        );
    }
}
```

### 3. 摄像机旋转同步
```javascript
self.syncCameraRotation = (ro) => {
    for (let dom_id in env.camera) {
        const cam = env.camera[dom_id];
        cam.rotation.set(
            cam.rotation.x + ro[0],
            cam.rotation.y - ro[2],
            cam.rotation.z + ro[1]
        );
    }
}
```

### 4. 更新旋转
```javascript
self.updateRotation = (ro) => {
    const player = env.player;
    player.location.rotation[0] += ro[0];
    player.location.rotation[1] += ro[1];
    player.location.rotation[2] += ro[2];

    // 更新指南针
    const ak = player.location.rotation[2];
    Actions.common.compass(ak);
}
```

### 5. 更新位置
```javascript
self.updatePosition = (pos, block) => {
    const player = env.player;
    const cvt = self.getConvert();

    if (!block) {
        // 相对位置更新
        player.location.position[0] += pos[0] / cvt;
        player.location.position[1] += pos[1] / cvt;
        player.location.position[2] += pos[2] / cvt;
    } else {
        // Block内位置更新（模运算）
        const side = self.getSide();
        const sx = side[0] / cvt;
        const sy = side[1] / cvt;
        const px = player.location.position[0] + pos[0] / cvt;
        const py = player.location.position[1] + pos[1] / cvt;

        player.location.position[0] = px > 0 ? px % sx : px + sx;
        player.location.position[1] = py > 0 ? py % sy : py + sy;
        player.location.position[2] += pos[2] / cvt;
        player.location.block = [block[0], block[1]];
    }
}
```

## Block跨越

### 1. 准备Blocks
```javascript
self.prepareBlocks = (to) => {
    const player = env.player;
    const from = player.location.block;
    const ext = player.location.extend;
    const world = player.location.world;
    const dom_id = VBW.cache.get(["active", "current"]);

    const change = Calc.cross(from, to, ext);
    const tasks = VBW.cache.get(["task", dom_id, world]);

    // 添加加载任务
    if (change.load.length !== 0) {
        for (let i = 0; i < change.load.length; i++) {
            const bk = change.load[i];
            tasks.push({ block: bk, action: "load" });
        }
    }

    // 添加卸载任务
    if (change.destroy.length !== 0) {
        for (let i = 0; i < change.destroy.length; i++) {
            const bk = change.destroy[i];
            tasks.push({ block: bk, action: "unload" });
        }
    }

    VBW.event.trigger("block", "in", { stamp: Toolbox.stamp() }, {
        x: to[0],
        y: to[1],
        world: world,
        adjunct: "block",
        index: 0
    });

    VBW.event.trigger("block", "out", { stamp: Toolbox.stamp() }, {
        x: from[0],
        y: from[1],
        world: world,
        adjunct: "block",
        index: 0
    });

    VBW.update(dom_id, world, (done) => {
        VBW.event.trigger("system", "update", {
            stamp: Toolbox.stamp(),
            container: dom_id,
            world: world
        });
    });
}
```

## 阻拦体交互

### 1. 更新阻拦状态
```javascript
self.updateStopStatus = (orgin) => {
    const { location } = env.player;

    if (orgin === null) {
        // 离开阻拦体
        if (location.stop.on) {
            const target = {
                stamp: Toolbox.stamp(),
                adjunct: location.stop.adjunct,
                index: location.stop.index,
                world: location.world,
                x: location.block[0],
                y: location.block[1],
            };

            VBW.event.trigger("stop", "leave", { stamp: Toolbox.stamp() }, target);

            location.stop.on = false;
            location.stop.adjunct = "";
            location.stop.index = 0;
            location.position[2] = 0;
        }
    } else {
        // 进入阻拦体或切换
        if (!location.stop.on) {
            VBW.player.stand(orgin);
        } else {
            if (location.stop.adjunct === orgin.adjunct &&
                location.stop.index === orgin.index) {
                // 同一阻拦体，不做处理
            } else {
                VBW.player.stand(orgin);
            }
        }
    }
}
```

### 2. 站在阻拦体
```javascript
VBW.player.stand = (orgin) => {
    const player = env.player;

    // 1. 位置更新
    player.location.stop.on = true;
    player.location.stop.adjunct = orgin.adjunct;
    player.location.stop.index = orgin.index;

    self.saveLocation();

    // 2. 事件触发
    const target = {
        stamp: Toolbox.stamp(),
        adjunct: orgin.adjunct,
        index: orgin.index,
        world: player.location.world,
        x: player.location.block[0],
        y: player.location.block[1],
    };

    VBW.event.trigger("stop", "on", { stamp: Toolbox.stamp() }, target);

    return true;
}
```

## 掉落检测

### 1. 检查掉落
```javascript
self.checkFall = (delta, elevation, orgin) => {
    const location = env.player.location;
    const cvt = self.getConvert();

    let height = 0;

    // 计算掉落高度
    if (location.stop.on && orgin === null) {
        const now = location.position[2] * cvt;
        if (elevation) {
            height = elevation - now;
        } else {
            height = -now;
        }
    } else {
        if (delta === 0 && elevation === 0) return false;

        if (elevation) {
            height = delta + elevation;
        } else {
            height = delta;
        }
    }

    if (height === 0) return false;

    const fall = -height / cvt;
    const target = {
        stamp: Toolbox.stamp(),
        world: location.world,
        x: location.block[0],
        y: location.block[1],
        adjunct: location.stop.adjunct,
        index: location.stop.index,
        fall: fall,
    };

    // 掉落高度判断
    if (fall >= capacity.death) {
        // 玩家死亡
        const evt = {
            from: target,
            fall: fall,
            stamp: Toolbox.stamp(),
        };
        VBW.event.trigger("player", "death", evt);
    } else if (fall >= capacity.span) {
        // 玩家正常掉落
        const evt = {
            from: target,
            fall: fall,
            stamp: Toolbox.stamp(),
        };
        VBW.event.trigger("player", "fall", evt);
    } else {
        // 小幅度掉落，同步摄像机
        self.syncCameraPosition([0, 0, height]);
    }
}
```

## 传送

### 1. 玩家传送
```javascript
VBW.player.teleport = (x, y, world, pos) => {
    env.player.location.world = world;
    env.player.location.block = [x, y];
    env.player.location.position = pos;

    const side = self.getSide();
    const cvt = self.getConvert();

    // 坐标转换：Septopus → Three.js
    const npos = [
        (x - 1) * side[0] + pos[0] * cvt,
        pos[2],
        -((y - 1) * side[1] + pos[1] * cvt),
    ];

    // 同步所有摄像机
    for (let kk in env.camera) {
        const cam = env.camera[kk];
        cam.position.set(npos[0], npos[1], npos[2]);
    }

    return true;
}
```

## 自动保存

### 1. 自动保存
```javascript
self.auto = () => {
    if (env.clean) return false;

    if (env.count > config.autosave.interval) {
        env.count = 0;
        self.saveLocation();
        self.statusUI();
    } else {
        env.count++;
    }
}
```

### 2. 保存位置
```javascript
self.saveLocation = () => {
    const data = Toolbox.clone(env.player.location);
    const fun = Toolbox.toF;

    // 转换坐标值
    for (let i = 0; i < data.position.length; i++) {
        data.position[i] = fun(data.position[i]);
    }

    for (let i = 0; i < data.rotation.length; i++) {
        data.rotation[i] = fun(data.rotation[i], 6);
    }

    // 保存到localStorage
    localStorage.setItem(config.autosave.key, JSON.stringify(data));
}
```

### 3. 状态UI
```javascript
self.statusUI = () => {
    // 1. 显示Block信息并绑定状态点击
    const cfg_status = {
        events: {
            click: (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                console.log(`Status clicked.`);
                Pages.map();
            },
        }
    };
    UI.show("status", JSON.stringify(env.player.location.block), cfg_status);
}
```

### 4. 清理玩家数据
```javascript
VBW.player.clean = () => {
    env.clean = true;

    setTimeout(() => {
        localStorage.removeItem(config.autosave.key);
    }, 50);
}
```

## 运动计算

### 1. 身体运动
```javascript
vbw_movement.body = {
    forward: (diff, ak) => {
        return {
            position: [
                -diff[0] * Math.sin(ak),
                diff[0] * Math.cos(ak),
                0
            ]
        }
    },
    backward: (diff, ak) => {
        return {
            position: [
                diff[0] * Math.sin(ak),
                -diff[0] * Math.cos(ak),
                0
            ]
        }
    },
    leftward: (diff, ak) => {
        return {
            position: [
                -diff[0] * Math.cos(ak),
                -diff[0] * Math.sin(ak),
                0
            ]
        }
    },
    rightward: (diff, ak) => {
        return {
            position: [
                diff[0] * Math.cos(ak),
                diff[0] * Math.sin(ak),
                0
            ]
        }
    },
    rise: (diff, ak) => {
        return { position: [0, 0, diff[0]] }
    },
    fall: (diff, ak) => {
        return { position: [0, 0, -diff[0]] }
    },
    jump: (diff, ak) => {
        // TODO: 实现跳跃
    },
    squat: (diff, ak) => {
        // TODO: 实现蹲下
    },
}
```

### 2. 头部运动
```javascript
vbw_movement.head = {
    up: (diff, ak) => {
        const bk = diff[1] * 0.2;
        const EPS = 1e-4;
        const maxPitch = Math.PI / 2 - EPS;
        const rx = Math.max(-maxPitch, Math.min(maxPitch, bk));
        return { rotation: [rx, 0, 0], order: "ZYX" };
    },
    down: (diff, ak) => {
        const bk = diff[1] * 0.2;
        const EPS = 1e-4;
        const maxPitch = Math.PI / 2 - EPS;
        const rx = Math.max(-maxPitch, Math.min(maxPitch, bk));
        return { rotation: [-rx, 0, 0], order: "ZYX" };
    },
    left: (diff, ak) => {
        return { rotation: [0, 0, -diff[1]] };
    },
    right: (diff, ak) => {
        return { rotation: [0, 0, diff[1]] };
    },
}
```

## 玩家任务

```javascript
const task = {
    fly: () => {
        // TODO: 实现飞行
    },
    fix: () => {
        // TODO: 实现修复
    },
    body: () => {
        // TODO: 实现身体控制
    },
    capacity: () => {
        // TODO: 实现能力调整
    },
    dance: (ev) => {
        // 跳舞任务示例
    },
    router: [
        { method: "fly", gameonly: true },
        { method: "capacity", gameonly: true },
        { method: "body", gameonly: true },
        { method: "dance", gameonly: true },
    ],
}
```

## 配置

```javascript
const config = {
    autosave: {
        interval: 60,        // 自动保存间隔（帧数）
        key: "vbw_player",   // LocalStorage键名
    },
    defaultWorld: 0,         // 默认世界索引
    hold: 3000,             // 持有检测时间
}
```

## 辅助函数

### 1. 获取转换系数
```javascript
self.getConvert = () => {
    return VBW.cache.get(["env", "world", "accuracy"]);
}
```

### 2. 获取Block尺寸
```javascript
self.getSide = () => {
    return VBW.cache.get(["env", "world", "side"]);
}
```

### 3. 获取标高
```javascript
// 从Block缓存获取
const chain = ["block", dom_id, world, `${x}_${y}`, "elevation"];
const elevation = VBW.cache.get(chain);
```
