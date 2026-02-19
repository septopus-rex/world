# TypeScript 类型定义

本文档包含 Septopus World 重构所需的所有 TypeScript 类型定义，基于 ECS 架构设计。

## 目录

- [ECS 核心类型](#ecs-核心类型)
- [坐标类型](#坐标类型)
- [Block 类型](#block-类型)
- [组件类型](#组件类型)
- [材质与渲染类型](#材质与渲染类型)
- [事件类型](#事件类型)
- [管线类型](#管线类型)
- [资源类型](#资源类型)
- [玩家类型](#玩家类型)
- [效果类型](#效果类型)
- [配置类型](#配置类型)
- [AI 集成类型](#ai-集成类型)

---

## ECS 核心类型

### Entity

```typescript
/**
 * 实体唯一标识
 */
export type EntityId = string;  // 格式: "${x}_${y}_${world}"

/**
 * 实体 - ECS 中的基本对象
 * Block 是最基础的实体单元（16M×16M 空间）
 */
export interface Entity {
    readonly id: EntityId;
    readonly coord: BlockCoord;
    components: Map<string, Component>;
    active: boolean;
    tags: Set<string>;  // 实体标签，用于快速分类查询
}

/**
 * 组件基类 - 纯数据容器，不含逻辑
 */
export interface Component {
    readonly type: string;
}

/**
 * 系统接口 - 处理具有特定组件组合的实体
 */
export interface System {
    readonly name: string;
    readonly requiredComponents: string[];
    priority: number;
    enabled: boolean;
    
    init(context: SystemContext): void;
    update(dt: number, entities: Entity[]): void;
    destroy(): void;
}

/**
 * 系统上下文 - 系统运行时可访问的共享资源
 */
export interface SystemContext {
    readonly engine: EngineInstance;
    readonly registry: RegistryInstance;
    readonly resources: ResourceManagerInstance;
    readonly events: EventBusInstance;
    readonly coordinator: CoordinateServiceInstance;
}

// 实例类型前向声明（避免循环依赖）
export type EngineInstance = import('./core/engine').Engine;
export type RegistryInstance = import('./core/registry').Registry;
export type ResourceManagerInstance = import('./core/resource').ResourceManager;
export type EventBusInstance = import('./core/event').EventBus;
export type CoordinateServiceInstance = import('./core/coordinate').CoordinateService;
```

### 组件注册

```typescript
/**
 * 组件工厂 - 用于注册和创建组件
 */
export interface ComponentFactory<T extends Component = Component> {
    readonly type: string;
    readonly category: ComponentCategory;
    readonly meta: ComponentMeta;
    create(data: any): T;
}

/**
 * 组件分类
 */
export type ComponentCategory = 
    | 'builtin'     // 内置组件（Transform, Renderable, Collider）
    | 'adjunct'     // 附属物组件（Box, Wall, Water, Module）
    | 'plugin';     // 插件组件（外部扩展）

/**
 * 组件元数据
 */
export interface ComponentMeta {
    name: string;
    short: string;          // 缩写，用于 AI 可读格式
    typeId: number;         // 二进制编码类型 ID（u8: 0-255）
    binarySize: number;     // 每项的固定字节数
    desc: string;
    version: string;
    events?: string[];      // 组件可触发的事件
}
```

---

## 坐标类型

### 向量

```typescript
/**
 * 3D 向量
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
 * 2D 向量
 */
export interface Vector2 {
    x: number;
    y: number;
}
```

### 坐标系

```typescript
/**
 * Septopus 坐标（世界空间）
 * X: 东西 (+东, -西)
 * Y: 南北 (+北, -南)
 * Z: 高度 (+向上, -向下)
 * 单位: 毫米（内部精度）
 */
export interface SeptopusCoord {
    x: number;
    y: number;
    z: number;
}

/**
 * Three.js 坐标（渲染空间）
 * X: 水平右
 * Y: 垂直上
 * Z: 水平前
 */
export interface ThreeCoord {
    x: number;
    y: number;
    z: number;
}

/**
 * Block 坐标（网格空间）
 */
export interface BlockCoord {
    x: number;     // [1, 4096]
    y: number;     // [1, 4096]
    world: number; // 世界索引
}

/**
 * 坐标配置
 */
export interface CoordinateConfig {
    side: [number, number];         // Block 尺寸 [width, height]
    accuracy: number;               // 精度系数（毫米/米）
    blockLimit: [number, number];   // Block 坐标范围上限
}

/**
 * 面方位定义
 */
export enum Face {
    Top = 0,      // 上面：从Z轴向下看
    Bottom = 1,   // 下面：从-Z轴向上看
    Front = 2,    // 前面：从南向北看
    Back = 3,     // 后面：从北向南看
    Left = 4,     // 左面：从东向西看
    Right = 5,    // 右面：从西向东看
}
```

---

## Block 类型

### 链上原始数据（二进制格式）

```typescript
/**
 * Block Raw 二进制格式（链上存储）
 *
 * ┌──────────────────────────────────────────────────┐
 * │ Block Header                          8 bytes    │
 * │   version:   u8                                  │
 * │   elevation: u16                                 │
 * │   status:    u8                                  │
 * │   adjCount:  u8  (附属物类型数量)                   │
 * │   flags:     u8  (gameSetting等标志位)              │
 * │   reserved:  u16                                 │
 * ├──────────────────────────────────────────────────┤
 * │ Adjunct Chunk ×N                                 │
 * │   type_id:   u8  (从 Registry 获取数字 ID)         │
 * │   encoding:  u8  (0=raw, 1=rle, 2=delta)         │
 * │   count:     u16 (该类型附属物数量)                  │
 * │   data:      [u8 × binarySize × count]           │
 * ├──────────────────────────────────────────────────┤
 * │ Optional: gameSetting (仅 flags 标记有时)          │
 * └──────────────────────────────────────────────────┘
 */
export type BlockRawBinary = Uint8Array;

/**
 * Block Header 布局
 */
export const BLOCK_HEADER = {
    SIZE: 8,
    VERSION_OFFSET: 0,      // u8
    ELEVATION_OFFSET: 1,    // u16
    STATUS_OFFSET: 3,       // u8
    ADJ_COUNT_OFFSET: 4,    // u8
    FLAGS_OFFSET: 5,        // u8
    RESERVED_OFFSET: 6,     // u16
} as const;

/**
 * Adjunct Chunk Header 布局
 */
export const CHUNK_HEADER = {
    SIZE: 4,
    TYPE_ID_OFFSET: 0,      // u8
    ENCODING_OFFSET: 1,     // u8
    COUNT_OFFSET: 2,        // u16
} as const;

/**
 * 编码方式
 */
export enum ChunkEncoding {
    Raw = 0,        // 无压缩，逐项定长
    RLE = 1,        // 游程编码（用于弦粒子连续重复单元）
    Delta = 2,      // 差分编码（用于位置接近的附属物）
}

/**
 * 附属物二进制编解码器（每个组件类型注册一个）
 */
export interface BinaryCodec<T = any> {
    /** 每项固定字节数 */
    readonly itemSize: number;
    /** STD → 二进制 */
    encode(item: T, buf: Uint8Array, offset: number): void;
    /** 二进制 → STD */
    decode(buf: Uint8Array, offset: number): T;
}

/**
 * Block 占位数据
 */
export const BLOCK_HOLDER_RAW: BlockRawBinary = new Uint8Array([
    1,          // version
    0, 200,     // elevation = 200 (0.2m × 1000)
    1,          // status
    0,          // adjCount
    0,          // flags
    0, 0,       // reserved
]);
```

### 标准中间格式（STD）

```typescript
/**
 * STD 对象基类 - 语义化的中间表示
 * 所有附属物的 STD 格式都包含这些基础属性
 */
export interface STDObject {
    x: number;      // Septopus 坐标系尺寸
    y: number;
    z: number;
    ox: number;     // Block 内偏移
    oy: number;
    oz: number;
    rx: number;     // 旋转
    ry: number;
    rz: number;
    material?: MaterialConfig;
    stop?: boolean;
    animate?: AnimateRef;
    event?: Record<string, EventDefinition>;
}

/**
 * STD Block 数据（继承 STDObject，额外属性）
 */
export interface STDBlock extends STDObject {
    elevation: number;
    status: number;
    game?: any;
}

/**
 * STD 数据集合 - 一个 Block 的完整 STD 数据
 */
export interface STDData {
    block: STDBlock[];
    [adjunctName: string]: STDObject[];
}
```

### Block 缓存数据

```typescript
/**
 * Block 实体数据 - 在引擎内的完整数据表示
 */
export interface BlockEntityData {
    readonly coord: BlockCoord;
    raw: BlockRawData;
    recover: BlockRawData;          // 恢复用副本
    std: STDData;
    renderData: RenderDataMap;
    colliders: ColliderData[];      // 原 stop
    triggers: TriggerData[];
    elevation: number;
    animatingMeshes: Record<string, any[]>;
}
```

---

## 组件类型

### 内置组件

```typescript
/**
 * Transform 组件 - 空间变换
 */
export interface TransformComponent extends Component {
    type: 'transform';
    position: Vector3;      // Septopus 坐标
    rotation: Vector3;      // 弧度
    scale: Vector3;
}

/**
 * Renderable 组件 - 可渲染物体
 */
export interface RenderableComponent extends Component {
    type: 'renderable';
    meshType: MeshType;
    material: MaterialConfig;
    visible: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
}

export type MeshType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'module';

/**
 * Collider 组件 - 碰撞体（原 Stop）
 */
export interface ColliderComponent extends Component {
    type: 'collider';
    shape: ColliderShape;
    size: Vector3;
    offset: Vector3;
    isTrigger: boolean;     // true=触发器，false=阻拦体
}

export type ColliderShape = 'box' | 'sphere' | 'cylinder';

/**
 * Light 组件 - 灯光
 */
export interface LightComponent extends Component {
    type: 'light';
    lightType: 'point' | 'spot' | 'directional' | 'ambient';
    color: number;
    intensity: number;
    range?: number;
    castShadow?: boolean;
}
```

### 附属物组件

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
    Cone = 'cone',
    Ball = 'ball',
}

/**
 * 附属物转换处理器 - 定义 Raw ↔ STD ↔ RenderData 转换
 */
export interface AdjunctTransform {
    rawToStd?: (arr: any[], accuracy: number) => STDObject[];
    stdToRenderData?: (stds: STDObject[], elevation: number) => RenderObject[];
    stdToRaw?: (arr: any, accuracy: number) => any;
    stdToActive?: (stds: STDObject[], elevation: number, accuracy: number) => {
        colliders: ColliderData[];
        helpers: RenderObject[];
    };
    stdToBorder?: (obj: any, elevation: number, accuracy: number) => {
        colliders: ColliderData[];
        helpers: RenderObject[];
    };
    stdTo2D?: (stds: STDObject[], face: number, faces: any) => Render2DObject[];
}

/**
 * 附属物属性操作器 - 定义增删改操作
 */
export interface AdjunctAttribute {
    add?: (param: any, raw: any[]) => any[];
    set?: (param: any, raw: any[], limit?: [number, number, number]) => any[];
    remove?: (param: any, raw: any[]) => any[];
    combine?: (param: any, row?: any) => any;
    revise?: (param: any, row: any, limit: [number, number, number]) => any;
}

/**
 * 附属物菜单处理器 - 编辑器 UI 菜单
 */
export interface AdjunctMenu {
    pop?: (std: STDObject) => MenuItem[];
    sidebar?: (std: STDObject) => Record<string, MenuItem[]>;
}

/**
 * 完整附属物定义
 */
export interface AdjunctDefinition {
    hooks: {
        reg: () => ComponentMeta;
        init?: () => { chain: string; value: any };
        def?: (data: any) => void;
        animate?: (effect: number, param: any) => AnimationData;
    };
    transform: AdjunctTransform;
    attribute?: AdjunctAttribute;
    menu?: AdjunctMenu;
    task?: Record<string, Function>;
}
```

---

## 材质与渲染类型

### 材质

```typescript
/**
 * 材质配置
 */
export interface MaterialConfig {
    texture?: number | number[];    // 纹理资源 ID
    color?: number;                 // 颜色（十六进制）
    repeat?: [number, number];      // 纹理重复
    offset?: [number, number];      // 纹理偏移
    rotation?: number;              // 纹理旋转
    opacity?: number;               // 透明度 [0, 1]
}

/**
 * 阻拦体材质（简化版）
 */
export interface ColliderMaterial {
    opacity: number;
    color: number;
}
```

### 渲染数据

```typescript
/**
 * 渲染参数（3D）
 */
export interface RenderParams {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
}

/**
 * 渲染对象 - Pipeline 最终输出，用于创建渲染器对象
 */
export interface RenderObject {
    type: MeshType;
    index?: number;
    params: RenderParams;
    material?: MaterialConfig;
    animate?: AnimateRef;
    stop?: ColliderMaterial;
    event?: Record<string, EventDefinition>;
    audio?: AdjunctAudio;       // 可选音效
    module?: string;            // 外部模型资源引用
}

/**
 * 附属物音效 - 可挂载在任何 Adjunct 上的 3D 空间音效
 */
export interface AdjunctAudio {
    /** 音效资源 ID（IPFS CID 或本地资源 ID） */
    asset: string;
    /** 播放模式：loop=持续循环, oneshot=播一次, trigger=事件触发 */
    mode: 'loop' | 'oneshot' | 'trigger';
    /** 音量 0-1 */
    volume: number;
    /** 衰减半径（米），超出此距离不播放 */
    range: number;
    /** trigger 模式时，绑定的事件名 */
    event?: string;
}

/**
 * 渲染数据集合
 */
export interface RenderDataMap {
    [adjunctName: string]: RenderObject[];
}

/**
 * 碰撞体数据（运行时）
 */
export interface ColliderData {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    material: ColliderMaterial;
    block: BlockCoord;
    elevation: number;
    side: number;
    origin: {
        type: string;
        index: number;
        adjunct: string;
    };
}

/**
 * 触发器数据（运行时）
 */
export interface TriggerData {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    material: MaterialConfig;
    origin: {
        type: string;
        index: number;
        adjunct: string;
    };
}

/**
 * 2D 渲染对象
 */
export interface Render2DObject {
    type: '  fill' | 'line' | 'sector' | 'text' | 'image';
    index: number;
    params: {
        size: [number, number];
        position: [number, number];
        rotation: number;
    };
    style: {
        color: number;
        opacity?: number;
        width?: number;
    };
}
```

---

## 事件类型

```typescript
/**
 * 事件类别
 */
export enum EventCategory {
    System = 'system',
    Block = 'block',
    Trigger = 'trigger',
    Collider = 'collider',
    Player = 'player',
    Resource = 'resource',
}

/**
 * 事件定义（链上数据中的事件描述）
 */
export interface EventDefinition {
    condition: string;
    todo: string;
}

/**
 * 事件数据载荷
 */
export interface EventData {
    stamp: number;              // 时间戳
    [key: string]: any;
}

/**
 * 事件目标 - 特定对象的事件绑定
 */
export interface EventTarget {
    x: number;
    y: number;
    world: number;
    adjunct: string;
    index: number;
}

/**
 * 事件回调
 */
export type EventCallback<T extends EventData = EventData> = (data: T) => void;

/**
 * 事件监听选项
 */
export interface EventListenerOptions {
    priority?: number;          // 执行优先级，数字越大越先执行
    once?: boolean;             // 是否只触发一次
    filter?: (data: EventData) => boolean;  // 过滤条件
    target?: EventTarget;       // 绑定到特定对象
}

/**
 * 事件监听器
 */
export interface EventListener {
    id: string;
    category: EventCategory;
    event: string;
    callback: EventCallback;
    options: EventListenerOptions;
}
```

---

## 管线类型

```typescript
/**
 * 管线阶段接口
 */
export interface PipelineStage<TInput = any, TOutput = any> {
    readonly name: string;
    process(input: TInput, context: PipelineContext): TOutput;
}

/**
 * 管线上下文 - 各阶段共享的运行时信息
 */
export interface PipelineContext {
    readonly world: number;
    readonly blockCoord: BlockCoord;
    readonly accuracy: number;
    readonly side: [number, number];
    readonly elevation: number;
    registry: RegistryInstance;
    resources: ResourceManagerInstance;
}

/**
 * 预加载需求 - Pipeline 阶段产出的资源需求
 */
export interface PreloadRequirement {
    textures: number[];
    modules: number[];
}
```

---

## 资源类型

```typescript
/**
 * 资源类型
 */
export enum ResourceType {
    Texture = 'texture',
    Module = 'module',
    Avatar = 'avatar',
    Text = 'text',
}

/**
 * 资源状态
 */
export enum ResourceStatus {
    Pending = 'pending',
    Loading = 'loading',
    Loaded = 'loaded',
    Failed = 'failed',
}

/**
 * 资源引用
 */
export interface ResourceRef {
    id: number;
    type: ResourceType;
    status: ResourceStatus;
}

/**
 * 资源数据（IPFS 存储格式）
 */
export interface ResourceData {
    type: ResourceType;
    format: string;             // 文件格式：fbx, png, json ...
    metadata: Record<string, any>;
    data: string;               // Base64 编码
}
```

---

## 玩家类型

```typescript
/**
 * 玩家位置
 */
export interface PlayerLocation {
    block: [number, number];            // 当前所在 Block
    position: [number, number, number]; // Block 内位置
    rotation: [number, number, number]; // 视角方向
    world: number;
    extend: number;                     // 可视范围（Block 数）
    contact: PlayerContact;             // 接触状态
}

/**
 * 玩家接触状态（原 PlayerStop）
 */
export interface PlayerContact {
    grounded: boolean;          // 是否站在碰撞体上
    adjunct: string;            // 接触的附属物名
    index: number;              // 附属物索引
}

/**
 * 玩家身体参数
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
 * 玩家能力值
 */
export interface PlayerCapacity {
    moveSpeed: number;
    rotateSpeed: number;
    jumpHeight: number;
    fallSpeed: number;
    deathHeight: number;
    sprintMultiplier: number;
    strength: number;
}

/**
 * 玩家完整数据
 */
export interface PlayerData {
    location: PlayerLocation;
    address: string;                // 钱包地址
    body: PlayerBody;
    capacity: PlayerCapacity;
    bag: { max: number };
    avatar: { max: number; scale: [number, number, number] };
}
```

---

## 效果类型

```typescript
/**
 * 动画引用（STD 数据中的引用方式）
 */
export type AnimateRef = number | string;

/**
 * 动画时间线步骤
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
    duration: number;       // 0 = 无限循环
    loops: number;          // 0 = 无限循环
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

---

## 配置类型

```typescript
/**
 * 引擎统一配置入口
 */
export interface EngineConfig {
    block: BlockConfig;
    camera: CameraConfig;
    render: RenderConfig;
    world: WorldConfig;
    player: PlayerConfig;
    system: SystemConfig;
}

/**
 * Block 配置
 */
export interface BlockConfig {
    size: [number, number];         // Block 尺寸 [16000, 16000]
    accuracy: number;               // 精度系数 1000
    limit: [number, number];        // Block 坐标上限 [4096, 4096]
    opacity: number;
    texture: number;                // 默认纹理 ID
    color: number;                  // 默认颜色
    repeat: [number, number];       // 默认纹理重复
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
    color: number;                  // 背景色
    speed: number;                  // 目标帧率
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
        interval: number;          // 自动保存间隔（秒）
        key: string;               // 存储键名
    };
    defaultWorld: number;
    hold: number;                  // 占位符显示时长（ms）
    frame: number;                 // 目标帧率
}

/**
 * 系统模式
 */
export enum SystemMode {
    Normal = 'normal',
    Edit = 'edit',
    Game = 'game',
    Ghost = 'ghost',
}
```

---

## 菜单与 UI 类型

```typescript
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
    valid?: (val: any, accuracy: number) => boolean;
    action?: (ev: any) => void;
}

/**
 * 修改任务（编辑模式）
 */
export interface ModifyTask {
    block?: [number, number];
    x?: number;
    y?: number;
    world?: number;
    adjunct: string;
    action: 'add' | 'set' | 'remove';
    param?: any;
    limit?: [number, number, number];
}

/**
 * 任务执行结果
 */
export interface TaskResult {
    success: boolean;
    error?: string;
}
```

---

## 类型守卫

```typescript
/**
 * 检查是否为 Block 坐标
 */
export function isBlockCoord(coord: any): coord is BlockCoord {
    return (
        typeof coord?.x === 'number' &&
        typeof coord?.y === 'number' &&
        typeof coord?.world === 'number'
    );
}

/**
 * 检查是否为 Septopus 坐标
 */
export function isSeptopusCoord(coord: any): coord is SeptopusCoord {
    return (
        typeof coord?.x === 'number' &&
        typeof coord?.y === 'number' &&
        typeof coord?.z === 'number'
    );
}

/**
 * 创建只读向量
 */
export function createReadonlyVector(x: number, y: number, z: number): ReadonlyVector3 {
    return Object.freeze({ x, y, z });
}
```

---

## AI 集成类型

```typescript
/**
 * AI 语义化输入格式 - 对 Raw 紧凑编码的友好封装
 */
export interface AIInput {
    block: {
        elevation: number;
        status: number;
    };
    adjuncts: {
        [adjunctName: string]: any[];
    };
    string_particle?: {
        cellSize: { x: number; y: number; z: number };
        theme: string | number;
        cells: AIParticleCell[];
    };
}

export interface AIParticleCell {
    position: { x: number; y: number; z: number };
    faces: {
        top: AIFaceConfig;
        bottom: AIFaceConfig;
        front: AIFaceConfig;
        back: AIFaceConfig;
        left: AIFaceConfig;
        right: AIFaceConfig;
    };
}

export interface AIFaceConfig {
    state: 'open' | 'closed';
    variant?: string | number;
}

/**
 * AI 输入适配器接口
 */
export interface AIInputAdapter {
    toRaw(input: AIInput): BlockRawData;
    fromRaw(raw: BlockRawData): AIInput;
    getSchema(): JSONSchema;
}

/**
 * AI 验证结果
 */
export interface ValidationResult {
    valid: boolean;
    errors: { code: string; message: string; path?: string }[];
    warnings: { code: string; message: string }[];
    suggestions: string[];
}

/**
 * AI 验证器接口
 */
export interface AIValidator {
    validateSchema(input: AIInput): ValidationResult;
    validateConnectivity(cells: any[]): ValidationResult;
    validatePhysics(adjuncts: STDData): ValidationResult;
    validateTriggers(triggers: TriggerData[], adjuncts: STDData): ValidationResult;
}

/**
 * AI 世界查询接口
 */
export interface AIWorldQuery {
    describeBlock(coord: BlockCoord): BlockDescription;
    describeRegion(from: BlockCoord, to: BlockCoord): RegionDescription;
    listResources(type: ResourceType): ResourceCatalog[];
    listVariants(theme?: number): VariantCatalog;
    getInputSchema(): JSONSchema;
}

export interface BlockDescription {
    coord: BlockCoord;
    elevation: number;
    adjuncts: { type: string; count: number; summary: string }[];
}

export interface RegionDescription {
    blocks: BlockDescription[];
    connectivity: string;
}

export interface ResourceCatalog {
    id: number;
    type: ResourceType;
    name: string;
    tags: string[];
}

export interface VariantCatalog {
    theme: string;
    faces: Record<string, { open: string[]; closed: string[] }>;
}

export type JSONSchema = Record<string, any>;
```

---

## 相关文档

- [架构概述](./00-overview.md) - 系统总体架构
- [框架核心](./02-framework.md) - 核心模块详细说明
- [弦粒子系统](./03-string-particle.md) - 空间内容快速构建
- [AI 集成](./04-ai-integration.md) - AI 驱动的 3D 游戏开发
