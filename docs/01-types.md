# TypeScript 类型定义

本文档包含 Septopus World 重构所需的所有 TypeScript 类型定义。

## 目录

- [核心数据类型](#核心数据类型)
- [Block 类型](#block-类型)
- [附属物类型](#附属物类型)
- [渲染类型](#渲染类型)
- [玩家类型](#玩家类型)
- [事件类型](#事件类型)
- [坐标类型](#坐标类型)
- [效果类型](#效果类型)
- [组件接口](#组件接口)
- [配置类型](#配置类型)

## 核心数据类型

### Vector3

```typescript
/**
 * 3D 向量坐标
 */
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

/**
 * 只读 3D 向量
 */
export type ReadonlyVector3 = Readonly<Vector3>;

/**
 * 2D 向量坐标
 */
export interface Vector2 {
    x: number;
    y: number;
}
```

### BlockRawData

```typescript
/**
 * Block 原始数据（链上存储格式）
 * 索引:
 * 0: elevation - Block 标高
 * 1: status - Block 状态
 * 2: adjuncts - 附属物数组 [[short, [data]], ...]
 * 3: gameSetting - 游戏设置（可选）
 */
export type BlockRawData = [
    number,              // elevation
    number,              // status
    [string, any[]][],   // adjuncts
    any?                 // gameSetting
];

/**
 * Block 占位数据
 */
export const BLOCK_HOLDER_RAW: BlockRawData = [0.2, 1, []];
```

### BlockSTDData

```typescript
/**
 * STD 格式附属物数据
 */
export interface STDAdjunct {
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
 * STD 格式 Block 数据
 */
export interface STDBlock {
    x: number;
    y: number;
    z: number;
    ox: number;
    oy: number;
    oz: number;
    rx: number;
    ry: number;
    rz: number;
    elevation: number;
    status: number;
    material?: MaterialConfig;
    game?: any;
}

/**
 * STD 数据（标准中间格式）
 */
export interface STDData {
    block: STDBlock[];
    [adjunctName: string]: STDAdjunct[];
}
```

### ThreeData

```typescript
/**
 * Three.js 渲染数据
 */
export interface ThreeObject {
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
export interface ThreeDataMap {
    [adjunctName: string]: ThreeObject[];
}
```

## Block 类型

```typescript
/**
 * Block 坐标
 */
export interface BlockCoord {
    x: number;
    y: number;
    world: number;
}

/**
 * Block 数据
 */
export interface BlockData {
    x: number;
    y: number;
    world: number;
    raw: BlockRawData;
    recover: BlockRawData;
    std: STDData;
    three: ThreeDataMap;
    stop: StopData[];
    trigger: TriggerData[];
    elevation: number;
    animate: Record<string, THREE.Mesh[]>;
}

/**
 * Block 持有者数据
 */
export interface BlockHolder {
    x: number;
    y: number;
    world: number;
    data: BlockRawData;
    owner: string;
    loading: boolean;
}
```

## 附属物类型

```typescript
/**
 * 附属物类型枚举
 */
export enum AdjunctType {
    Box = 'box',
    Wall = 'wall',
    Water = 'water',
    Light = 'light',
    Trigger = 'trigger',
    Stop = 'stop',
    Module = 'module',
}

/**
 * 附属物数据
 */
export interface AdjunctData {
    type: AdjunctType;
    name: string;
    short: string;
    desc: string;
    version: string;
    events: string[];
    config?: AdjunctConfig;
}

/**
 * 附属物配置
 */
export interface AdjunctConfig {
    color?: number;
    opacity?: number;
    stop?: {
        opacity: number;
        color: number;
    };
}
```

## 渲染类型

```typescript
/**
 * 渲染参数
 */
export interface RenderParams {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
}

/**
 * 材质配置
 */
export interface MaterialConfig {
    texture?: number | number[];
    color?: number;
    repeat?: [number, number];
    offset?: [number, number];
    rotation?: number;
    opacity?: number;
}

/**
 * 阻拦体配置
 */
export interface StopConfig {
    opacity: number;
    color: number;
}

/**
 * 阻拦体数据
 */
export interface StopData {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    material: StopConfig;
    block: BlockCoord;
    elevation: number;
    side: number;
    orgin: {
        type: string;
        index: number;
        adjunct: string;
    };
}

/**
 * 触发器数据
 */
export interface TriggerData {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    material: MaterialConfig;
    orgin: {
        type: string;
        index: number;
        adjunct: string;
    };
}
```

## 玩家类型

```typescript
/**
 * 玩家位置
 */
export interface PlayerLocation {
    block: [number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    world: number;
    extend: number;
    stop: PlayerStop;
}

/**
 * 玩家阻拦状态
 */
export interface PlayerStop {
    on: boolean;
    adjunct: string;
    index: number;
}

/**
 * 玩家身体
 */
export interface PlayerBody {
    height: number;
    shoulder: number;
    chest: number;
    section: [number, number, number, number];
    head: [number, number];
    hand: [number, number, number];
    leg: [number, number, number];
}

/**
 * 玩家能力
 */
export interface PlayerCapacity {
    move: number;
    rotate: number;
    span: number;
    squat: number;
    jump: number;
    death: number;
    speed: number;
    strength: number;
}

/**
 * 玩家数据
 */
export interface PlayerData {
    location: PlayerLocation;
    address: string;
    body: PlayerBody;
    capacity: PlayerCapacity;
    bag: { max: number };
    avatar: { max: number; scale: [number, number, number] };
}
```

## 事件类型

```typescript
/**
 * 事件类型枚举
 */
export enum SystemMode {
    Normal = 'normal',
    Edit = 'edit',
    Game = 'game',
    Ghost = 'ghost',
}

/**
 * 资源类型
 */
export enum ResourceType {
    Texture = 'texture',
    Module = 'module',
}

/**
 * 事件类别
 */
export enum EventCategory {
    System = 'system',
    Block = 'block',
    Trigger = 'trigger',
    Stop = 'stop',
    Player = 'player',
    Module = 'module',
}

/**
 * 事件定义
 */
export interface EventDefinition {
    condition: string;
    todo: string;
}

/**
 * 事件回调
 */
export type EventCallback<T = any> = (data: T) => void;

/**
 * 事件目标
 */
export interface EventTarget {
    x: number;
    y: number;
    world: number;
    adjunct: string;
    index: number;
}

/**
 * 事件数据
 */
export interface EventData {
    stamp: number;
    [key: string]: any;
}
```

## 坐标类型

```typescript
/**
 * Septopus 坐标
 */
export interface SeptopusCoord {
    x: number;  // 东西 (+东, -西)
    y: number;  // 南北 (+北, -南)
    z: number;  // 高度 (+向上, -向下)
}

/**
 * Three.js 坐标
 */
export interface ThreeCoord {
    x: number;  // 水平右
    y: number;  // 垂直上
    z: number;  // 水平前
}

/**
 * 坐标转换配置
 */
export interface CoordinateConfig {
    side: [number, number];
    accuracy: number;
    blockLimit: [number, number];
}

/**
 * 坐标变换结果
 */
export interface CoordinateTransform {
    position: SeptopusCoord;
    threePosition: ThreeCoord;
}
```

## 效果类型

```typescript
/**
 * 动画时间线
 */
export interface AnimationTimeline {
    type: 'rotate' | 'move' | 'scale' | 'color' | 'opacity';
    mode: 'add' | 'set';
    axis: 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'XYZ';
    time: number | [number, number];
    value: number | ((n: number) => number);
}

/**
 * 动画数据
 */
export interface AnimationData {
    name: string;
    duration: number;  // 0 = 无限循环
    loops: number;     // 0 = 无限循环
    category: 'mesh' | 'camera' | 'scene';
    pending?: number | [number, number];
    timeline: AnimationTimeline[];
}

/**
 * 效果参数
 */
export interface EffectParams {
    axis?: { x: boolean; y: boolean; z: boolean };
    value?: number | ((n: number) => number);
    color?: number;
    opacity?: number;
    duration?: number;
    height?: number;
    convert?: number;
    skip?: boolean;
}
```

## 组件接口

```typescript
/**
 * 组件注册信息
 */
export interface ComponentRegistration {
    name: string;
    category: 'system' | 'render' | 'controller' | 'adjunct' | 'datasource' | 'plugin';
    desc: string;
    version: string;
    short?: string;
    events?: string[];
}

/**
 * 组件 Hooks
 */
export interface ComponentHooks {
    reg: () => ComponentRegistration;
    init?: () => { chain: string; value: any };
    def?: (data: any) => void;
    animate?: (effect: number, param: any) => AnimationData;
}

/**
 * 转换处理器
 */
export interface TransformHandlers {
    raw_std?: (arr: any[], cvt: number) => any[];
    std_3d?: (stds: any[], va: number) => any[];
    std_active?: (stds: any[], va: number, cvt: number) => { stop: any[]; helper: any[] };
    std_border?: (obj: any, va: number, cvt: number) => { stop: any[]; helper: any[] };
    std_raw?: (arr: any, cvt: number) => any;
    std_box?: (obj: any) => any;
    std_2d?: (stds: any[], face: number, faces: any) => any[];
}

/**
 * 属性处理器
 */
export interface AttributeHandlers {
    add?: (param: any, raw: any[]) => any[];
    set?: (param: any, raw: any[], limit?: [number, number, number]) => any[];
    remove?: (param: any, raw: any[]) => any[];
    combine?: (param: any, row?: any) => any;
    revise?: (param: any, row: any, limit: [number, number, number]) => any;
}

/**
 * 菜单处理器
 */
export interface MenuHandlers {
    pop?: (std: any) => MenuItem[];
    sidebar?: (std: any) => Record<string, MenuItem[]>;
}

/**
 * 组件接口
 */
export interface IComponent {
    hooks: ComponentHooks;
    transform?: TransformHandlers;
    attribute?: AttributeHandlers;
    menu?: MenuHandlers;
    task?: Record<string, Function>;
}

/**
 * 菜单项
 */
export interface MenuItem {
    type: 'button' | 'number' | 'string' | 'select';
    label: string;
    icon?: string;
    key?: string;
    value?: any;
    desc?: string;
    valid?: (val: any, cvt: number) => boolean;
    action?: (ev: any) => void;
}
```

## 配置类型

```typescript
/**
 * Block 配置
 */
export interface BlockConfig {
    size: [number, number];
    accuracy: number;
    limit: [number, number];
    opacity: number;
    texture: number;
    color: number;
    repeat: [number, number];
    active: {
        height: number;
        color: {
            north: number;
            south: number;
            east: number;
            west: number;
        };
    };
    basic: number;
}

/**
 * 摄像机配置
 */
export interface CameraConfig {
    fov: number;
    near: number;
    far: number;
    width: number;
    height: number;
    shadow: boolean;
}

/**
 * 渲染配置
 */
export interface RenderConfig {
    fov: number;
    color: number;
    speed: number;
    sun: {
        intensity: number;
        color: number;
        ground: number;
    };
}

/**
 * 世界配置
 */
export interface WorldConfig {
    side: [number, number];
    accuracy: number;
    block: {
        limit: [number, number];
    };
    common: any;
}

/**
 * 玩家配置
 */
export interface PlayerConfig {
    height: number;
    eyeHeight: number;
    moveSpeed: number;
    rotateSpeed: number;
    jumpHeight: number;
}

/**
 * 系统配置
 */
export interface SystemConfig {
    autosave: {
        interval: number;
        key: string;
    };
    defaultWorld: number;
    hold: number;
    frame: number;
}

/**
 * 完整配置
 */
export interface SeptopusConfig {
    block: BlockConfig;
    camera: CameraConfig;
    render: RenderConfig;
    world: WorldConfig;
    player: PlayerConfig;
    system: SystemConfig;
}
```

## 类型导出

```typescript
/**
 * 统一导出所有类型
 */
export * from './types';
```

## 类型使用示例

### 定义 Block 数据

```typescript
import type { BlockData, BlockRawData, STDData, ThreeDataMap } from './types';

const block: BlockData = {
    x: 2025,
    y: 619,
    world: 0,
    raw: [1.5, 1, []],
    recover: [1.5, 1, []],
    std: {
        block: [{ x: 16000, y: 16000, z: 1500, ... }],
    },
    three: {
        block: [{ type: 'box', params: { ... }, material: { ... } }],
    },
    stop: [],
    trigger: [],
    elevation: 1500,
    animate: {},
};
```

### 定义组件

```typescript
import type { IComponent, ComponentRegistration, TransformHandlers } from './types';

const boxComponent: IComponent = {
    hooks: {
        reg: (): ComponentRegistration => ({
            name: 'box',
            category: 'adjunct',
            desc: 'Basic box adjunct',
            version: '1.0.0',
            short: 'bx',
            events: ['in', 'out', 'touch'],
        }),
    },
    transform: {
        raw_std: (arr: any[], cvt: number) => {
            // 转换逻辑
            return [];
        },
        std_3d: (stds: any[], va: number) => {
            // 转换逻辑
            return [];
        },
    },
};
```

### 处理事件

```typescript
import type { EventCallback, EventData, EventTarget } from './types';

const callback: EventCallback = (data: EventData) => {
    console.log('Event triggered:', data.stamp);
};

const target: EventTarget = {
    x: 2025,
    y: 619,
    world: 0,
    adjunct: 'block',
    index: 0,
};
```

## 类型检查工具

```typescript
/**
 * 检查是否为 Block 坐标
 */
export function isBlockCoord(coord: any): coord is BlockCoord {
    return (
        typeof coord.x === 'number' &&
        typeof coord.y === 'number' &&
        typeof coord.world === 'number'
    );
}

/**
 * 检查是否为 Septopus 坐标
 */
export function isSeptopusCoord(coord: any): coord is SeptopusCoord {
    return (
        typeof coord.x === 'number' &&
        typeof coord.y === 'number' &&
        typeof coord.z === 'number'
    );
}

/**
 * 检查是否为 Three.js 坐标
 */
export function isThreeCoord(coord: any): coord is ThreeCoord {
    return (
        typeof coord.x === 'number' &&
        typeof coord.y === 'number' &&
        typeof coord.z === 'number'
    );
}

/**
 * 创建只读向量
 */
export function createReadonlyVector(x: number, y: number, z: number): ReadonlyVector3 {
    return Object.freeze({ x, y, z });
}
```

## 相关文档

- [架构概述](./00-overview.md) - 系统总体架构
- [框架核心](./02-framework.md) - Framework 详细说明
- [Block 系统](./03-block.md) - Block 数据和转换
