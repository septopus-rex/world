# 控制系统

## 概述

Septopus World支持多种控制模式：第一人称（FPV）、2D控制和观察模式，分别适配不同设备和用户场景。

## 控制器类型

```javascript
const controllers = {
    control_fpv: "con_first",    // 第一人称控制器
    control_2d: "con_2d",      // 2D控制器
    control_observe: "con_observe" // 观察控制器
}
```

## FPV控制器

### 1. 控制器结构
```javascript
const controller = {
    hooks: { reg: () => reg },
    construct: () => {},           // 构建控制器DOM
    start: (dom_id) => {},       // 启动控制器
}
```

### 2. 键盘映射
```javascript
const config = {
    code: {
        FORWARD: 87,        // W - 前进
        BACKWARD: 83,       // S - 后退
        LEFT: 65,           // A - 向左
        RIGHT: 68,          // D - 向右
        BODY_RISE: 82,      // R - 身体上升
        BODY_FALL: 70,      // F - 身体下降
        HEAD_LEFT: 37,      // 左箭头 - 头向左
        HEAD_RIGHT: 39,     // 右箭头 - 头向右
        HEAD_RISE: 38,      // 上箭头 - 头向上
        HEAD_DOWN: 40,      // 下箭头 - 头向下
        JUMP: 32,           // 空格 - 跳跃
        SQUAT: 17,          // Ctrl - 蹲下
    },
    queue: "keyboard",     // 动作队列名称
    move: {
        distance: 100,      // 移动距离
        angle: Math.PI * 0.01,  // 旋转角度
    },
}
```

### 3. 运行时环境
```javascript
const runtime = {
    player: null,        // 玩家数据
    camera: null,        // 摄像机对象
    scene: null,         // 场景对象
    actions: null,       // 按下的键队列
    side: null,          // Block尺寸
    container: null,     // DOM ID
    world: null,         // 世界索引
    raycaster: null,     // 射线检测器
    selected: null,      // 选中的对象
    convert: null,       // 坐标转换系数
    active: null,
    def: null,
}
```

### 4. 初始化代码映射
```javascript
const initCode = () => {
    const body = VBW.movement.body;
    const head = VBW.movement.head;
    env.todo = {
        FORWARD: body.forward,
        BACKWARD: body.backward,
        LEFT: body.leftward,
        RIGHT: body.rightward,
        BODY_RISE: body.rise,
        BODY_FALL: body.fall,
        JUMP: body.jump,
        SQUAT: body.squat,
        HEAD_LEFT: head.left,
        HEAD_RIGHT: head.right,
        HEAD_RISE: head.up,
        HEAD_DOWN: head.down,
    }
}
```

## 键盘控制

### 1. 键盘事件监听
```javascript
self.keyboard = () => {
    // 按键按下：插入动作
    self.bind('keydown', (ev) => {
        const code = ev.which;
        if (config.keyboard[code]) {
            UI.hide(["pop", "sidebar"]);  // 隐藏菜单
            VBW.queue.insert(config.queue, config.keyboard[code]);
        }
    });

    // 按键抬起：移除动作
    self.bind('keyup', (ev) => {
        const code = ev.which;
        if (config.keyboard[code]) {
            VBW.queue.remove(config.queue, config.keyboard[code]);
        }
    });
}
```

## 触摸控制

### 1. 触摸事件
```javascript
self.touch = (dom_id) => {
    const id = `#${dom_id} canvas`;

    // 触摸开始
    Touch.on(id, "touchStart", (point) => {
        env.screen.touch = point;
        VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_LEFT]);
        VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
    });

    // 触摸移动（头部旋转）
    Touch.on(id, "touchMove", (point, distance) => {
        const dx = point[0] - env.screen.touch[0];
        env.screen.distance = distance;
        const qu = config.queue;
        const left = config.keyboard[config.code.HEAD_LEFT];
        const right = config.keyboard[config.code.HEAD_RIGHT];

        if (dx > 0) {  // 向右滑
            VBW.queue.insert(qu, left);
            VBW.queue.remove(qu, right);
        } else {          // 向左滑
            VBW.queue.insert(qu, right);
            VBW.queue.remove(qu, left);
        }
        env.screen.touch = point;
    });

    // 触摸结束
    Touch.on(id, "touchEnd", () => {
        env.screen.touch = null;
        env.screen.distance = 0;
        VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_LEFT]);
        VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
    });
}
```

## 运动检测

### 1. 阻拦检测
```javascript
self.checkStop = (delta) => {
    const cvt = runtime.convert;
    const side = runtime.side;
    const player = runtime.player;
    const { body, capacity } = player;
    const [x, y] = player.location.block;

    // 计算新位置
    const nx = player.location.position[0] * cvt + delta[0];
    const ny = player.location.position[1] * cvt + delta[1];
    const nz = player.location.position[2] * cvt + delta[2];

    // 计算新Block坐标
    const bx = x + Math.floor(nx / side[0]);
    const by = y + Math.floor(ny / side[1]);

    const va = self.getElevation(x, y);
    const stand = va + player.location.position[2] * cvt;
    let cross = false;

    // 1. Block跨越检测
    if (bx !== x || by !== y) {
        cross = true;
        const vb = self.getElevation(bx, by);

        // 1.1 检测Block高度阻挡
        if (vb - stand > capacity.span * cvt) {
            return { move: false, block: [bx, by] };
        }
    }

    // 2. 检测阻拦体阻挡
    const pos = cross ? [
        nx < 0 ? nx + side[0] : nx % side[0],
        ny < 0 ? ny + side[0] : ny % side[1],
        nz
    ] : [nx, ny, nz];

    const stops = self.getStops([[bx, by]], side);

    const cfg = {
        cap: capacity.span * cvt,
        height: body.height * cvt,
        elevation: va,
        cross: cross,
    };

    if (cross) cfg.next = self.getElevation(bx, by);

    const result = Calc.check(pos, stops, cfg);
    if (cross) result.block = [bx, by];

    return result;
}
```

### 2. 触发器检测
```javascript
self.checkTrigger = () => {
    // 只在游戏模式下检测
    if (runtime.active.mode !== runtime.def.MODE_GAME) return false;

    // 1. 获取触发器列表
    const arr = self.getTriggers();
    if (arr.error || arr.length === 0) return false;

    // 2. 准备检测参数
    const cvt = runtime.convert;
    const player = runtime.player;
    const nx = player.location.position[0] * cvt;
    const ny = player.location.position[1] * cvt;
    const nz = player.location.position[2] * cvt;
    const pos = [nx, ny, nz];

    const orgin = Calc.inside(pos, arr, player.body.height * cvt);
    const [x, y] = player.location.block;
    const world = player.location.world;

    if (env.trigger === null) {
        if (orgin !== false) {
            // 进入触发器范围
            const target = {
                x: x, y: y, world: world,
                index: orgin.index,
                adjunct: orgin.adjunct,
                start: Toolbox.stamp(),
                hold: false,
                container: runtime.container,
            };

            env.trigger = target;
            const evt = Toolbox.clone(target);
            evt.stamp = Toolbox.stamp();
            VBW.event.trigger("trigger", "in", evt, Toolbox.clone(target));
        }
    } else {
        // 2. 检测hold事件
        if (env.trigger.hold === false) {
            const delta = Toolbox.stamp() - env.trigger.start;
            if (delta > config.hold) {
                const evt = Toolbox.clone(env.trigger);
                evt.stamp = Toolbox.stamp();
                VBW.event.trigger("trigger", "hold", evt, Toolbox.clone(env.trigger));
                env.trigger.hold = true;
            }
        }

        // 3. 检测离开事件
        if (orgin === false) {
            const evt = Toolbox.clone(env.trigger);
            evt.stamp = Toolbox.stamp();
            VBW.event.trigger("trigger", "out", evt, Toolbox.clone(env.trigger));
            env.trigger = null;
        }
    }
}
```

## 射线检测

### 1. 选择对象
```javascript
self.select = (ev) => {
    if (runtime.scene === null) return false;

    // 1. 获取射线检测器
    if (runtime.raycaster === null) {
        runtime.raycaster = ThreeObject.get("basic", "raycast", {});
    }
    const raycaster = runtime.raycaster;

    const dv = VBW.cache.get(["block", runtime.container, "basic"]);
    const { width, height } = dv;
    raycaster.mouse.x = (ev.clientX / width) * 2 - 1;
    raycaster.mouse.y = -(ev.clientY / height) * 2 + 1;
    raycaster.checker.setFromCamera(raycaster.mouse, runtime.camera);

    const objs = runtime.scene.children;
    const selected = runtime.raycaster.checker.intersectObjects(objs);

    // 2. 过滤最近的
    if (selected.length > 0) {
        const [x, y] = runtime.player.location.block;
        const target = self.getSelection(selected, x, y, runtime.side);
        return target;
    }
}
```

### 2. 过滤选中对象
```javascript
self.getSelection = (objs, x, y, side) => {
    const selected = {
        adjunct: "",
        index: 0,
        face: "y",
    };
    const arr = [];

    for (let i = 0; i < objs.length; i++) {
        const row = objs[i];
        if (row.distance > side[0]) continue;  // 忽略其他Block的对象
        if (!row.object ||
            !row.object.userData ||
            !row.object.userData.x ||
            !row.object.userData.y ||
            !row.object.userData.name ||
            row.object.userData.x !== x ||
            row.object.userData.y !== y) continue;  // 忽略系统对象

        const tmp = row.object.userData.name.split("_");
        if (tmp.length > 1) continue;  // 忽略辅助对象
        arr.push(row);
    }

    if (arr.length === 0) return selected;
    const single = self.getSingle(arr);
    selected.adjunct = single.name;
    selected.index = single.index;
    return selected;
}
```

## 编辑模式控制

### 1. 编辑模式交互
```javascript
self.edit = (dom_id) => {
    const el = document.getElementById(dom_id);
    if (!el) return false;

    el.addEventListener('click', (ev) => {
        // 1. 检测选中
        const mouse = self.getClickPosition(ev);
        const mode = VBW.cache.get(["active", "mode"]);
        const def = VBW.cache.get(["def", "common"]);

        if (mode === def.MODE_EDIT) {
            // 1.1 射线检测选中对象
            const target = self.select(ev);
            const world = runtime.player.location.world;

            // 1.2 设置选中状态
            const editing = self.getEditActive();
            const [x, y] = runtime.player.location.block;
            if (!target.adjunct) {
                target.adjunct = "block";  // 默认为Block
            } else {
                editing.selected.adjunct = target.adjunct;
                editing.selected.index = target.index;
                editing.selected.face = "x";
            }

            // 1.3 显示弹出菜单
            const std = self.getSTD(x, y, target.adjunct, target.index);
            const pop = VBW[target.adjunct].menu.pop(std);
            UI.show("pop", pop, { offset: mouse });

            // 1.4 显示侧边栏菜单
            const groups = VBW[target.adjunct].menu.sidebar(std);
            const cfg_side = {
                title: `${target.adjunct}-${target.index} Modification`,
                prefix: "sd",
                convert: runtime.convert,
                events: {
                    change: (obj) => {
                        obj.index = target.index;
                        const task = {
                            x: x, y: y,
                            adjunct: target.adjunct,
                            action: "set",
                            param: obj
                        };
                        const queue = VBW.cache.get(["task", runtime.container, world]);
                        queue.push(task);

                        VBW.update(runtime.container, world, (done) => {
                            const ev = {
                                stamp: Toolbox.stamp(),
                                container: runtime.container,
                                world: world
                            };
                            VBW.event.trigger("system", "update", ev);
                        });

                        const range = { x, y, world, container: runtime.container };
                        VBW.prepair(range, (pre) => {
                            VBW[config.render].show(runtime.container, [x, y, world]);
                        });
                    },
                }
            };
            const sidebar = self.formatGroups(groups);
            UI.show("sidebar", sidebar, cfg_side);
        }
    });
}
```

### 2. 格式化菜单组
```javascript
self.formatGroups = (groups) => {
    const ss = [];
    for (let title in groups) {
        const gp = groups[title];
        const group = {
            title: title.toUpperCase(),
            col: 12,
            row: 12,
            inputs: gp,
        };
        ss.push(group);
    }
    return ss;
}
```

## 帧同步动作

### 1. 动作执行
```javascript
self.action = () => {
    const dis = [config.move.distance, self.getAngle(config.move.angle)];
    const ak = runtime.camera.rotation.y;

    // 1. 处理键盘输入
    for (let i = 0; i < runtime.actions.length; i++) {
        const act = runtime.actions[i];
        if (!env.todo[act]) continue;

        const diff = env.todo[act](dis, ak);

        // 2. 如果没有位置变化，只同步旋转
        if (!diff.position) {
            VBW.player.update(diff, {});
            continue;
        }

        // 3. 检测移动
        if (diff.position) {
            const check = self.checkStop(diff.position);

            // 3.1 被阻挡，停止移动
            if (!check.move) {
                if (!check.block) {
                    VBW.event.trigger("stop", "beside", { stamp: Toolbox.stamp() }, check.orgin);
                } else {
                    VBW.event.trigger("block", "stop", { stamp: Toolbox.stamp() }, check.block);
                }
                continue;
            }

            // 3.2 移动动作更新到玩家
            VBW.player.update(diff, check);
        }
    }

    self.checkTrigger();
}
```

### 2. 角度计算
```javascript
self.getAngle = (ak) => {
    if (env.mobile) {
        const rate = env.screen.distance / env.screen.width;
        return Math.PI * 0.5 * rate;
    } else {
        return ak;
    }
}
```

## 获取辅助数据

### 1. 获取编辑激活状态
```javascript
self.getEditActive = () => {
    const world = runtime.player.location.world;
    return VBW.cache.get(["block", runtime.container, world, "edit"]);
}
```

### 2. 获取STD数据
```javascript
self.getSTD = (x, y, adjunct, index) => {
    const world = runtime.player.location.world;
    const chain = ["block", runtime.container, world, `${x}_${y}`, 'std', adjunct, index === undefined ? 0 : index];
    return VBW.cache.get(chain);
}
```

### 3. 获取标高
```javascript
self.getElevation = (x, y) => {
    const world = runtime.player.location.world;
    const chain = ["block", runtime.container, world, `${x}_${y}`, "elevation"];
    return VBW.cache.get(chain);
}
```

### 4. 获取阻拦体
```javascript
self.getStops = (bks, side) => {
    const stops = [];
    const fun = VBW.cache.get;
    const world = runtime.player.location.world;

    for (let i = 0; i < bks.length; i++) {
        const [x, y] = bks[i];
        if (!x || !y) continue;

        const key = `${x}_${y}`;
        const arr = fun(["block", runtime.container, world, key, "stop"]);
        if (arr.error || arr.length === 0) continue;

        for (let j = 0; j < arr.length; j++) {
            const stop = arr[j];
            if (!stop.block) stop.block = [x, y];
            if (!stop.elevation) stop.elevation = fun(["block", runtime.container, world, key, "elevation"]);
            if (!stop.side) stop.side = side;
            stops.push(stop);
        }
    }

    return stops;
}
```

## 控制器配置

```javascript
const config = {
    id: "fpv_control",
    code: { ... },
    queue: "keyboard",
    move: {
        distance: 100,
        angle: Math.PI * 0.01,
    },
    double: {
        delay: 300,      // 双击延迟
        distance: 5,     // 双击距离
    },
    swipe: {
        distance: 15,     // 滑动距离
    },
    hold: 3000,          // 持有检测时间（3秒）
}
```

## 移动计算

### 1. 身体运动
```javascript
vbw_movement.body = {
    forward: (diff, ak) => {
        return { position: [ -diff[0] * Math.sin(ak), diff[0] * Math.cos(ak), 0] }
    },
    backward: (diff, ak) => {
        return { position: [ diff[0] * Math.sin(ak), -diff[0] * Math.cos(ak), 0] }
    },
    leftward: (diff, ak) => {
        return { position: [ -diff[0] * Math.cos(ak), -diff[0] * Math.sin(ak), 0] }
    },
    rightward: (diff, ak) => {
        return { position: [ diff[0] * Math.cos(ak), diff[0] * Math.sin(ak), 0] }
    },
    rise: (diff, ak) => {
        return { position: [ 0, 0, diff[0]] }
    },
    fall: (diff, ak) => {
        return { position: [ 0, 0, -diff[0]] }
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

## 鼠标控制

### 1. 鼠标点击处理
```javascript
self.mouse = (dom_id) => {
    const el = document.getElementById(dom_id);
    if (!el) return false;

    el.addEventListener('click', (ev) => {
        const obj = self.select(ev);
        if (!obj.adjunct || obj.adjunct === "block") return false;

        const player = runtime.player;
        const world = player.location.world;
        const [x, y] = player.location.block;

        if (!self.onEdit(dom_id, world)) {
            // 正常模式：触发触摸事件
            const target = {
                x: x, y: y, world: world,
                index: obj.index,
                adjunct: obj.adjunct,
                face: obj.face,
            };
            const evt = Toolbox.clone(target);
            evt.stamp = Toolbox.stamp();
            VBW.event.trigger(obj.adjunct, "touch", evt, Toolbox.clone(target));
        } else {
            // 编辑模式：选中附属物
            World.select(dom_id, world, x, y, obj.adjunct, obj.index, obj.face, () => {});
        }
    });
}
```

## 启动控制器

```javascript
controller.start = (dom_id) => {
    if (runtime.container !== null) return false;
    UI.show("toast", `Start FPV controller.`);

    // 0. 获取Canvas宽度
    self.setWidth(dom_id);
    self.initCode();

    // 1. 翻转代码映射
    if (config.keyboard === undefined) {
        config.keyboard = self.flip(config.code);
    }

    // 2. 添加键盘和屏幕控制
    const device = VBW.cache.get(["env", "device"]);
    env.mobile = device.mobile;
    VBW.queue.init(config.queue);

    if (device.mobile) {
        self.touch(dom_id);
        self.controller();
    } else {
        self.keyboard();
        self.mouse(dom_id);
        self.edit(dom_id);
    }

    // 3. 设置相关链接
    self.setRuntime(dom_id);

    // 4. 设置帧同步函数
    const world = runtime.player.location.world;
    const chain = ["block", dom_id, world, "loop"];
    if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
    const queue = VBW.cache.get(chain);
    queue.push({ name: "movement", fun: self.action });

    // 5. 初始化指南针
    const ak = runtime.player.location.rotation[2];
    Actions.common.compass(ak);
    UI.show("toast", `FPV controller is loaded.`);
}
```

## 虚拟控制器

### 1. 控制器DOM
```javascript
self.controller = () => {
    const qu = config.queue;
    const code = config.code;
    const cfg = {
        start: {
            forward: () => { VBW.queue.insert(qu, forward); },
            backward: () => { VBW.queue.insert(qu, backward); },
            leftward: () => { VBW.queue.insert(qu, left); },
            rightward: () => { VBW.queue.insert(qu, right); },
        },
        end: {
            forward: () => { VBW.queue.remove(qu, forward); },
            backward: () => { VBW.queue.remove(qu, backward); },
            leftward: () => { VBW.queue.remove(qu, left); },
            rightward: () => { VBW.queue.remove(qu, right); },
        }
    };
    UI.show("controller", "", cfg);
}
```

## 设备检测

```javascript
const device = VBW.cache.get(["env", "device"]);
env.mobile = device.mobile;

if (device.mobile) {
    // 移动设备：使用触摸控制
    self.touch(dom_id);
    self.controller();
} else {
    // PC设备：使用键盘和鼠标
    self.keyboard();
    self.mouse(dom_id);
    self.edit(dom_id);
}
```
