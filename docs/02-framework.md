# Framework 核心框架

Framework 是 Septopus World 的核心基础架构，负责组件注册、缓存管理、队列调度和数据结构转换。

## 目录

- [架构概述](#架构概述)
- [组件注册系统](#组件注册系统)
- [缓存系统](#缓存系统)
- [队列系统](#队列系统)
- [数据转换系统](#数据转换系统)
- [模式系统](#模式系统)
- [帧同步循环](#帧同步循环)
- [更新系统](#更新系统)
- [配置系统](#配置系统)

## 架构概述

```typescript
import type {
    IComponent,
    ComponentRegistration,
    BlockData,
    STDData,
    ThreeDataMap,
    SystemMode,
} from './types';

class Framework {
    // 组件管理
    private components: Map<string, IComponent> = new Map();
    private componentMap: Map<string, string> = new Map();

    // 缓存系统
    private cache: FrameworkCache;

    // 队列系统
    private queues: Map<string, any[]> = new Map();

    // 配置
    private setting: SeptopusConfig;

    constructor() {
        this.cache = new FrameworkCache();
        this.setting = this.loadConfig();
    }
}
```

## 组件注册系统

### 组件注册

```typescript
/**
 * 组件注册表
 */
interface ComponentRegistry {
    core: IComponent[];
    render: IComponent[];
    controller: IComponent[];
    adjunct: IComponent[];
    plugin: IComponent[];
}

/**
 * 注册所有组件
 */
register(registry: ComponentRegistry): void {
    for (const category in registry) {
        const components = registry[category as keyof ComponentRegistry];
        for (const component of components) {
            this.registerComponent(component);
        }
    }
}

/**
 * 注册单个组件
 */
registerComponent(component: IComponent): void {
    const reg = component.hooks.reg();

    // 保存组件
    this.components.set(reg.name, component);

    // 保存名称映射
    if (reg.short) {
        this.componentMap.set(reg.short, reg.name);
        this.componentMap.set(reg.name, reg.short);
    }

    // 注册事件
    if (reg.events) {
        this.events.register(reg.name, reg.events);
    }

    // 初始化组件
    if (component.hooks.init) {
        const initResult = component.hooks.init();
        if (initResult) {
            this.cache.set([initResult.chain], initResult.value);
        }
    }
}
```

### 组件类型

```typescript
/**
 * 获取组件
 */
getComponent(name: string): IComponent | undefined {
    return this.components.get(name);
}

/**
 * 根据缩写获取组件名
 */
getNameByShort(short: string): string | undefined {
    return this.componentMap.get(short);
}

/**
 * 根据 short 获取附属物原始数据
 */
getRawByName(name: string, list: [string, any][]): any[] | undefined {
    const short = this.componentMap.get(name);
    if (!short) {
        return undefined;
    }
    for (const row of list) {
        if (row[0] === short) return row[1];
    }
    return undefined;
}
```

## 缓存系统

### 缓存键定义

```typescript
/**
 * 缓存键路径
 */
type CacheKey =
    | 'component'    // 组件注册信息
    | 'resource'     // 资源（module/texture）
    | 'queue'        // 系统队列
    | 'block'        // Block 数据
    | 'map'          // 组件映射（short↔name）
    | 'env'          // 运行时环境
    | 'active'       // 活动状态
    | 'task'         // 修改任务
    | 'modified'     // 修改的 Block
    | 'def'          // 世界和附属物定义
    | 'setting';     // 系统设置
```

### 缓存操作

```typescript
class FrameworkCache {
    private data: Record<string, any> = {};

    /**
     * 获取缓存
     */
    get<T = any>(chain: string[], clone?: boolean): T | { error: string } {
        if (!Array.isArray(chain)) {
            return { error: 'Invalid path chain' };
        }

        let tmp: any = this.data;
        for (const key of chain) {
            if (tmp[key] === undefined) {
                return { error: 'Invalid data' };
            }
            tmp = tmp[key];
        }

        return clone ? this.deepClone(tmp) : tmp;
    }

    /**
     * 检查缓存是否存在
     */
    exist(chain: string[]): boolean {
        let tmp: any = this.data;
        for (const key of chain) {
            if (tmp[key] === undefined) return false;
            tmp = tmp[key];
        }
        return true;
    }

    /**
     * 设置缓存
     */
    set(chain: string[], value: any): boolean | { error: string } {
        if (this.data[chain[0]] === undefined) {
            return { error: 'Invalid root key' };
        }
        this.extend(chain, value, true, this.data);
        return true;
    }

    /**
     * 删除缓存
     */
    remove(chain: string[]): boolean {
        let tmp: any = this.data;
        for (let i = 0; i < chain.length - 1; i++) {
            tmp = tmp[chain[i]];
        }
        delete tmp[chain[chain.length - 1]];
        return true;
    }

    /**
     * 深度克隆
     */
    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * 扩展对象
     */
    private extend(chain: string[], value: any, create: boolean, target: any): void {
        let current = target;
        for (let i = 0; i < chain.length - 1; i++) {
            const key = chain[i];
            if (create && current[key] === undefined) {
                current[key] = {};
            }
            current = current[key];
        }
        current[chain[chain.length - 1]] = value;
    }
}
```

### Block 缓存结构

```typescript
/**
 * Block 缓存数据结构
 */
interface BlockCache {
    [dom_id: string]: {
        [world: number]: {
            [key: string]: {
                raw: BlockRawData;
                recover: BlockRawData;
                std: STDData;
                three: ThreeDataMap;
                stop: StopData[];
                trigger: TriggerData[];
                elevation: number;
                animate: Record<string, THREE.Mesh[]>;
            };
            sky: THREE.Object3D;
            queue: FrameFunction[];
            loop: FrameFunction[];
            edit: EditData;
        };
        basic: BasicData;
    };
}

/**
 * 编辑模式数据
 */
interface EditData {
    x: number;
    y: number;
    world: number;
    border: any[];
    helper: any[];
    grid: {
        raw: any;
        line: any[];
        points: any[];
    };
    selected: {
        adjunct: string;
        index: number;
        face: string;
    };
    objects: {
        stop: any;
        helper: any;
        grid: any;
    };
}

/**
 * 基础数据
 */
interface BasicData {
    width: number;
    height: number;
}
```

## 队列系统

### 队列类型

```typescript
/**
 * 队列名称
 */
enum QueueName {
    Block = 'block_loading',
    Resource = 'resource_loading',
    Trigger = 'trigger_runtime',
}
```

### 队列操作

```typescript
/**
 * 队列管理
 */
class QueueManager {
    private queues: Map<string, any[]> = new Map();

    /**
     * 初始化队列
     */
    init(name: string): void {
        this.queues.set(name, []);
    }

    /**
     * 清空队列
     */
    clean(name: string): void {
        this.queues.set(name, []);
    }

    /**
     * 推入队列
     */
    push(name: string, value: any): void {
        if (!this.queues.has(name)) {
            this.init(name);
        }
        this.queues.get(name)!.push(value);
    }

    /**
     * 推入（去重）
     */
    insert(name: string, value: any): void {
        if (!this.queues.has(name)) {
            this.init(name);
        }
        const queue = this.queues.get(name)!;
        if (!queue.includes(value)) {
            queue.push(value);
        }
    }

    /**
     * 从队列移除
     */
    remove(name: string, value: any): boolean {
        if (!this.queues.has(name)) return false;
        const queue = this.queues.get(name)!;
        const index = queue.indexOf(value);
        if (index < 0) return false;
        queue.splice(index, 1);
        return true;
    }

    /**
     * 按索引删除
     */
    drop(name: string, index: number): void {
        if (!this.queues.has(name)) return;
        const queue = this.queues.get(name)!;
        queue.splice(index, 1);
    }

    /**
     * 获取队列
     */
    get<T = any>(name: string): T[] | { error: string } {
        if (!this.queues.has(name)) {
            return { error: 'Queue not found' };
        }
        return this.queues.get(name)!;
    }
}
```

## 数据转换系统

### Raw → STD 转换

```typescript
/**
 * 将单个 Block 的 Raw 数据转换为 STD 数据
 */
structSingle(x: number, y: number, world: number, dom_id: string): void {
    const key = `${x}_${y}`;
    const cvt = this.cache.get(['env', 'world', 'accuracy']) as number;
    const side = this.cache.get(['env', 'world', 'side']) as [number, number];
    const rawChain = ['block', dom_id, world, key, 'raw'];
    const bk = this.cache.get(rawChain) as { data: BlockRawData };

    const std: STDData = { block: [] };

    // 1. 构建 Block 数据
    const blockComponent = this.getComponent('block');
    if (blockComponent?.transform?.raw_std) {
        std.block = blockComponent.transform.raw_std(bk.data, cvt, side);
    }

    // 2. 设置 Block 标高
    const elevation = std.block[0]?.elevation || 0;
    this.cache.set(['block', dom_id, world, key, 'elevation'], elevation);

    // 3. 构建所有附属物
    const adjs = bk.data[2] as [string, any[]][];
    for (const [short, list] of adjs) {
        const name = this.getNameByShort(short);
        if (!name) continue;
        const component = this.getComponent(name);
        if (component?.transform?.raw_std) {
            std[name] = component.transform.raw_std(list, cvt);
        }
    }

    this.cache.set(['block', dom_id, world, key, 'std'], std);
}
```

### STD → 3D 转换

```typescript
/**
 * 将 STD 数据转换为 3D 渲染数据
 */
structRenderData(x: number, y: number, world: number, dom_id: string): PreloadData {
    const key = `${x}_${y}`;
    const stdChain = ['block', dom_id, world, key, 'std'];
    const map = this.cache.get(stdChain) as STDData;
    const va = this.cache.get(['block', dom_id, world, key, 'elevation']) as number;

    const rdata: ThreeDataMap = {};
    const stops: StopData[] = [];
    const triggers: TriggerData[] = [];
    const preload: PreloadData = { module: [], texture: [] };

    // 遍历 STD 数据转换为 3D 格式
    for (const name in map) {
        const std = map[name];
        const component = this.getComponent(name);
        if (!component?.transform?.std_3d) continue;

        const data = component.transform.std_3d(std, va);

        for (let i = 0; i < data.length; i++) {
            const row = data[i];

            // 1. 过滤纹理
            if (row.material?.texture) {
                if (Array.isArray(row.material.texture)) {
                    for (const tid of row.material.texture) {
                        if (!preload.texture.includes(tid)) {
                            preload.texture.push(tid);
                        }
                    }
                } else {
                    if (!preload.texture.includes(row.material.texture)) {
                        preload.texture.push(row.material.texture);
                    }
                }
            }

            // 2. 过滤模块
            if (row.module && !preload.module.includes(row.module)) {
                preload.module.push(row.module);
            }

            // 3. 过滤阻拦体
            if (row.stop) {
                const obj = this.deepClone(row.params) as any;
                obj.material = row.stop;
                obj.orgin = { adjunct: name, index: i, type: row.type };
                stops.push(obj);
            }

            // 4. 过滤触发器
            if (name === 'trigger') {
                const tgr = this.deepClone(row.params) as any;
                tgr.material = row.material;
                tgr.orgin = { type: row.type, index: i, adjunct: name };
                triggers.push(tgr);
            }
        }

        rdata[name] = data;
    }

    // 保存到缓存
    this.cache.set(['block', dom_id, world, key, 'three'], rdata);
    this.cache.set(['block', dom_id, world, key, 'stop'], stops);
    this.cache.set(['block', dom_id, world, key, 'trigger'], triggers);

    return preload;
}

/**
 * 预加载数据
 */
interface PreloadData {
    texture: number[];
    module: number[];
}
```

## 模式系统

### 模式切换

```typescript
/**
 * 切换系统模式
 */
mode(mode: SystemMode, target: ModeTarget, callback?: () => void): void {
    const { x, y, world, container } = target;
    const def = this.cache.get(['def', 'common']) as any;

    switch (mode) {
        case 'normal':
            this.cache.set(['active', 'containers', container, 'mode'], mode);
            // 删除编辑数据
            const editChain = ['block', container, world, 'edit'];
            if (this.cache.exist(editChain)) {
                this.cache.remove(editChain);
            }
            callback?.();
            break;

        case 'edit':
            this.cache.set(['active', 'containers', container, 'mode'], mode);
            const pre = this.toEdit(x, y, world, container);
            if (target.selected) {
                this.toSelect(x, y, world, container);
            }
            callback?.(pre);
            break;

        case 'game':
            this.cache.set(['active', 'containers', container, 'mode'], mode);
            break;

        case 'ghost':
            const currentMode = this.cache.get(['active', 'containers', container, 'mode']);
            if (!currentMode) {
                this.cache.set(['active', 'containers', container, 'mode'], mode);
            }
            break;
    }
}

/**
 * 模式切换目标
 */
interface ModeTarget {
    x: number;
    y: number;
    world: number;
    container: string;
    selected?: boolean;
}
```

### 编辑模式转换

```typescript
/**
 * 转换为编辑模式数据
 */
toEdit(x: number, y: number, world: number, dom_id: string): PreloadData {
    const preload: PreloadData = { module: [], texture: [] };

    const stdChain = ['block', dom_id, world, `${x}_${y}`, 'std'];
    const map = this.cache.get(stdChain) as STDData;
    const cvt = this.cache.get(['env', 'world', 'accuracy']) as number;
    const va = this.cache.get(['block', dom_id, world, `${x}_${y}`, 'elevation']) as number;

    const editChain = ['block', dom_id, world, 'edit'];
    if (!this.cache.exist(editChain)) {
        this.cache.set(editChain, { x, y, world, border: [], helper: [], grid: { raw: null, line: [], points: [] } });
    }
    const edit = this.cache.get(editChain) as EditData;

    // 1. Block 边框数据
    const blockComponent = this.getComponent('block');
    if (blockComponent?.transform?.std_border) {
        const bk = blockComponent.transform.std_border(map.block, va, cvt);
        if (bk.helper?.length !== 0) {
            edit.border = [];
            for (const row of bk.helper) {
                if (row.material?.texture) {
                    preload.texture.push(row.material.texture);
                }
                if (row.module) {
                    preload.module.push(row.module);
                }
                edit.border.push(row);
            }
        }
    }

    return preload;
}
```

## 帧同步循环

### 循环入口

```typescript
/**
 * 帧同步循环
 */
loop(): void {
    // 1. 获取活动场景
    const dom_id = this.cache.get(['active', 'current']) as string;
    if (!dom_id) return;

    const activeChain = ['active', 'containers', dom_id];
    if (!this.cache.exist(activeChain)) return;
    const active = this.cache.get(activeChain) as ActiveContainer;

    const world = this.cache.get(['env', 'player', 'location', 'world']) as number;

    // 2. 帧同步队列
    const list = this.getLoopQueue(world, dom_id);
    if (list && !('error' in list)) {
        for (const item of list) {
            if (item.fun) item.fun();
        }
    }

    // 3. 渲染场景
    active.render.render(active.scene, active.camera);
    active.status.update();
}

/**
 * 获取帧同步队列
 */
getLoopQueue(world: number, dom_id: string): FrameFunction[] | { error: string } {
    const chain = ['block', dom_id, world, 'loop'];
    return this.cache.get(chain) as FrameFunction[];
}

/**
 * 帧同步函数
 */
interface FrameFunction {
    name: string;
    fun: () => void;
}

/**
 * 活动容器
 */
interface ActiveContainer {
    render: any;
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
    status: any;
    mode: SystemMode;
}
```

## 更新系统

### 任务执行

```typescript
/**
 * 执行更新任务队列
 */
execute(
    tasks: UpdateTask[],
    dom_id: string,
    world: number,
    callback?: (failed: FailedTask[]) => void,
    failed: FailedTask[] = []
): void {
    if (tasks.length === 0) {
        callback?.(failed);
        return;
    }

    const task = tasks.pop()!;

    // 1. Block 任务
    if (task.block !== undefined) {
        const blockComponent = this.getComponent('block');
        if (blockComponent?.attribute && task.action in blockComponent.attribute) {
            const action = blockComponent.attribute[task.action] as Function;
            const [x, y] = task.block;
            action(x, y, task.param || {}, world, dom_id);
        }
        return this.execute(tasks, dom_id, world, callback, failed);
    }

    // 2. 附属物任务
    const component = this.getComponent(task.adjunct);
    if (!component?.attribute || !component.attribute[task.action]) {
        failed.push({ error: 'Invalid task' });
        return this.execute(tasks, dom_id, world, callback, failed);
    }

    const fun = component.attribute[task.action] as Function;
    const key = `${task.x}_${task.y}`;
    const raw = this.getRawByName(task.adjunct, this.cache.get(['block', dom_id, world, key, 'raw', 'data']) as [string, any][]);

    task.limit !== undefined
        ? fun(task.param, raw, task.limit)
        : fun(task.param, raw);

    // 3. 保存修改
    const mChain = ['modified', dom_id, world];
    if (!this.cache.exist(mChain)) {
        this.cache.set(mChain, {});
    }
    const modified = this.cache.get(mChain) as Record<string, number>;
    modified[key] = Date.now();

    return this.execute(tasks, dom_id, world, callback, failed);
}

/**
 * 更新任务
 */
interface UpdateTask {
    block?: [number, number];
    x?: number;
    y?: number;
    world?: number;
    adjunct: string;
    action: string;
    param?: any;
    limit?: [number, number, number];
}

/**
 * 失败任务
 */
interface FailedTask {
    error: string;
}
```

## 配置系统

### 配置加载

```typescript
/**
 * 加载系统配置
 */
loadConfig(): SeptopusConfig {
    return {
        block: {
            size: [16000, 16000],
            accuracy: 1000,
            limit: [4096, 4096],
            opacity: 1,
            texture: 206,
            color: 0xdddddd,
            repeat: [10, 10],
            active: {
                height: 0.5,
                color: {
                    north: 0xe11d48,
                    south: 0x6b7280,
                    east: 0x3b82f6,
                    west: 0x10b981,
                },
            },
            basic: 100,
        },
        camera: {
            fov: 50,
            near: 0.1,
            far: 1000000,
            width: window.innerWidth,
            height: window.innerHeight,
            shadow: false,
        },
        render: {
            fov: 50,
            color: 0xff0000,
            speed: 60,
            sun: {
                intensity: 1.5,
                color: 0xffffff,
                ground: 0xeeeeee,
            },
        },
        world: {
            side: [16000, 16000],
            accuracy: 1000,
            block: {
                limit: [4096, 4096],
            },
            common: {},
        },
        player: {
            height: 1.7,
            eyeHeight: 1.6,
            moveSpeed: 1.5,
            rotateSpeed: 0.05,
            jumpHeight: 1,
        },
        system: {
            autosave: {
                interval: 60,
                key: 'vbw_player',
            },
            defaultWorld: 0,
            hold: 3000,
            frame: 60,
        },
    };
}

/**
 * 获取配置
 */
setting<T extends keyof SeptopusConfig>(key: T): SeptopusConfig[T] | false {
    if (this.setting[key] === undefined) return false;
    return this.setting[key];
}
```

## 辅助方法

```typescript
/**
 * 获取转换系数
 */
getConvert(): number {
    return this.cache.get(['env', 'world', 'accuracy']) as number;
}

/**
 * 获取 Block 尺寸
 */
getSide(): [number, number] {
    return this.cache.get(['env', 'world', 'side']) as [number, number];
}

/**
 * 获取 Block 标高
 */
getElevation(x: number, y: number, world: number, dom_id: string): number {
    return this.cache.get(['block', dom_id, world, `${x}_${y}`, 'elevation']) as number;
}

/**
 * 深度克隆工具
 */
deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}
```

## 相关文档

- [架构概述](./00-overview.md) - 系统总体架构
- [类型定义](./01-types.md) - TypeScript 类型定义
- [Block 系统](./03-block.md) - Block 数据和转换
