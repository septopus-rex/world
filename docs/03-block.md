# Block 系统

Block 是 Septopus World 的基础构成单元，每个 Block 为 16M×16M 的空间，由单一拥有者控制，可以包含多个附属物。

## 目录

- [Block 数据结构](#block-数据结构)
- [Block 组件](#block-组件)
- [数据转换](#数据转换)
- [Block 属性操作](#block-属性操作)
- [Block 菜单](#block-菜单)
- [Block 事件](#block-事件)
- [Block 加载流程](#block-加载流程)
- [Block 缓存管理](#block-缓存管理)
- [Block 坐标计算](#block-坐标计算)

## Block 数据结构

### Raw 数据（链上存储格式）

```typescript
/**
 * Block 原始数据索引
 */
enum BlockIndex {
    Elevation = 0,  // Block 标高
    Status = 1,     // Block 状态
    Adjuncts = 2,   // 附属物数组
    GameSetting = 3 // 游戏设置（可选）
}

/**
 * Block 原始数据类型
 */
type BlockRawData = [
    number,               // elevation - Block 标高（米）
    number,               // status - Block 状态
    [string, any[]][],    // adjuncts - 附属物数组 [[short, [data]], ...]
    any?                   // gameSetting - 游戏设置（可选）
];

/**
 * Block 占位数据
 */
const BLOCK_HOLDER_RAW: BlockRawData = [0.2, 1, []];

/**
 * Block 占位者数据
 */
interface BlockHolder {
    x: number;
    y: number;
    world: number;
    data: BlockRawData;
    owner: string;
    loading: boolean;
}
```

### STD 数据（标准中间格式）

```typescript
/**
 * STD 格式 Block 数据
 */
interface STDBlock {
    x: number;              // 尺寸 X（毫米）
    y: number;              // 尺寸 Y（毫米）
    z: number;              // 尺寸 Z（毫米）
    ox: number;             // 中心 X 偏移（毫米）
    oy: number;             // 中心 Y 偏移（毫米）
    oz: number;             // 中心 Z 偏移（毫米）
    rx: number;             // X 旋转（弧度）
    ry: number;             // Y 旋转（弧度）
    rz: number;             // Z 旋转（弧度）
    elevation: number;      // Block 标高（米）
    status: number;         // Block 状态
    material?: MaterialConfig;
    game?: any;
}

/**
 * STD 格式附属物数据
 */
interface STDAdjunct {
    x: number;
    y: number;
    z: number;
    ox: number;
    oy: number;
    oz: number;
    rx: number;
    ry: number;
    rz: number;
    material?: MaterialConfig;
    stop?: boolean;
    animate?: AnimationData;
    event?: Record<string, EventDefinition>;
}

/**
 * STD 数据映射
 */
interface STDData {
    block: STDBlock[];
    [adjunctName: string]: STDAdjunct[];
}
```

### 3D 数据（Three.js 渲染格式）

```typescript
/**
 * Three.js 渲染对象
 */
interface ThreeObject {
    type: 'box' | 'sphere' | 'cylinder' | 'plane';
    params: RenderParams;
    material?: MaterialConfig;
    animate?: AnimationData;
    stop?: StopConfig;
    event?: Record<string, EventDefinition>;
    index?: number;
    module?: string;
}

/**
 * Three.js 数据映射
 */
interface ThreeDataMap {
    block: ThreeObject[];
    [adjunctName: string]: ThreeObject[];
}
```

## Block 组件

### Block 组件结构

```typescript
import type { IComponent, TransformHandlers, AttributeHandlers, MenuHandlers } from './types';

const blockComponent: IComponent = {
    hooks: {
        reg: () => ({
            name: 'block',
            category: 'system',
            desc: 'Block decoder, basic component of system.',
            version: '1.0.0',
            events: ['in', 'out', 'hold', 'stop', 'loaded', 'cross', 'unload'],
        }),
    },
    transform: {
        raw_std: rawToStd,
        std_3d: stdTo3D,
        std_active: stdToActive,
        std_border: stdToBorder,
        std_raw: stdToRaw,
        std_box: stdToBox,
        std_2d: stdTo2D,
    } as TransformHandlers,
    attribute: {
        load: blockLoad,
        unload: blockUnload,
        set: blockSet,
        backup: blockBackup,
        recover: blockRecover,
    } as AttributeHandlers,
    menu: {
        pop: blockPop,
        sidebar: blockSidebar,
    } as MenuHandlers,
    task: {},
};
```

## 数据转换

### Raw → STD 转换

```typescript
/**
 * Raw 数据转换为 STD 数据
 */
function rawToStd(obj: BlockRawData, cvt: number, side: [number, number]): STDBlock[] {
    const elevation = obj[BlockIndex.Elevation];
    const status = obj[BlockIndex.Status];
    const [sideX, sideY] = side;
    const hs = 0.5 * sideX; // 半边长
    const bh = 0.1 * cvt;  // Block 默认厚度（毫米）

    const block: STDBlock = {
        x: sideX,
        y: sideY,
        z: elevation * cvt + bh,
        ox: hs,
        oy: hs,
        oz: elevation * cvt * 0.5 - 0.5 * bh,
        rx: 0,
        ry: 0,
        rz: 0,
        status,
        elevation: elevation * cvt,
        material: {
            texture: 206,
            color: 0xdddddd,
            repeat: [10, 10],
        },
    };

    // 游戏设置
    if (obj[BlockIndex.GameSetting] !== undefined) {
        block.game = obj[BlockIndex.GameSetting];
    }

    return [block];
}
```

### STD → 3D 转换

```typescript
/**
 * STD 数据转换为 3D 数据
 */
function stdTo3D(bks: STDBlock[]): ThreeObject[] {
    const arr: ThreeObject[] = [];

    for (const row of bks) {
        arr.push({
            type: 'box',
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

### 编辑边框转换

```typescript
/**
 * STD 数据转换为编辑边框数据
 */
function stdToBorder(obj: STDBlock[], va: number, cvt: number): { stop: any[]; helper: any[] } {
    const ds = { stop: [], helper: [] };
    const config = {
        height: 0.5, // 边框高度（米）
        color: {
            north: 0xe11d48,
            south: 0x6b7280,
            east: 0x3b82f6,
            west: 0x10b981,
        },
    };

    const h = config.height * cvt;
    const row = obj[0];
    const cc = 0.5 * row.x; // 中心点
    const oz = va + h * 0.5;
    const w = 0.02 * cvt; // 边框线宽

    // 四个方向的边框
    const arr = [
        // 南边框
        {
            type: 'box',
            params: {
                size: [row.x, w, h],
                position: [cc, 0, oz],
                rotation: [0, 0, 0],
            },
            material: { color: config.color.south },
        },
        // 东边框
        {
            type: 'box',
            params: {
                size: [w, row.y, h],
                position: [cc + cc, cc, oz],
                rotation: [0, 0, 0],
            },
            material: { color: config.color.east },
        },
        // 北边框
        {
            type: 'box',
            params: {
                size: [row.x, w, h],
                position: [cc, cc + cc, oz],
                rotation: [0, 0, 0],
            },
            material: { color: config.color.north },
        },
        // 西边框
        {
            type: 'box',
            params: {
                size: [w, row.y, h],
                position: [0, cc, oz],
                rotation: [0, 0, 0],
            },
            material: { color: config.color.west },
        },
    ];

    ds.helper = arr;
    return ds;
}
```

## Block 属性操作

### 加载 Block

```typescript
/**
 * 加载 Block
 */
function blockLoad(x: number, y: number, param: any, world: number, dom_id: string): void {
    const world = Framework.cache.get(['env', 'player', 'location', 'world']) as number;
    World.load(dom_id, world, x, y);
}
```

### 卸载 Block

```typescript
/**
 * 卸载 Block
 */
function blockUnload(x: number, y: number, param: any, world: number, dom_id: string): void {
    World.unload(dom_id, world, x, y);
}
```

### 设置 Block

```typescript
/**
 * 设置 Block 参数
 */
function blockSet(x: number, y: number, param: any, world: number, dom_id: string): void {
    // TODO: 实现设置逻辑
}
```

### 备份 Block

```typescript
/**
 * 备份 Block 数据
 */
function blockBackup(x: number, y: number, param: any, world: number, dom_id: string): boolean {
    const key = `${x}_${y}`;
    const chain = ['modified', dom_id, world, key];

    if (!Framework.cache.exist(chain)) {
        Framework.cache.set(chain, { final: null, backup: null });
    }

    const backupChain = ['block', dom_id, world, key, 'raw'];
    const backupData = Framework.cache.get(backupChain) as BlockRawData;
    if (!backupData || 'error' in backupData) {
        return false;
    }

    const backup = Framework.deepClone(backupData);
    Framework.cache.set([...chain, 'backup'], backup);
    return true;
}
```

### 恢复 Block

```typescript
/**
 * 恢复 Block 数据
 */
function blockRecover(x: number, y: number, param: any, world: number, dom_id: string): void {
    // TODO: 实现恢复逻辑
}
```

## Block 菜单

### 弹出菜单

```typescript
/**
 * Block 弹出菜单
 */
function blockPop(std: STDBlock): MenuItem[] {
    return [
        {
            type: 'button',
            label: 'Info',
            icon: '',
            action: (ev) => {
                console.log(ev);
            },
        },
        {
            type: 'button',
            label: 'Remove',
            icon: '',
            action: (ev) => {
                console.log(ev);
            },
        },
    ];
}
```

### 侧边栏菜单

```typescript
/**
 * Block 侧边栏菜单
 */
function blockSidebar(std: STDBlock): Record<string, MenuItem[]> {
    return {
        elevation: [
            {
                type: 'number',
                key: 'elevation',
                value: std.z,
                label: '',
                desc: 'Elevation of block',
                valid: (val) => !isNaN(val) && val >= 0,
            },
        ],
        status: [
            {
                type: 'number',
                key: 'status',
                value: std.status,
                label: '',
                desc: 'Status of block',
                valid: (val) => !isNaN(val) && val >= 0,
            },
        ],
    };
}
```

## Block 事件

### 支持的事件类型

```typescript
/**
 * Block 事件列表
 */
const BLOCK_EVENTS = [
    'in',       // 进入 Block
    'out',      // 离开 Block
    'hold',     // 停留在 Block
    'stop',     // 被阻挡
    'loaded',   // 加载完成
    'cross',    // 穿过 Block 边界
    'unload',   // 卸载
] as const;
```

### 事件触发示例

```typescript
import { EventManager } from './event-system';

// Block 加载完成
EventManager.trigger('block', 'loaded', {
    stamp: Date.now(),
}, {
    x, y, world,
    index: 0,
    adjunct: 'block',
});

// 进入 Block
EventManager.trigger('block', 'in', {
    stamp: Date.now(),
}, {
    x, y, world,
    index: 0,
    adjunct: 'block',
});

// 被阻挡
EventManager.trigger('block', 'stop', {
    stamp: Date.now(),
}, [x, y]);
```

## Block 加载流程

### 从链加载

```typescript
/**
 * 启动 Block 加载
 */
World.launch(
    dom_id: string,
    x: number,
    y: number,
    ext: number,
    world: number,
    limit: [number, number],
    callback?: (success: boolean) => void,
    config?: any
): void {
    DataSource.view(x, y, ext, world, (map: BlockMap) => {
        if (map.loaded !== undefined && !map.loaded) {
            // 1. 添加加载队列
            delete map.loaded;
            World.loadingBlockQueue(map, dom_id);

            // 2. 保存数据
            const failed = World.save(dom_id, world, map, worldInfo);
            if (failed) return;

            // 3. 构建占位符
            const range = { x, y, ext, world, container: dom_id };
            World.load(range, (pre) => {
                // 4. 预加载资源
                World.prefetch(pre.texture, pre.module, (failed) => {
                    return callback?.(true);
                });
            }, config);
        }
    });
}

/**
 * Block 映射数据
 */
interface BlockMap {
    loaded?: boolean;
    [key: string]: any;
}
```

### Block 加载队列处理

```typescript
/**
 * 检查 Block 加载队列
 */
World.checkBlock = (): void => {
    const queueName = 'block_loading';
    const queue = Framework.queue.get(queueName);
    if ('error' in queue || queue.length === 0) return;

    const todo = queue[0];
    const { x, y, world, container } = todo;

    // 检查数据是否加载
    const chain = ['block', container, world, todo.key, 'raw'];
    const data = Framework.cache.get(chain);
    if ('error' in data || data.loading) return;

    // 构建 Block 数据
    const range = { x, y, world, container };
    World.load(range, (pre) => {
        // 触发 block.loaded 事件
        const evt = { x, y, world };
        EventManager.trigger('block', 'loaded', evt, {
            x, y, world,
            index: 0,
            adjunct: 'block',
            stamp: Date.now(),
        });

        // 加载所需资源
        World.loadingResourceQueue(pre, x, y, world, container);

        // 设置游戏模式按钮
        if (pre.game && pre.game.length !== 0) {
            World.updateGame(pre.game);
        }

        // 刷新渲染
        if (!World.outofRange(x, y)) {
            Renderer.show(container, [x, y, world]);
        }
    }, {});

    queue.shift();
    runtime.counter.block--;
    if (runtime.counter.block === 0) {
        EventManager.trigger('system', 'launch', { stamp: Date.now() });
    }
};
```

## Block 缓存管理

### Block 数据层次

```typescript
/**
 * Block 缓存数据结构
 */
interface BlockCacheData {
    raw: BlockRawData;      // 链上原始数据
    recover: BlockRawData;   // 恢复数据
    std: STDData;           // 标准中间数据
    three: ThreeDataMap;    // Three.js 渲染数据
    stop: StopData[];       // 阻拦体数据
    trigger: TriggerData[]; // 触发器数据
    elevation: number;      // 标高
    animate: Record<string, THREE.Mesh[]>; // 动画数据映射
}
```

### 清理 Block 数据

```typescript
/**
 * 清理 Block 数据
 */
function cleanBlocks(blocks: [number, number][], world: number, dom_id: string): boolean {
    const chain = ['block', dom_id, world];
    const blockCache = Framework.cache.get(chain) as Record<string, BlockCacheData>;

    for (const [x, y] of blocks) {
        const key = `${x}_${y}`;
        delete blockCache[key];
    }

    return true;
}
```

## Block 坐标计算

### 世界坐标到 Block 内坐标

```typescript
/**
 * 世界坐标转换为 Block 内坐标
 */
function worldToBlockIn(worldX: number, worldY: number): [number, number] {
    const blockSize = 16000;
    return [
        worldX % blockSize,
        worldY % blockSize,
    ];
}
```

### Block 内坐标到世界坐标

```typescript
/**
 * Block 内坐标转换为世界坐标
 */
function blockInToWorld(blockX: number, blockY: number, inX: number, inY: number): [number, number] {
    const blockSize = 16000;
    return [
        (blockX - 1) * blockSize + inX,
        (blockY - 1) * blockSize + inY,
    ];
}
```

### Block 中心点计算

```typescript
/**
 * 计算 Block 中心点
 */
function getBlockCenter(blockX: number, blockY: number): [number, number] {
    const blockSize = 16000;
    return [
        (blockX - 1) * blockSize + blockSize / 2,
        (blockY - 1) * blockSize + blockSize / 2,
    ];
}
```

## 相关文档

- [架构概述](./00-overview.md) - 系统总体架构
- [类型定义](./01-types.md) - TypeScript 类型定义
- [Framework 核心](./02-framework.md) - 框架核心
- [附属物系统](./04-adjunct.md) - 附属物组件
