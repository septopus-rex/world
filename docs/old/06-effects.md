# 效果系统

## 概述

效果系统（Effects）为Septopus World提供动画和视觉特效支持，包括网格效果、摄像机效果和场景效果。

## 效果分类

```javascript
const effects = {
    mesh: [
        "rotate",   // 旋转
        "move",     // 移动
        "scale",    // 缩放
        "texture",  // 纹理
        "color",    // 颜色
        "opacity",  // 不透明度
        "morph",    // 变形
    ],
    camera: [
        "fall",     // 掉落
        "linger",   // 停留
    ],
    scene: [
        "lightning", // 闪电
    ],
}
```

## 效果入口

```javascript
const vbw_effects = {
    hooks: {
        reg: () => { return reg },
    },

    // 设置摄像机和场景
    set: (cam, sce) => {
        active.camera = cam;
        active.scene = sce;
        return true;
    },

    // 获取单个效果
    get: (cat, type, params, ck) => {
        if (!router[cat] || !router[cat][type]) {
            return { error: "Invalid effects." };
        }
        return router[cat][type](params, active, ck);
    },

    // 解码标准动画格式
    decode: (std, category) => {
        if (!std.loops && !std.duration) {
            return self.simple(std, category);
        }
        return self.complex(std, category);
    },
}
```

## 标准动画格式

### 1. 动画定义结构
```javascript
const animation_std = {
    name: "rotate",
    duration: 0,          // 持续时间（毫秒），0=无限
    loops: 0,             // 循环次数，0=无限
    category: "mesh",      // 类别：mesh/camera/scene
    pending: [300, 600],   // 等待时间（毫秒）
    timeline: [
        {
            type: "rotate",
            mode: "add",       // 模式：add/set
            axis: "XYZ",      // 轴：X/Y/Z/XYZ
            time: 0,          // 时间：0/开始时间/[开始,结束]
            value: val,       // 值：数值/函数
        },
        {
            type: "move",
            mode: "add",
            axis: "Y",
            time: [0, 2500],
            value: 100,
        },
    ],
}
```

### 2. 时间段处理
```javascript
self.getPeriod = (time, duration, ends) => {
    const period = [0, 0];

    if (!time) {
        period[1] = duration;
    }

    if (Array.isArray(time)) {
        period[0] = time[0];
        period[1] = time[1];
    } else {
        period[0] = time;
        period[1] = duration;
    }

    period[0] += ends[0];
    period[1] += ends[1];

    return period;
}
```

### 3. 断点插入
```javascript
self.insertBreakpoint = (period, line) => {
    // 插入开始点
    const start = period[0];
    if (start && !line.includes(start)) {
        const index = line.findIndex(element => start <= element);
        if (index !== -1) {
            line.splice(index, 0, start);
        }
    }

    // 插入结束点
    const end = period[1];
    if (!line.includes(end)) {
        const index = line.findIndex(element => end <= element);
        if (index !== -1) {
            line.splice(index, 0, end);
        }
    }

    return line;
}
```

### 4. 获取断点
```javascript
self.getBreakpoint = (duration, timeline, pending) => {
    const ends = [0, 0];

    if (pending) {
        if (Array.isArray(pending)) {
            ends[0] = pending[0];
            ends[1] = pending[1];
        } else {
            ends[0] = pending;
        }
    }

    let line = [0, ends[0] + ends[1] + duration];
    if (ends[1] !== 0) {
        line = self.insertBreakpoint([line[1] - ends[1], line[1]], line);
    }
    if (ends[0] !== 0) {
        line = self.insertBreakpoint([0, ends[0]], line);
    }

    for (let i = 0; i < timeline.length; i++) {
        const row = timeline[i];
        const period = self.getPeriod(row.time, duration, ends);
        line = self.insertBreakpoint(period, line);
    }

    return line;
}
```

### 5. 获取动画状态
```javascript
self.getStatus = (std, n) => {
    const breakpoints = self.getBreakpoint(std.duration, std.timeline, std.pending);
    const end = breakpoints[breakpoints.length - 1];
    const per = 1000 / config.frame;

    const status = {
        start: n,
        end: n + Math.round(end / per),
        counter: 0,
        round: {
            limit: std.loops,
            now: 0,
        },
        section: breakpoints,
    };

    return status;
}
```

## 简单动画

```javascript
self.simple = (std, category) => {
    return (meshes, n) => {
        for (let i = 0; i < std.timeline.length; i++) {
            const row = std.timeline[i];
            if (!router[category] || !router[category][row.type]) continue;

            if (typeof row.axis === "string") {
                row.axis = self.getAxis(row.axis);
            }

            router[category][row.type]({ mesh: meshes }, row, n);
        }
    }
}
```

## 复杂动画

```javascript
self.complex = (std, category) => {
    let status = null;

    return (meshes, n) => {
        if (status === null) {
            status = self.getStatus(std, n);
        }

        // 1. 检测循环是否结束
        const step = n - status.start;
        if (n === status.end) {
            status.round.now++;
            if (status.round.limit !== 0) {
                if (status.round.now >= status.round.limit) {
                    return false;
                }
            }

            const full = status.end - status.start;
            status.start = n;
            status.end = n + full;
        }

        // 2. 按步骤执行动作
        const point = Math.round(step * 1000 / config.frame);
        const ends = [0, 0];

        if (std.pending) {
            if (Array.isArray(std.pending)) {
                ends[0] = std.pending[0];
                ends[1] = std.pending[1];
            } else {
                ends[0] = std.pending;
            }
        }

        for (let i = 0; i < std.timeline.length; i++) {
            const row = std.timeline[i];
            if (!router[category] || !router[category][row.type]) continue;

            if (typeof row.axis === "string") {
                row.axis = self.getAxis(row.axis);
            }

            if (!row.time) {
                router[category][row.type]({ mesh: meshes }, row, step);
            } else {
                const time = row.time;
                if (Array.isArray(time)) {
                    if (point < time[0] + ends[0] || point > time[1] + ends[0]) continue;
                    router[category][row.type]({ mesh: meshes }, row, step);
                } else {
                    if (point < time[0] + ends[0]) continue;
                    router[category][row.type]({ mesh: meshes }, row, step);
                }
            }
        }
    };
}
```

## 网格效果

### 1. 旋转效果
```javascript
const Rotate = (params, active, ck) => {
    const { mesh } = params;
    const axis = params.axis || "XYZ";
    const value = params.value || Math.PI / 180;

    return (config) => {
        if (axis.x) mesh.rotation.x += value;
        if (axis.y) mesh.rotation.y += value;
        if (axis.z) mesh.rotation.z += value;
    };
}
```

### 2. 移动效果
```javascript
const Move = (params, active, ck) => {
    const { mesh } = params;
    const axis = params.axis || "XYZ";
    const value = params.value;

    return (config) => {
        if (axis.x) mesh.position.x += value;
        if (axis.y) mesh.position.y += value;
        if (axis.z) mesh.position.z += value;
    };
}
```

### 3. 缩放效果
```javascript
const Scale = (params, active, ck) => {
    const { mesh } = params;
    const axis = params.axis || "XYZ";
    const value = params.value || 0.01;

    return (config) => {
        if (axis.x) mesh.scale.x += value;
        if (axis.y) mesh.scale.y += value;
        if (axis.z) mesh.scale.z += value;
    };
}
```

### 4. 颜色效果
```javascript
const Color = (params, active, ck) => {
    const { mesh } = params;
    const color = params.color;
    const duration = params.duration || 0;

    return (config) => {
        if (mesh.material) {
            mesh.material.color.setHex(color);
        }
    };
}
```

### 5. 不透明度效果
```javascript
const Opacity = (params, active, ck) => {
    const { mesh } = params;
    const opacity = params.opacity;
    const duration = params.duration || 0;

    return (config) => {
        if (mesh.material) {
            mesh.material.opacity = opacity;
        }
    };
}
```

### 6. 纹理效果
```javascript
const Texture = (params, active, ck) => {
    const { mesh } = params;
    const { offset, repeat, rotation } = params;

    return (config) => {
        if (mesh.material && mesh.material.map) {
            const tex = mesh.material.map;
            if (offset) tex.offset.set(offset[0], offset[1]);
            if (repeat) tex.repeat.set(repeat[0], repeat[1]);
            if (rotation) tex.rotation = rotation;
            tex.needsUpdate = true;
        }
    };
}
```

### 7. 变形效果
```javascript
const Morph = (params, active, ck) => {
    const { mesh } = params;
    const { target, ratio } = params;

    return (config) => {
        if (mesh.morphTargetInfluences) {
            for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
                mesh.morphTargetInfluences[i] = ratio;
            }
        }
    };
}
```

## 摄像机效果

### 1. 掉落效果
```javascript
const Fall = (params, active, ck) => {
    const { height, convert, skip } = params;
    const total = height;
    const step = 20;

    let current = 0;

    return () => {
        if (current < total) {
            current += step;
            if (current > total) current = total;

            const offset = current * convert;
            active.camera.position.y -= offset;

            if (skip) {
                // 跳过动画直接落地
                active.camera.position.y -= (total - current) * convert;
                current = total;
            }
        } else {
            if (ck) ck();
        }
    };
}
```

### 2. 停留效果
```javascript
const Linger = (params, active, ck) => {
    const { duration } = params;
    const frames = Math.ceil(duration / 16);  // 60fps

    return () => {
        // 延迟执行
        setTimeout(() => {
            if (ck) ck();
        }, duration);
    };
}
```

## 场景效果

### 1. 闪电效果
```javascript
const Lightning = (params, active, ck) => {
    const { x, y, world } = params;

    return () => {
        // 创建闪电
        const flash = new THREE.PointLight(0xffffff, 2, 100);

        const side = VBW.cache.get(["env", "world", "side"]);
        const convert = VBW.cache.get(["env", "world", "accuracy"]);

        flash.position.set(
            x * side[0],
            y * side[1],
            20 * convert
        );
        active.scene.add(flash);

        // 短暂显示后移除
        setTimeout(() => {
            active.scene.remove(flash);
            if (ck) ck();
        }, 100);
    };
}
```

## 轴解析

```javascript
self.getAxis = (str) => {
    const arr = str.split("");
    const ax = { x: false, y: false, z: false };

    for (let i = 0; i < arr.length; i++) {
        const key = arr[i].toLocaleLowerCase();
        ax[key] = true;
    }

    return ax;
}
```

## 精度计算

```javascript
self.getPrecision = (num) => {
    const numStr = num.toString();
    const decimalIndex = numStr.indexOf('.');

    if (decimalIndex === -1) return 1;

    const decimalPart = numStr.substring(decimalIndex + 1);
    const decimalLength = decimalPart.length;

    return Math.pow(10, -decimalLength);
}
```

## 效果配置

```javascript
const config = {
    frame: 60,  // 帧率60fps
}
```

## 运行时环境

```javascript
const active = {
    camera: null,    // 摄像机对象
    scene: null,     // 场景对象
}
```

## 效果路由

```javascript
const router = {
    camera: {
        fall: Fall,
        linger: Linger,
    },
    scene: {
        lightning: Lightning,
    },
    mesh: {
        rotate: Rotate,
        move: Move,
        scale: Scale,
        texture: Texture,
        color: Color,
        opacity: Opacity,
        morph: Morph,
    },
}
```

## 动画集成

### 1. 效果注册
```javascript
// 在附属物中定义动画
const hooks = {
    animate: (effect, param) => {
        const index = effect - 1;
        if (!router[index]) return false;

        if (typeof router[index] === 'function') {
            return router[index](param);
        }

        return JSON.parse(JSON.stringify(router[index]));
    },
}
```

### 2. 动画解码
```javascript
// 在渲染器中解码动画
const fn = Effects.decode(std, category);

// 应用到mesh
fn(meshes, frame);
```

## 动画执行流程

### 1. 动画构建
```javascript
const std = {
    name: "rotate",
    duration: 0,
    loops: 0,
    category: "mesh",
    timeline: [
        {
            type: "rotate",
            mode: "add",
            axis: "XYZ",
            time: 0,
            value: Math.PI / 180,
        }
    ]
}

// 解码为执行函数
const animateFn = Effects.decode(std, "mesh");
```

### 2. 动画应用
```javascript
// 获取动画映射
const animateMap = VBW.cache.get(["block", dom_id, world, "animate"]);

// 为每个mesh添加到映射
const key = `${x}_${y}_${adjunct}_${index}`;
animateMap[key] = meshes;

// 添加到动画队列
const queue = VBW.cache.get(["block", dom_id, world, "queue"]);
queue.push({
    x: x,
    y: y,
    world: world,
    index: index,
    adjunct: name,
    effect: std
});
```

### 3. 帧同步执行
```javascript
const animate = () => {
    if (env.animation === null) return false;

    env.animation.frame++;

    for (let key in env.animation.queue) {
        const fn = env.animation.queue[key];
        const n = env.animation.frame;
        const meshes = env.animation.meshes[key];
        fn(meshes, n);

        // 检查移除点
        // ...
    }
}

// 添加到帧同步队列
queue.push({ name: "three_animation", fun: self.animate });
```

## 效果扩展

### 1. 创建新效果
```javascript
const newEffect = (params) => {
    return (config) => {
        // 自定义效果逻辑
        const { mesh } = params;
        // 操作mesh...
    };
}
```

### 2. 注册效果
```javascript
// 添加到路由
router.mesh.customEffect = newEffect;

// 在附属物中使用
const std = {
    name: "custom_effect",
    duration: 0,
    loops: 0,
    category: "mesh",
    timeline: [
        {
            type: "custom",
            time: 0,
            value: { ...params },
        }
    ]
}
```

## 时间轴处理

### 1. 时间段判断
```javascript
// 判断当前是否在某个时间段内
const point = Math.round(step * 1000 / config.frame);
const time = row.time;

if (Array.isArray(time)) {
    if (point >= time[0] && point <= time[1]) {
        // 在时间段内，执行效果
        router[category][row.type]({ mesh: meshes }, row, step);
    }
} else {
    if (point >= time[0]) {
        // 在时间点后，执行效果
        router[category][row.type]({ mesh: meshes }, row, step);
    }
}
```

### 2. 循环控制
```javascript
if (n === status.end) {
    status.round.now++;

    // 检查是否达到循环次数限制
    if (status.round.limit !== 0) {
        if (status.round.now >= status.round.limit) {
            // 停止动画
            return false;
        }
    }

    // 重置开始时间
    const full = status.end - status.start;
    status.start = n;
    status.end = n + full;
}
```

## 配置参数

### 1. 效果参数
```javascript
// 网格效果
const meshEffectParams = {
    axis: { x, y, z },           // 旋转/缩放/移动轴
    value: number | number[],       // 数值或函数
    color: hex,                   // 颜色值
    opacity: float,                 // 不透明度
    duration: number,              // 持续时间
}

// 摄像机效果
const cameraEffectParams = {
    height: number,                // 掉落高度
    convert: number,               // 转换系数
    skip: boolean,                 // 是否跳过动画
    duration: number,              // 持续时间
}

// 场景效果
const sceneEffectParams = {
    x: number,                     // X坐标
    y: number,                     // Y坐标
    world: number,                  // 世界索引
}
```

### 2. 动画模式
```javascript
// add模式：累加
mode: "add"
// 每帧执行：value += value

// set模式：设置
mode: "set"
// 每帧执行：value = value
```

## 性能优化

### 1. 动画缓存
```javascript
// 缓存动画函数
const animateMap = {
    [key]: animationFunction
}

// 避免重复解码
if (!animateMap[key]) {
    animateMap[key] = Effects.decode(std, category);
}
```

### 2. 按需执行
```javascript
// 只在可见范围内执行动画
if (!World.outofRange(x, y)) {
    // 执行动画
    fn(meshes, frame);
}
```

### 3. 清理机制
```javascript
// 动画结束后自动移除
if (status.round.now >= status.round.limit) {
    // 移除动画
    return false;
}
```
