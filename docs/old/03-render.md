# 渲染系统

## 概述

Septopus World使用Three.js进行3D渲染，支持多渲染模式（3D/2D/观察），并实现了完整的资源管理和场景更新机制。

## 渲染架构

```
render/
├── render_3d.js        # Three.js 3D渲染器
├── render_2d.js        # 2D渲染器
├── render_observe.js   # 观察模式渲染器
├── render_model.js      # 模型渲染器
└── render_texture.js    # 纹理渲染器
```

## 3D渲染器结构

```javascript
const renderer = {
    hooks: { reg: () => reg },
    construct: (width, height, dom_id, cfg) => {},  // 构建渲染环境
    show: (dom_id, block) => {},               // 显示/刷新场景
    clean: (dom_id, world, x, y) => {}        // 清理Block数据
}
```

## 渲染环境构建

### 1. 初始化3D对象
```javascript
renderer.construct = (width, height, dom_id, cfg) => {
    const chain = ["active", "containers", dom_id];
    if (!VBW.cache.exsist(chain)) {
        // 1.1 创建场景
        const scene = ThreeObject.get("basic", "scene", cfg_scene);

        // 1.2 创建渲染器
        const render = ThreeObject.get("basic", "render", {
            width: width,
            height: height,
            shadow: (cfg.shadow === undefined ? false : cfg.shadow)
        });

        // 1.3 创建摄像机
        const camera = ThreeObject.get("basic", "camera", {
            width: width,
            height: height,
            fov: 50,
            near: 0.1,
            far: 1000000
        });
        camera.rotation.order = "ZYX";

        // 1.4 创建状态显示
        const status = ThreeObject.get("basic", "status", cfg_status);

        VBW.cache.set(chain, { render, camera, scene, status });
    }

    return render.domElement;
}
```

### 2. Three.js对象创建
```javascript
// 场景
const scene = new THREE.Scene();

// 渲染器
const renderer = new THREE.WebGLRenderer({
    width: width,
    height: height,
    antialias: true,
    alpha: false
});

// 摄像机
const camera = new THREE.PerspectiveCamera(
    fov,                 // 视场角
    width / height,       // 宽高比
    near,                // 近裁剪面
    far                  // 远裁剪面
);
```

## 场景初始化

### 1. 设置阳光
```javascript
self.setSunLight = (scene, dom_id) => {
    const player = env.player;
    const [x, y] = player.location.block;
    const side = self.getSide();
    const cvt = self.getConvert();

    // 1.1 创建太阳光
    const sun = ThreeObject.get("light", "sun", {
        colorSky: cfg.color,
        colorGround: cfg.ground,
        intensity: cfg.intensity
    });
    sun.position.set(x * side[0], y * side[1], 20 * cvt);
    scene.add(sun);

    // 1.2 创建平行光（用于阴影）
    const light = ThreeObject.get("light", "direct", {
        shadow: false,
        color: cfg.color,
        intensity: cfg.intensity * 0.4
    });
    light.position.set(x * side[0], y * side[1], 20 * cvt);
    scene.add(light);
}
```

### 2. 设置天空
```javascript
self.setSky = (scene, dom_id) => {
    const player = env.player;
    const [x, y] = player.location.block;
    const world = player.location.world;
    const side = self.getSide();
    const cvt = self.getConvert();

    // 创建天空盒
    const sky = ThreeObject.get("basic", "sky", {
        scale: side[0] * 20 * cvt
    });
    sky.position.set(x * side[0], y * side[1], 0);

    const chain = ["block", dom_id, world, "sky"];
    VBW.cache.set(chain, sky);
    scene.add(sky);

    // 添加天空更新到帧同步队列
    const frame_chain = ["block", dom_id, world, "loop"];
    const queue = VBW.cache.get(frame_chain);
    queue.push({ name: "sky_checker", fun: VBW.sky.check });
}
```

### 3. 加载Blocks
```javascript
self.loadBlocks = (scene, dom_id) => {
    const player = env.player;
    const limit = VBW.setting("limit");
    const ext = player.location.extend;
    const [x, y] = player.location.block;
    const world = player.location.world;

    // 加载扩展范围内的所有Block
    for (let i = -ext; i < ext + 1; i++) {
        for (let j = -ext; j < ext + 1; j++) {
            const cx = x + i;
            const cy = y + j;
            if (cx < 1 || cy < 1) continue;
            if (cx > limit[0] || cy > limit[1]) continue;
            self.fresh(scene, cx, cy, world, dom_id);
        }
    }
}
```

## 资源解析

### 1. 解析纹理
```javascript
self.parseTexture = (arr, world, dom_id, ck) => {
    const failed = [];
    const set = VBW.cache.set;
    const get = VBW.cache.get;

    for (let i = 0; i < arr.length; i++) {
        const index = arr[i];
        const chain = ["block", dom_id, world, "texture", index];

        // 1. 检查是否已加载
        const s_chain = ["resource", "texture", index];
        const tx = get(s_chain);
        if (tx.error) {
            failed.push(index);
            set(chain, { error: "No resource to parse." });
            continue;
        }

        // 2. 创建Three.js纹理
        const dt = ThreeObject.get("texture", "basic", {
            image: tx.raw,
            repeat: tx.repeat
        });
        if (dt.error) {
            failed.push(index);
            set(chain, { error: "Failed to create 3D object." });
            continue;
        }

        set(chain, dt);
    }

    return ck && ck(failed);
}
```

### 2. 解析模块（3D模型）
```javascript
self.parseModule = (arr, world, dom_id, ck) => {
    const failed = [];
    const set = VBW.cache.set;

    for (let i = 0; i < arr.length; i++) {
        const index = arr[i];
        const chain = ["block", dom_id, world, "module", index];

        const orgin = ["resource", "module", index];
        if (!VBW.cache.exsist(orgin)) {
            set(chain, { error: "No module resource" });
        } else {
            const row = VBW.cache.get(orgin);
            if (row.type && row.three === undefined) {
                // 标记为null避免重复解析
                row.three = null;

                const type = row.format.toLocaleLowerCase();
                const cfg = {
                    type: type,
                    target: row.raw,
                    callback: ((id) => {
                        return (obj) => {
                            // 保存解析后的模型
                            const o_chain = ["resource", "module", parseInt(id)];
                            VBW.cache.get(o_chain).three = obj;

                            // 触发模型解析完成事件
                            setTimeout(() => {
                                const ev = { id: id, stamp: Toolbox.stamp() };
                                VBW.event.trigger("module", "parsed", ev);
                            }, 1000);
                        };
                    })(index),
                };
                ThreeObject.get("basic", "loader", cfg);
            } else if (row.three !== null) {
                // 已解析完成
                setTimeout(() => {
                    const ev = { id: row.index, stamp: Toolbox.stamp() };
                    VBW.event.trigger("module", "parsed", ev);
                }, 300);
            }
        }
    }

    return ck && ck(failed);
}
```

## 数据转换

### 1. 单Block数据处理
```javascript
self.singleBlock = (x, y, world, dt) => {
    const result = { object: [], module: [], texture: [], animate: [] };

    // 遍历STD数据
    for (let name in dt) {
        const list = dt[name];
        for (let i = 0; i < list.length; i++) {
            const row = list[i];

            // 1. 过滤纹理
            if (row.material && row.material.texture) {
                if (Array.isArray(row.material.texture)) {
                    for (const tid of row.material.texture) {
                        if (!result.texture.includes(tid)) {
                            result.texture.push(tid);
                        }
                    }
                } else {
                    if (!result.texture.includes(row.material.texture)) {
                        result.texture.push(row.material.texture);
                    }
                }
            }

            // 2. 过滤模块
            if (row.module) {
                if (!result.module.includes(row.module)) {
                    result.module.push(row.module);
                }
            }

            // 3. 过滤动画
            if (row.animate !== undefined) {
                result.animate.push({
                    x: x,
                    y: y,
                    world: world,
                    index: row.index,
                    adjunct: name,
                    effect: row.animate
                });
            }

            // 4. 创建3D对象数据
            const obj3 = {
                x: x,
                y: y,
                adjunct: name,
                geometry: {
                    type: row.type,
                    params: Toolbox.clone(row.params),  // 克隆避免影响原始数据
                },
            };

            if (row.material !== undefined) obj3.material = row.material;
            if (row.index !== undefined) obj3.index = row.index;
            if (row.module !== undefined) obj3.module = row.module;
            if (row.animate !== undefined) obj3.animate = row.animate;

            result.object.push(obj3);

            // 5. 绑定事件
            if (row.event !== undefined) {
                for (let ev in row.event) {
                    const data = row.event[ev];
                    const act = [data.condition, data.todo];
                    const key = `normal_${name}_${i}_${x}_${y}_${world}`;
                    const fun = self.decode([act], key, false);
                    const obj = { x: x, y: y, world: world, index: data.index, adjunct: data.adjunct };
                    VBW.event.on(data.adjunct, ev, fun, obj);
                }
            }
        }
    }

    return result;
}
```

### 2. 材质检查
```javascript
self.checkMaterial = (cfg, world, dom_id) => {
    if (cfg.texture) {
        if (Array.isArray(cfg.texture)) {
            // 多纹理材质
            const cube = { type: "meshstandard", params: { texture: [] } };
            for (const tid of cfg.texture) {
                const chain = ["block", dom_id, world, "texture", tid];
                const dt = VBW.cache.get(chain);
                if (dt !== undefined && !dt.error) {
                    cube.params.texture.push(dt);
                }
            }

            if (cube.params.texture.length !== 0) {
                return cube;
            }
        } else {
            // 单纹理材质
            const chain = ["block", dom_id, world, "texture", cfg.texture];
            const dt = VBW.cache.get(chain);
            if (dt !== undefined && !dt.error) {
                if (cfg.repeat) {
                    dt.repeat.set(cfg.repeat[0], cfg.repeat[1]);
                }
                if (cfg.offset) {
                    dt.offset.set(cfg.offset[0], cfg.offset[1]);
                }
                if (cfg.rotation) {
                    dt.rotation = cfg.rotation;
                }

                const mst = { type: "meshstandard", params: { texture: dt } };
                return mst;
            }
        }
    }

    if (cfg.color) {
        return {
            type: "meshbasic",
            params: {
                color: cfg.color,
                opacity: !cfg.opacity ? 1 : cfg.opacity
            }
        };
    }

    return { type: "linebasic", params: { color: config.color, opacity: 1 } };
}
```

## Three对象创建

### 1. 创建Mesh
```javascript
self.getThree = (single, world, dom_id, side) => {
    const arr = [];

    // 1. 模块处理（延迟加载）
    if (single.module) {
        const target = {
            x: single.x,
            y: single.y,
            world: world,
            index: single.index,
            adjunct: single.adjunct,
            module: single.module
        };
        VBW.event.on("module", "parsed", self.replaceFun(target), target);
    }

    // 2. 几何体处理
    if (single.geometry && single.material) {
        const { geometry } = single;
        const { rotation, position } = geometry.params;

        // 创建材质
        const material = self.checkMaterial(single.material, world, dom_id);

        // 设置位置（Septopus坐标转换为Three.js坐标）
        position[0] += (single.x - 1) * side[0];
        position[1] += (single.y - 1) * side[1];

        // 创建Mesh
        const res = ThreeObject.mesh(geometry, material, position, rotation);

        // 设置userData用于射线检测
        const mesh = res.mesh;
        const data = {
            x: parseInt(single.x),
            y: parseInt(single.y),
            name: single.adjunct
        };
        if (single.index !== undefined) data.index = single.index;
        mesh.userData = data;

        arr.push(mesh);
    }

    return arr;
}
```

### 2. 模块替换函数
```javascript
self.replaceFun = (target) => {
    return ((adj) => {
        return (ev) => {
            if (adj.module !== ev.id) return false;

            // 1. 获取模块Mesh
            const active = VBW.cache.get(["active"]);
            const dom_id = active.current;
            const scene = active.containers[dom_id].scene;
            const mesh = self.filterMeshes(target, scene);
            if (mesh === false) return false;

            // 2. 获取解析后的模型
            const chain = ["resource", "module", ev.id, "three"];
            const obj = VBW.cache.get(chain);
            if (obj.error) return false;

            // 3. 管理场景中的Mesh
            const md = self.getMeshFromModule(obj, mesh);
            scene.add(md);

            // 4. 移除占位Mesh
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

## 场景更新

### 1. 刷新Block
```javascript
self.fresh = (scene, x, y, world, dom_id) => {
    let mds = [], txs = [], objs = [], ans = [];
    const data_chain = ["block", dom_id, world, `${x}_${y}`, "three"];
    const tdata = VBW.cache.get(data_chain);

    // 1. 获取Block 3D数据
    const data = self.singleBlock(x, y, world, tdata);
    if (data.texture.length !== 0) txs = txs.concat(data.texture);
    if (data.module.length !== 0) mds = mds.concat(data.module);
    objs = objs.concat(data.object);
    ans = ans.concat(data.animate);

    // 2. 解析纹理和模块
    self.parse(txs, mds, world, dom_id, (failed) => {
        // 3. 创建Three对象并添加到场景
        const exsist = VBW.cache.exsist;
        for (let i = 0; i < objs.length; i++) {
            const single = objs[i];
            const side = self.getSide();
            const ms = self.getThree(single, world, dom_id, side);

            // 3.1 如果有动画，创建映射关系
            if (single.animate !== undefined) {
                const key = `${single.x}_${single.y}_${single.adjunct}_${single.index}`;
                const chain = ["block", dom_id, world, "animate"];
                if (!exsist(chain)) VBW.cache.set(chain, {});
                const map = VBW.cache.get(chain);
                if (map[key] === undefined) map[key] = [];
                for (let j = 0; j < ms.length; j++) {
                    if (ms[j].error) continue;
                    map[key].push(ms[j]);
                }
            }

            // 3.2 添加Three对象到场景
            for (let j = 0; j < ms.length; j++) {
                const obj = ms[j];
                if (obj.error) {
                    UI.show("toast", ms[j].error, { type: "error" });
                    continue;
                }
                scene.add(obj);
            }
        }

        // 4. 设置阴影
        const enable = false;
        self.shadow(scene, enable);

        // 5. 添加动画队列
        const ani_chain = ["block", dom_id, world, "queue"];
        const ani_queue = VBW.cache.get(ani_chain);
        if (!ani_queue.error) {
            for (let i = 0; i < ans.length; i++) {
                ani_queue.push(ans[i]);
            }
        }
    });
}
```

### 2. 清理Block
```javascript
self.clean = (scene, x, y, world, dom_id) => {
    // 1. 从场景移除相关对象
    const todo = [];
    scene.children.forEach((row) => {
        if (row.userData.x === x && row.userData.y === y) {
            todo.push(row);
        }
    });

    // 2. 移除Mesh并释放资源
    if (todo.length !== 0) {
        todo.forEach((row) => {
            scene.remove(row);
            if (row.isMesh) {
                if (row.material.map && row.material.map.dispose) {
                    row.material.map.dispose();
                }
                if (row.geometry.dispose) row.geometry.dispose();
                if (row.material.dispose) row.material.dispose();
            }
        });
    }

    // 3. 移除动画对象
    const ani_chain = ["block", dom_id, world, "queue"];
    const map_chain = ["block", dom_id, world, "animate"];
    const list = VBW.cache.get(ani_chain);
    const map = VBW.cache.get(map_chain);
    const arr = [];

    for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (row.x === x && row.y === y) {
            const key = `${x}_${y}_${row.adjunct}_${row.index}`;
            delete map[key];
            continue;
        }
        arr.push(row);
    }

    VBW.cache.set(ani_chain, arr);
}
```

## 编辑模式渲染

### 1. 加载编辑数据
```javascript
self.loadEdit = (scene, dom_id) => {
    const world = env.player.location.world;
    const chain = ["block", dom_id, world, "edit"];
    if (!VBW.cache.exsist(chain)) return false;

    const edit = VBW.cache.get(chain);
    const world = env.player.location.world;

    // 1. 获取相关辅助对象
    let objs = [];
    if (edit.selected.adjunct) {
        if (edit.helper.length !== 0) {
            objs = objs.concat(edit.helper);
        }
    }

    // 2. 加载边框
    objs = objs.concat(edit.border);
    const data = self.singleBlock(edit.x, edit.y, world, { editor: objs });
    const side = self.getSide();

    for (let i = 0; i < data.object.length; i++) {
        const single = data.object[i];
        const ms = self.getThree(single, world, dom_id, side);
        for (let j = 0; j < ms.length; j++) {
            if (ms[j].error) {
                UI.show("toast", ms[j].error, { type: "error" });
                continue;
            }
            scene.add(ms[j]);
        }
    }

    // 3. 加载编辑网格
    if (edit.grid && edit.grid.raw !== null) {
        const params = Toolbox.clone(edit.grid.raw);
        params.density = {
            offsetX: 1000,
            offsetY: 1000,
            limitZ: 12000,
        };
        const gs = ThreeObject.get("extend", "grid", params);
        edit.grid.line = gs;
        gs.position[0] += (edit.x - 1) * side[0];
        gs.position[1] += (edit.y - 1) * side[1];
        gs.userData = {
            x: edit.x,
            y: edit.y,
            name: "grid",
        };
        scene.add(gs);
    }

    self.showHelper(scene, edit.x, edit.y, world, dom_id);
    self.showStop(scene, edit.x, edit.y, world, dom_id);
}
```

### 2. 显示阻拦体
```javascript
self.showStop = (scene, x, y, world, dom_id) => {
    const stops = VBW.cache.get(["block", dom_id, world, `${x}_${y}`, "stop"]);
    for (let i = 0; i < stops.length; i++) {
        const row = stops[i];
        const obj = {
            geometry: {
                type: row.orgin.type,
                params: {
                    size: row.size,
                    position: row.position,
                    rotation: row.rotation,
                },
            },
            material: row.material,
            x: x,
            y: y,
            adjunct: `${row.orgin.adjunct}_stop`,
        };

        const side = self.getSide();
        const ms = self.getThree(obj, world, dom_id, side);
        for (let j = 0; j < ms.length; j++) {
            if (ms[j].error) {
                UI.show("toast", ms[j].error, { type: "error" });
                continue;
            }
            scene.add(ms[j]);
        }
    }
}
```

## 阴影系统

```javascript
self.shadow = (scene, enable) => {
    for (const obj of scene.children) {
        if (obj.isMesh) {
            obj.castShadow = enable;
            if (obj.userData && obj.userData.name &&
                obj.userData.name === "block") {
                obj.receiveShadow = enable;
            }
        }
    }
    return true;
}
```

## 主渲染流程

### 1. 显示场景
```javascript
renderer.show = (dom_id, block) => {
    const chain = ["active", "containers", dom_id];
    if (!VBW.cache.exsist(chain)) {
        return UI.show(`Construct renderer before rendering.`, { type: "error" });
    }

    const data = VBW.cache.get(chain);
    const { render, scene } = data;
    const info = render.info.render;
    const first = info.frame === 0 ? true : false;

    // 首次运行
    if (first) {
        UI.show("toast", `Start 3D renderer.`);

        // 1.1 设置阳光
        self.setSunLight(scene, dom_id);
        // 1.2 设置天空
        self.setSky(scene, dom_id);
        // 1.3 加载Block范围
        self.loadBlocks(scene, dom_id);

        // 2. 设置帧同步循环
        render.setAnimationLoop(VBW.loop);
        UI.show("toast", `Start framework.loop() to support "Frame Synchronization".`);

        // 3. 添加系统启动事件以启动动画
        VBW.event.on("system", "launch", (ev) => {
            // 4.1 获取原始动画数据
            const world = env.player.location.world;
            env.animation = {
                queue: {},
                checkpoint: {},
                frame: 0,
                start: ev.stamp,
            };

            // 4.2 构建动画数据
            self.structEffects(world, dom_id);

            // 4.3 通过帧同步方式启动动画
            const chain = ["block", dom_id, world, "loop"];
            const queue = VBW.cache.get(chain);
            queue.push({ name: "three_animation", fun: self.animate });
        }, "three_animate");
    }

    // 更新目标Block并刷新场景
    if (block !== undefined) {
        const [x, y, world] = block;
        self.clean(scene, x, y, world, dom_id);
        self.fresh(scene, x, y, world, dom_id);
        self.loadEdit(scene, dom_id);
    }
}
```

## 坐标转换

### 1. Septopus → Three.js
```javascript
self.transform = (arr) => {
    return [arr[0], arr[2], -arr[1]];
}
```

## 渲染器配置

```javascript
const config = {
    fov: 50,                 // 视场角
    color: 0xff0000,          // 默认颜色
    speed: 60,                // 帧更新率
    sun: {
        intensity: 1.5,        // 太阳光强度
        color: 0xffffff,       // 太阳光颜色
        ground: 0xeeeeee,      // 地面颜色
    }
}
```

## 运行时环境

```javascript
const env = {
    player: null,         // 玩家数据
    animation: null,      // 动画数据
}
```
