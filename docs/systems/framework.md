# 核心模块详细说明

本文档详细说明 Septopus World 重构后核心引擎层的各个模块。原 `framework.js` 的"上帝对象"职责被拆分为以下独立模块。

## 目录

- [Engine - 引擎入口](#engine---引擎入口)
- [Registry - 注册中心](#registry---注册中心)
- [ResourceManager - 资源管理](#resourcemanager---资源管理)
- [SceneManager - 场景管理](#scenemanager---场景管理)
- [Pipeline - 数据转换管线](#pipeline---数据转换管线)
- [Scheduler - 帧循环与调度](#scheduler---帧循环与调度)
- [CoordinateService - 坐标服务](#coordinateservice---坐标服务)
- [StateMachine - 模式管理](#statemachine---模式管理)
- [AIAdapter - AI 适配层](#aiadapter---ai-适配层)

---

## Engine - 引擎入口

引擎的全局入口，负责初始化各模块和管理生命周期。

```typescript
import type { EngineConfig, SystemMode } from './types';

class Engine {
    readonly registry: Registry;
    readonly resources: ResourceManager;
    readonly scenes: SceneManager;
    readonly pipeline: Pipeline;
    readonly scheduler: Scheduler;
    readonly events: EventBus;
    readonly coordinate: CoordinateService;
    readonly state: StateMachine<SystemMode>;

    private config: EngineConfig;
    private systems: System[] = [];

    /**
     * 创建引擎实例
     */
    static create(config: EngineConfig): Engine {
        const engine = new Engine(config);
        engine.initModules();
        engine.registerBuiltinSystems();
        return engine;
    }

    /**
     * 初始化各核心模块
     */
    private initModules(): void {
        // 1. 初始化注册中心
        this.registry.init();

        // 2. 初始化坐标服务
        this.coordinate.init({
            side: this.config.block.size,
            accuracy: this.config.block.accuracy,
            blockLimit: this.config.block.limit,
        });

        // 3. 初始化资源管理器
        this.resources.init();

        // 4. 初始化场景管理器
        this.scenes.init(this.config.camera, this.config.render);

        // 5. 初始化调度器
        this.scheduler.init(this.config.system.frame);
    }

    /**
     * 注册内置系统
     */
    private registerBuiltinSystems(): void {
        this.addSystem(new RenderSystem());
        this.addSystem(new PhysicsSystem());
        this.addSystem(new InputSystem());
        this.addSystem(new EventSystem());
        this.addSystem(new TriggerSystem());
        this.addSystem(new SkySystem());
    }

    /**
     * 添加自定义系统
     */
    addSystem(system: System): void {
        this.systems.push(system);
        this.systems.sort((a, b) => b.priority - a.priority);
        system.init(this.createSystemContext());
    }

    /**
     * 创建系统上下文
     */
    private createSystemContext(): SystemContext {
        return {
            engine: this,
            registry: this.registry,
            resources: this.resources,
            events: this.events,
            coordinator: this.coordinate,
        };
    }

    /**
     * 获取配置
     */
    getConfig<K extends keyof EngineConfig>(key: K): EngineConfig[K] {
        return this.config[key];
    }

    /**
     * 启动引擎
     */
    start(): void {
        this.scheduler.start((dt: number) => {
            this.update(dt);
        });
    }

    /**
     * 停止引擎
     */
    stop(): void {
        this.scheduler.stop();
    }

    /**
     * 每帧更新
     */
    private update(dt: number): void {
        const entities = this.scenes.getActiveEntities();
        for (const system of this.systems) {
            if (!system.enabled) continue;
            const filtered = entities.filter(e =>
                system.requiredComponents.every(c => e.components.has(c))
            );
            system.update(dt, filtered);
        }
    }

    /**
     * 销毁引擎
     */
    destroy(): void {
        this.stop();
        for (const system of this.systems) {
            system.destroy();
        }
        this.scenes.destroy();
        this.resources.destroy();
    }
}
```

### 引擎生命周期

```
Engine.create(config)
    │
    ├── initModules()          初始化 Registry / Coordinate / Resources / Scenes / Scheduler
    ├── registerBuiltinSystems()   注册 Render / Physics / Input / Event / Trigger / Sky
    │
    ├── World.load(worldId)    加载世界配置
    ├── Scene.enter(coord)     进入场景、加载 Block
    │
    ├── Engine.start()         启动帧循环
    │   └── Scheduler.loop()   每帧调用 update(dt)
    │       └── System.update() 按优先级执行各系统
    │
    └── Engine.destroy()       销毁引擎
```

---

## Registry - 注册中心

统一管理组件工厂和系统的注册。替代原 `framework.component.reg` 和 `componentMap`。

```typescript
class Registry {
    private factories: Map<string, ComponentFactory> = new Map();
    private shortNameMap: Map<string, string> = new Map();

    /**
     * 注册组件工厂
     */
    registerFactory(factory: ComponentFactory): void {
        const meta = factory.meta;
        this.factories.set(meta.name, factory);

        // 建立缩写映射
        if (meta.short) {
            this.shortNameMap.set(meta.short, meta.name);
            this.shortNameMap.set(meta.name, meta.short);
        }
    }

    /**
     * 批量注册附属物
     */
    registerAdjuncts(adjuncts: AdjunctDefinition[]): void {
        for (const adj of adjuncts) {
            const meta = adj.hooks.reg();
            this.registerFactory({
                type: meta.name,
                category: 'adjunct',
                meta,
                create: (data: any) => ({ type: meta.name, ...data }),
            });
            // 存储附属物的完整定义以供 Pipeline 使用
            this.adjunctDefs.set(meta.name, adj);
        }
    }

    /**
     * 获取组件名（通过缩写）
     */
    getNameByShort(short: string): string | undefined {
        return this.shortNameMap.get(short);
    }

    /**
     * 获取缩写（通过组件名）
     */
    getShortByName(name: string): string | undefined {
        return this.shortNameMap.get(name);
    }

    /**
     * 获取附属物定义
     */
    getAdjunct(name: string): AdjunctDefinition | undefined {
        return this.adjunctDefs.get(name);
    }

    /**
     * 获取组件的 Raw 数据（从附属物列表中按名称查找）
     */
    getRawByName(name: string, adjuncts: [string, any[]][]): any[] | undefined {
        const short = this.getShortByName(name);
        if (!short) return undefined;
        for (const [key, data] of adjuncts) {
            if (key === short) return data;
        }
        return undefined;
    }

    private adjunctDefs: Map<string, AdjunctDefinition> = new Map();
}
```

---

## ResourceManager - 资源管理

统一管理纹理、模型等资源的加载、缓存和销毁。替代原分散在 `world.js` 中的 `prefetch/fetchTextures/fetchModules` 逻辑和 `framework.cache` 中的资源缓存。

```typescript
class ResourceManager {
    private cache: Map<string, ResourceEntry> = new Map();
    private loading: Map<string, Promise<ResourceEntry>> = new Map();

    /**
     * 加载资源（自动缓存和去重）
     */
    async load(ref: ResourceRef): Promise<ResourceEntry> {
        const key = `${ref.type}_${ref.id}`;

        // 1. 缓存命中
        if (this.cache.has(key)) {
            const entry = this.cache.get(key)!;
            entry.refCount++;
            return entry;
        }

        // 2. 正在加载（去重）
        if (this.loading.has(key)) {
            return this.loading.get(key)!;
        }

        // 3. 发起加载
        const promise = this.fetchResource(ref);
        this.loading.set(key, promise);

        try {
            const entry = await promise;
            this.cache.set(key, entry);
            return entry;
        } finally {
            this.loading.delete(key);
        }
    }

    /**
     * 批量预加载
     */
    async preload(requirement: PreloadRequirement): Promise<PreloadResult> {
        const failed: PreloadResult = { textures: [], modules: [] };

        const promises = [
            ...requirement.textures.map(id =>
                this.load({ id, type: ResourceType.Texture, status: ResourceStatus.Pending })
                    .catch(() => { failed.textures.push(id); })
            ),
            ...requirement.modules.map(id =>
                this.load({ id, type: ResourceType.Module, status: ResourceStatus.Pending })
                    .catch(() => { failed.modules.push(id); })
            ),
        ];

        await Promise.all(promises);
        return failed;
    }

    /**
     * 检查资源是否已加载
     */
    isLoaded(type: ResourceType, id: number): boolean {
        return this.cache.has(`${type}_${id}`);
    }

    /**
     * 获取已加载资源
     */
    get(type: ResourceType, id: number): ResourceEntry | undefined {
        return this.cache.get(`${type}_${id}`);
    }

    /**
     * 释放资源（引用计数）
     */
    release(type: ResourceType, id: number): void {
        const key = `${type}_${id}`;
        const entry = this.cache.get(key);
        if (!entry) return;
        entry.refCount--;
        if (entry.refCount <= 0) {
            entry.dispose?.();
            this.cache.delete(key);
        }
    }

    /**
     * 从网络获取资源
     */
    private async fetchResource(ref: ResourceRef): Promise<ResourceEntry> {
        // 实际实现：从 IPFS 或缓存服务器获取
        throw new Error('Not implemented');
    }

    destroy(): void {
        for (const entry of this.cache.values()) {
            entry.dispose?.();
        }
        this.cache.clear();
    }
}

/**
 * 资源缓存条目
 */
interface ResourceEntry {
    ref: ResourceRef;
    data: any;              // 实际资源数据
    refCount: number;
    dispose?: () => void;   // 资源释放回调
}

/**
 * 预加载结果
 */
interface PreloadResult {
    textures: number[];
    modules: number[];
}
```

---

## SceneManager - 场景管理

管理场景的创建、切换和销毁。替代原 `framework.initActive` 和 Block 缓存管理逻辑。

```typescript
class SceneManager {
    private scenes: Map<string, SceneInstance> = new Map();
    private activeScene: string | null = null;

    /**
     * 创建场景
     */
    create(id: string, config: CameraConfig & RenderConfig): SceneInstance {
        const scene = new SceneInstance(id, config);
        this.scenes.set(id, scene);
        return scene;
    }

    /**
     * 设置活动场景
     */
    setActive(id: string): void {
        this.activeScene = id;
    }

    /**
     * 获取活动场景的所有实体
     */
    getActiveEntities(): Entity[] {
        if (!this.activeScene) return [];
        const scene = this.scenes.get(this.activeScene);
        return scene ? scene.getEntities() : [];
    }

    /**
     * 获取活动场景
     */
    getActive(): SceneInstance | null {
        if (!this.activeScene) return null;
        return this.scenes.get(this.activeScene) || null;
    }

    destroy(): void {
        for (const scene of this.scenes.values()) {
            scene.destroy();
        }
        this.scenes.clear();
    }
}

/**
 * 场景实例
 */
class SceneInstance {
    readonly id: string;
    private entities: Map<EntityId, Entity> = new Map();

    // 渲染相关（由 RenderSystem 管理）
    renderer: any;          // Three.WebGLRenderer
    camera: any;            // Three.PerspectiveCamera
    scene: any;             // Three.Scene

    /**
     * 添加 Block 实体
     */
    addEntity(entity: Entity): void {
        this.entities.set(entity.id, entity);
    }

    /**
     * 移除 Block 实体
     */
    removeEntity(id: EntityId): void {
        this.entities.delete(id);
    }

    /**
     * 获取实体
     */
    getEntity(id: EntityId): Entity | undefined {
        return this.entities.get(id);
    }

    /**
     * 获取所有活跃实体
     */
    getEntities(): Entity[] {
        return Array.from(this.entities.values()).filter(e => e.active);
    }

    /**
     * 获取指定范围内的实体
     */
    getEntitiesInRange(center: BlockCoord, extend: number): Entity[] {
        return this.getEntities().filter(e => {
            const dx = Math.abs(e.coord.x - center.x);
            const dy = Math.abs(e.coord.y - center.y);
            return dx <= extend && dy <= extend;
        });
    }

    destroy(): void {
        this.entities.clear();
    }
}
```

---

## Pipeline - 数据转换管线

统一的数据转换管道，替代原 `framework.structSingle` 和 `framework.structRenderData` 的直接函数调用。

完整数据流：

```
读取方向（链上 → 渲染）：
  Binary（链上）→ BinaryDecode → JSON Raw → RawToSTD → STD → STDToRender → RenderData

写入方向（编辑 → 链上）：
  AI JSON → AIInputAdapter → STD → STDToRaw → JSON Raw → BinaryEncode → Binary（链上）
```

```typescript
class Pipeline {
    private stages: PipelineStage[] = [];

    /**
     * 创建管线
     */
    static create(): Pipeline {
        return new Pipeline();
    }

    /**
     * 添加阶段
     */
    addStage(stage: PipelineStage): Pipeline {
        this.stages.push(stage);
        return this;
    }

    /**
     * 执行管线
     */
    process(input: any, context: PipelineContext): any {
        let result = input;
        for (const stage of this.stages) {
            result = stage.process(result, context);
        }
        return result;
    }
}
```

### 内置管线阶段

#### Binary → JSON Raw 阶段（链上读取）

```typescript
/**
 * 将链上二进制数据解码为引擎内部的 JSON Raw 格式
 * 这是 Pipeline 的第一阶段
 */
class BinaryDecodeStage implements PipelineStage<BlockRawBinary, BlockRawJSON> {
    readonly name = 'binary_decode';

    process(binary: BlockRawBinary, context: PipelineContext): BlockRawJSON {
        const { registry } = context;
        const view = new DataView(binary.buffer);

        // 1. 解析 Header
        const version = view.getUint8(BLOCK_HEADER.VERSION_OFFSET);
        const elevation = view.getUint16(BLOCK_HEADER.ELEVATION_OFFSET);
        const status = view.getUint8(BLOCK_HEADER.STATUS_OFFSET);
        const adjCount = view.getUint8(BLOCK_HEADER.ADJ_COUNT_OFFSET);
        const flags = view.getUint8(BLOCK_HEADER.FLAGS_OFFSET);

        // 2. 逐个解析 Adjunct Chunk
        const adjuncts: Record<string, any[]> = {};
        let offset = BLOCK_HEADER.SIZE;

        for (let i = 0; i < adjCount; i++) {
            const typeId = view.getUint8(offset + CHUNK_HEADER.TYPE_ID_OFFSET);
            const encoding = view.getUint8(offset + CHUNK_HEADER.ENCODING_OFFSET);
            const count = view.getUint16(offset + CHUNK_HEADER.COUNT_OFFSET);
            offset += CHUNK_HEADER.SIZE;

            const meta = registry.getMetaByTypeId(typeId);
            if (!meta) { offset += count * 20; continue; } // skip unknown

            const codec = registry.getCodec(typeId);
            const items: any[] = [];

            if (encoding === ChunkEncoding.RLE) {
                // RLE 解码：[direction: u2, length: u6] + item_data
                offset = this.decodeRLE(binary, offset, count, codec, items);
            } else {
                // Raw 解码：逐项
                for (let j = 0; j < count; j++) {
                    items.push(codec.decode(binary, offset));
                    offset += codec.itemSize;
                }
            }

            adjuncts[meta.name] = items;
        }

        return { elevation, status, adjuncts, flags };
    }

    private decodeRLE(
        buf: Uint8Array, offset: number, count: number,
        codec: BinaryCodec, items: any[]
    ): number {
        let decoded = 0;
        while (decoded < count) {
            const header = buf[offset++];
            const direction = (header >> 6) & 0x03;
            const length = header & 0x3F;
            const baseItem = codec.decode(buf, offset);
            offset += codec.itemSize;

            items.push(baseItem);
            // 沿指定方向扩展
            for (let k = 1; k < length; k++) {
                const extended = { ...baseItem };
                extended.position[direction] += k;
                items.push(extended);
            }
            decoded += length;
        }
        return offset;
    }
}
```

#### JSON Raw → Binary 阶段（写入链上）

```typescript
/**
 * 将引擎内部 JSON Raw 数据编码为链上二进制格式
 * 用于保存时（写链）
 */
class BinaryEncodeStage implements PipelineStage<BlockRawJSON, BlockRawBinary> {
    readonly name = 'binary_encode';

    process(raw: BlockRawJSON, context: PipelineContext): BlockRawBinary {
        const { registry } = context;

        // 1. 计算总大小
        let totalSize = BLOCK_HEADER.SIZE;
        const chunks: { typeId: number; data: Uint8Array }[] = [];

        for (const [name, items] of Object.entries(raw.adjuncts)) {
            const meta = registry.getMetaByName(name);
            if (!meta || items.length === 0) continue;

            const codec = registry.getCodec(meta.typeId);
            const chunkData = this.encodeChunk(items, codec);
            chunks.push({ typeId: meta.typeId, data: chunkData });
            totalSize += CHUNK_HEADER.SIZE + chunkData.length;
        }

        // 2. 写入
        const buf = new Uint8Array(totalSize);
        const view = new DataView(buf.buffer);

        // Header
        view.setUint8(BLOCK_HEADER.VERSION_OFFSET, 1);
        view.setUint16(BLOCK_HEADER.ELEVATION_OFFSET, raw.elevation);
        view.setUint8(BLOCK_HEADER.STATUS_OFFSET, raw.status);
        view.setUint8(BLOCK_HEADER.ADJ_COUNT_OFFSET, chunks.length);
        view.setUint8(BLOCK_HEADER.FLAGS_OFFSET, raw.flags || 0);

        // Chunks
        let offset = BLOCK_HEADER.SIZE;
        for (const chunk of chunks) {
            view.setUint8(offset + CHUNK_HEADER.TYPE_ID_OFFSET, chunk.typeId);
            view.setUint8(offset + CHUNK_HEADER.ENCODING_OFFSET, ChunkEncoding.Raw);
            view.setUint16(offset + CHUNK_HEADER.COUNT_OFFSET,
                chunk.data.length / registry.getCodec(chunk.typeId).itemSize);
            offset += CHUNK_HEADER.SIZE;
            buf.set(chunk.data, offset);
            offset += chunk.data.length;
        }

        return buf;
    }

    private encodeChunk(items: any[], codec: BinaryCodec): Uint8Array {
        const buf = new Uint8Array(items.length * codec.itemSize);
        for (let i = 0; i < items.length; i++) {
            codec.encode(items[i], buf, i * codec.itemSize);
        }
        return buf;
    }
}
```

> [!NOTE]
> 完整管线变为：`Binary → JSON Raw → STD → RenderData`（读取方向）
> 和：`AI JSON → STD → JSON Raw → Binary`（写入方向）

#### Raw → STD 阶段

```typescript
/**
 * 将 Block 的 Raw 数据转换为 STD 标准格式
 * 原: framework.structSingle()
 */
class RawToSTDStage implements PipelineStage<BlockRawData, STDData> {
    readonly name = 'raw_to_std';

    process(raw: BlockRawData, context: PipelineContext): STDData {
        const { registry, accuracy, side } = context;
        const std: STDData = { block: [] };

        // 1. 转换 Block 基础数据
        const blockAdjunct = registry.getAdjunct('block');
        if (blockAdjunct?.transform.rawToStd) {
            std.block = blockAdjunct.transform.rawToStd(
                raw, accuracy, side
            ) as STDBlock[];
        }

        // 2. 转换所有附属物
        const adjuncts = raw[RAW_INDEX.ADJUNCTS] as [string, any[]][];
        for (const [short, data] of adjuncts) {
            const name = registry.getNameByShort(short);
            if (!name) continue;

            const adjunct = registry.getAdjunct(name);
            if (adjunct?.transform.rawToStd) {
                std[name] = adjunct.transform.rawToStd(data, accuracy);
            }
        }

        return std;
    }
}
```

#### STD → RenderData 阶段

```typescript
/**
 * 将 STD 数据转换为渲染数据
 * 原: framework.structRenderData()
 */
class STDToRenderStage implements PipelineStage<STDData, BlockRenderResult> {
    readonly name = 'std_to_render';

    process(std: STDData, context: PipelineContext): BlockRenderResult {
        const { registry, elevation } = context;

        const renderData: RenderDataMap = {};
        const colliders: ColliderData[] = [];
        const triggers: TriggerData[] = [];
        const preload: PreloadRequirement = { textures: [], modules: [] };

        for (const name in std) {
            const adjunct = registry.getAdjunct(name);
            if (!adjunct?.transform.stdToRenderData) continue;

            const objects = adjunct.transform.stdToRenderData(std[name], elevation);

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];

                // 收集预加载需求
                this.collectPreload(obj, preload);

                // 提取碰撞体
                if (obj.stop) {
                    colliders.push(this.toCollider(obj, name, i, context));
                }

                // 提取触发器
                if (name === 'trigger') {
                    triggers.push(this.toTrigger(obj, i));
                }
            }

            renderData[name] = objects;
        }

        return { renderData, colliders, triggers, preload };
    }

    private collectPreload(obj: RenderObject, preload: PreloadRequirement): void {
        // 收集纹理
        if (obj.material?.texture) {
            const textures = Array.isArray(obj.material.texture)
                ? obj.material.texture
                : [obj.material.texture];
            for (const tid of textures) {
                if (!preload.textures.includes(tid)) {
                    preload.textures.push(tid);
                }
            }
        }
        // 收集模型
        if (obj.module && !preload.modules.includes(Number(obj.module))) {
            preload.modules.push(Number(obj.module));
        }
    }

    private toCollider(
        obj: RenderObject, adjunct: string, index: number, ctx: PipelineContext
    ): ColliderData {
        return {
            ...obj.params,
            material: obj.stop!,
            block: ctx.blockCoord,
            elevation: ctx.elevation,
            side: 0,
            origin: { type: obj.type, index, adjunct },
        };
    }

    private toTrigger(obj: RenderObject, index: number): TriggerData {
        return {
            ...obj.params,
            material: obj.material || {},
            origin: { type: obj.type, index, adjunct: 'trigger' },
        };
    }
}

/**
 * Block 渲染管线结果
 */
interface BlockRenderResult {
    renderData: RenderDataMap;
    colliders: ColliderData[];
    triggers: TriggerData[];
    preload: PreloadRequirement;
}
```

### 完整管线使用

```typescript
// 构建 Block 数据转换管线
const blockPipeline = Pipeline.create()
    .addStage(new RawToSTDStage())
    .addStage(new STDToRenderStage());

// 执行转换
const context: PipelineContext = {
    world: 0,
    blockCoord: { x: 2025, y: 619, world: 0 },
    accuracy: 1000,
    side: [16000, 16000],
    elevation: 1500,
    registry: engine.registry,
    resources: engine.resources,
};

const result = blockPipeline.process(rawData, context);
// result.renderData  → 用于渲染
// result.colliders   → 用于碰撞检测
// result.triggers    → 用于触发器系统
// result.preload     → 用于资源预加载
```

---

## Scheduler - 帧循环与调度

管理帧循环和任务调度。替代原 `framework.loop` 和队列系统。

```typescript
class Scheduler {
    private running = false;
    private targetFPS: number;
    private frameId: number | null = null;

    // 固定时间步长（逻辑更新）
    private readonly FIXED_DT = 1 / 60;  // 60Hz
    private accumulator = 0;
    private lastTime = 0;

    // 任务队列
    private queues: Map<string, QueueItem[]> = new Map();

    /**
     * 初始化调度器
     */
    init(targetFPS: number): void {
        this.targetFPS = targetFPS;
    }

    /**
     * 启动帧循环
     */
    start(updateFn: (dt: number) => void): void {
        this.running = true;
        this.lastTime = performance.now();

        const loop = (now: number) => {
            if (!this.running) return;

            const frameDt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            this.accumulator += frameDt;

            // 固定时间步长更新（逻辑和物理）
            while (this.accumulator >= this.FIXED_DT) {
                this.processQueues();
                updateFn(this.FIXED_DT);
                this.accumulator -= this.FIXED_DT;
            }

            this.frameId = requestAnimationFrame(loop);
        };

        this.frameId = requestAnimationFrame(loop);
    }

    /**
     * 停止帧循环
     */
    stop(): void {
        this.running = false;
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    // ============ 队列管理 ============

    /**
     * 创建命名队列
     */
    createQueue(name: string): void {
        if (!this.queues.has(name)) {
            this.queues.set(name, []);
        }
    }

    /**
     * 向队列推入项目
     */
    enqueue(name: string, item: QueueItem): void {
        if (!this.queues.has(name)) {
            this.createQueue(name);
        }
        this.queues.get(name)!.push(item);
    }

    /**
     * 向队列推入（去重）
     */
    enqueueUnique(name: string, item: QueueItem): void {
        if (!this.queues.has(name)) {
            this.createQueue(name);
        }
        const queue = this.queues.get(name)!;
        if (!queue.some(i => i.id === item.id)) {
            queue.push(item);
        }
    }

    /**
     * 从队列移除
     */
    dequeue(name: string, id: string): boolean {
        if (!this.queues.has(name)) return false;
        const queue = this.queues.get(name)!;
        const index = queue.findIndex(i => i.id === id);
        if (index < 0) return false;
        queue.splice(index, 1);
        return true;
    }

    /**
     * 获取队列
     */
    getQueue(name: string): QueueItem[] {
        return this.queues.get(name) || [];
    }

    /**
     * 清空队列
     */
    clearQueue(name: string): void {
        this.queues.set(name, []);
    }

    /**
     * 处理所有队列中的就绪项目
     */
    private processQueues(): void {
        for (const [name, queue] of this.queues) {
            const ready = queue.filter(i => i.ready?.() ?? true);
            for (const item of ready) {
                item.execute();
            }
        }
    }
}

/**
 * 队列项目
 */
interface QueueItem {
    id: string;
    ready?: () => boolean;      // 是否就绪
    execute: () => void;        // 执行逻辑
}

/**
 * 内置队列名称
 */
enum QueueName {
    BlockLoading = 'block_loading',
    ResourceLoading = 'resource_loading',
    TriggerRuntime = 'trigger_runtime',
}
```

---

## CoordinateService - 坐标服务

统一的坐标转换服务，替代原分散在各组件中的坐标转换逻辑。

```typescript
class CoordinateService {
    private config!: CoordinateConfig;

    /**
     * 初始化
     */
    init(config: CoordinateConfig): void {
        this.config = config;
    }

    /**
     * 获取 Block 尺寸
     */
    getSide(): [number, number] {
        return this.config.side;
    }

    /**
     * 获取精度系数
     */
    getAccuracy(): number {
        return this.config.accuracy;
    }

    // ============ 坐标转换 ============

    /**
     * Septopus → Three.js
     */
    toThreeCoord(coord: SeptopusCoord): ThreeCoord {
        return { x: coord.x, y: coord.z, z: -coord.y };
    }

    /**
     * Three.js → Septopus
     */
    toSeptopusCoord(coord: ThreeCoord): SeptopusCoord {
        return { x: coord.x, y: -coord.z, z: coord.y };
    }

    /**
     * Block 内局部坐标 → 世界坐标（Septopus）
     */
    localToWorld(block: BlockCoord, local: SeptopusCoord): SeptopusCoord {
        const [sideX, sideY] = this.config.side;
        return {
            x: (block.x - 1) * sideX + local.x,
            y: (block.y - 1) * sideY + local.y,
            z: local.z,
        };
    }

    /**
     * 世界坐标（Septopus）→ Block 坐标 + 局部坐标
     */
    worldToLocal(world: SeptopusCoord): { block: BlockCoord; local: SeptopusCoord } {
        const [sideX, sideY] = this.config.side;
        const bx = Math.floor(world.x / sideX) + 1;
        const by = Math.floor(world.y / sideY) + 1;
        return {
            block: { x: bx, y: by, world: 0 },
            local: {
                x: world.x - (bx - 1) * sideX,
                y: world.y - (by - 1) * sideY,
                z: world.z,
            },
        };
    }

    /**
     * Block 内局部坐标 → Three.js 世界坐标
     */
    localToThree(block: BlockCoord, local: SeptopusCoord): ThreeCoord {
        const worldCoord = this.localToWorld(block, local);
        return this.toThreeCoord(worldCoord);
    }

    // ============ 距离与范围 ============

    /**
     * 计算两个 Block 间的曼哈顿距离
     */
    blockDistance(a: BlockCoord, b: BlockCoord): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    /**
     * 检查 Block 是否在范围内
     */
    isInRange(block: BlockCoord, center: BlockCoord, extend: number): boolean {
        return Math.abs(block.x - center.x) <= extend
            && Math.abs(block.y - center.y) <= extend;
    }

    /**
     * 获取范围内所有 Block 坐标
     */
    getBlocksInRange(center: BlockCoord, extend: number): BlockCoord[] {
        const blocks: BlockCoord[] = [];
        const [maxX, maxY] = this.config.blockLimit;

        for (let dx = -extend; dx <= extend; dx++) {
            for (let dy = -extend; dy <= extend; dy++) {
                const x = center.x + dx;
                const y = center.y + dy;
                if (x >= 1 && x <= maxX && y >= 1 && y <= maxY) {
                    blocks.push({ x, y, world: center.world });
                }
            }
        }

        return blocks;
    }
}
```

---

## StateMachine - 模式管理

通用状态机，用于管理系统模式（Normal/Edit/Game/Ghost）。替代原 `framework.mode` 的直接switch逻辑。

```typescript
class StateMachine<T extends string> {
    private current: T;
    private transitions: Map<string, TransitionHandler<T>> = new Map();
    private listeners: Map<string, ((from: T, to: T) => void)[]> = new Map();

    constructor(initial: T) {
        this.current = initial;
    }

    /**
     * 获取当前状态
     */
    getCurrent(): T {
        return this.current;
    }

    /**
     * 定义状态转换规则
     */
    addTransition(from: T, to: T, handler?: TransitionHandler<T>): void {
        const key = `${from}->${to}`;
        if (handler) {
            this.transitions.set(key, handler);
        }
    }

    /**
     * 执行状态转换
     */
    async transition(to: T, context?: any): Promise<boolean> {
        if (this.current === to) return true;

        const key = `${this.current}->${to}`;
        const handler = this.transitions.get(key);

        // 执行转换处理器
        if (handler) {
            const allowed = await handler.canTransition(this.current, to, context);
            if (!allowed) return false;
            await handler.onTransition(this.current, to, context);
        }

        const from = this.current;
        this.current = to;

        // 通知监听器
        const key2 = `enter:${to}`;
        this.listeners.get(key2)?.forEach(fn => fn(from, to));

        return true;
    }

    /**
     * 监听状态进入
     */
    onEnter(state: T, callback: (from: T, to: T) => void): void {
        const key = `enter:${state}`;
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)!.push(callback);
    }
}

/**
 * 状态转换处理器
 */
interface TransitionHandler<T> {
    canTransition(from: T, to: T, context?: any): Promise<boolean>;
    onTransition(from: T, to: T, context?: any): Promise<void>;
}
```

### 系统模式配置

```typescript
// 配置模式转换规则
const modeStateMachine = new StateMachine<SystemMode>(SystemMode.Normal);

// Normal ↔ Edit（需要 Block 所有权验证）
modeStateMachine.addTransition(SystemMode.Normal, SystemMode.Edit, {
    canTransition: async (from, to, ctx) => {
        return ctx.hasOwnership;  // 验证 Block 所有权
    },
    onTransition: async (from, to, ctx) => {
        // 创建编辑模式辅助数据（边框、网格等）
        await ctx.editor.setup(ctx.blockCoord);
    },
});

modeStateMachine.addTransition(SystemMode.Edit, SystemMode.Normal, {
    canTransition: async () => true,
    onTransition: async (from, to, ctx) => {
        // 清理编辑模式数据
        ctx.editor.cleanup();
    },
});

// Normal ↔ Game
modeStateMachine.addTransition(SystemMode.Normal, SystemMode.Game, {
    canTransition: async (from, to, ctx) => {
        return !!ctx.gameSetting;  // 需要有游戏设置
    },
    onTransition: async (from, to, ctx) => {
        // 切断网络请求，启用游戏逻辑
        ctx.network.disable();
    },
});
```

---

## 编辑系统（Editor）

编辑模式的核心逻辑，替代原 `framework.toEdit`、`framework.toSelect`、`framework.excute`。

```typescript
class Editor {
    /**
     * 进入编辑模式
     */
    async setup(coord: BlockCoord): Promise<PreloadRequirement> {
        const preload: PreloadRequirement = { textures: [], modules: [] };

        // 1. 生成 Block 边框高亮数据
        const borderData = this.generateBorder(coord);
        preload.textures.push(...borderData.textures);

        // 2. 初始化编辑状态
        this.state = {
            coord,
            border: borderData.objects,
            helpers: [],
            grid: { raw: null, lines: [], points: [] },
            selected: null,
        };

        return preload;
    }

    /**
     * 选中附属物
     */
    select(adjunct: string, index: number, face: string): void {
        this.state.selected = { adjunct, index, face };
        // 生成高亮和辅助网格
        this.generateHelpers();
        this.generateGrid();
    }

    /**
     * 执行修改任务
     */
    async execute(
        tasks: ModifyTask[],
        context: { sceneId: string; world: number }
    ): Promise<TaskResult[]> {
        const results: TaskResult[] = [];

        for (const task of tasks) {
            try {
                const adjunct = this.registry.getAdjunct(task.adjunct);
                if (!adjunct?.attribute?.[task.action]) {
                    results.push({ success: false, error: `无效操作: ${task.action}` });
                    continue;
                }

                const handler = adjunct.attribute[task.action]!;
                const raw = this.registry.getRawByName(task.adjunct, this.getCurrentRaw());

                if (task.limit) {
                    handler(task.param, raw, task.limit);
                } else {
                    handler(task.param, raw);
                }

                results.push({ success: true });
            } catch (e) {
                results.push({ success: false, error: String(e) });
            }
        }

        // 标记修改的 Block
        this.markModified(context);
        return results;
    }

    /**
     * 清理编辑模式
     */
    cleanup(): void {
        this.state = null;
    }
}
```

---

## 模块间关系

```
┌─────────────┐
│   Engine     │─── 拥有并初始化所有模块
├─────────────┤
│  Registry   │─── 被 Pipeline / Editor 查询
│  Resources  │─── 被 Pipeline / RenderSystem 使用
│  Scenes     │─── 被 Engine.update / RenderSystem 使用
│  Pipeline   │─── 被 World.load 调用进行数据转换
│  Scheduler  │─── 驱动 Engine.update 循环
│  Coordinate │─── 被所有需要坐标转换的模块使用
│  State      │─── 被 Editor / InputSystem 查询
│  Events     │─── 被所有系统用于跨模块通信
└─────────────┘
```

## 与旧代码的映射

| 旧代码位置 | 新模块 | 说明 |
|-----------|--------|------|
| `framework.component.reg()` | `Registry.registerFactory()` | 组件注册 |
| `framework.cache.*` | `ResourceManager` + `SceneManager` | 缓存拆分为资源缓存和场景数据 |
| `framework.queue.*` | `Scheduler.enqueue()` | 队列管理 |
| `framework.structSingle()` | `Pipeline: RawToSTDStage` | Raw → STD 转换 |
| `framework.structRenderData()` | `Pipeline: STDToRenderStage` | STD → RenderData 转换 |
| `framework.mode()` | `StateMachine.transition()` | 模式切换 |
| `framework.toEdit()` | `Editor.setup()` | 编辑模式 |
| `framework.toSelect()` | `Editor.select()` | 选中附属物 |
| `framework.excute()` | `Editor.execute()` | 修改任务 |
| `framework.loop()` | `Scheduler.start() + Engine.update()` | 帧循环 |
| `framework.getConvert()` | `CoordinateService.getAccuracy()` | 精度系数 |
| `framework.getSide()` | `CoordinateService.getSide()` | Block 尺寸 |

---

## AIAdapter - AI 适配层

为 AI 驱动的内容创作提供接口支持。详见 [AI 集成文档](../features/ai-integration.md)。

### AIInputAdapter

语义化 JSON 与引擎 Raw 数据之间的双向转换，让AI不必处理紧凑数组编码：

```typescript
class AIInputAdapter {
    private registry: Registry;

    /**
     * AI 语义化 JSON → 引擎 Raw 数据
     * AI 生成 { adjuncts: { box: [{ size: {x,y,z}, ... }] } }
     * 引擎需要 ["bx", [[1000, 500, 1200], [3000, 4000, 600], ...]]
     */
    toRaw(input: AIInput): BlockRawData {
        const elevation = Math.round(input.block.elevation * this.accuracy);
        const status = input.block.status;
        const adjuncts: [string, any[]][] = [];

        for (const [name, items] of Object.entries(input.adjuncts)) {
            const short = this.registry.getShortByName(name);
            if (!short) continue;
            const adjDef = this.registry.getAdjunct(name);
            if (adjDef?.transform.stdToRaw) {
                adjuncts.push([short, adjDef.transform.stdToRaw(items, this.accuracy)]);
            }
        }

        return [elevation, status, adjuncts];
    }

    /**
     * 引擎 Raw 数据 → AI 可读的语义化 JSON
     */
    fromRaw(raw: BlockRawData): AIInput {
        // 反向转换，用于让 AI "看到" 现有数据
        const pipeline = Pipeline.create().addStage(new RawToSTDStage());
        const std = pipeline.process(raw, this.context);
        return this.stdToAIInput(std);
    }

    /**
     * 获取完整的 JSON Schema，AI 可据此生成合规数据
     */
    getSchema(): JSONSchema {
        return this.buildSchemaFromRegistry();
    }
}
```

### AIValidator

在 Pipeline 中增加验证阶段，捕获 AI 生成数据的逻辑错误：

```typescript
class AIValidator {
    /**
     * 结构验证 - JSON 格式是否符合 Schema
     */
    validateSchema(input: AIInput): ValidationResult { ... }

    /**
     * 空间验证 - 弦粒子联通性是否合理
     * 检查：是否有不可达区域、是否有出入口
     */
    validateConnectivity(cells: ParticleCell[]): ValidationResult {
        // BFS/DFS 遍历联通图
        // 返回孤立区域警告
    }

    /**
     * 碰撞验证 - 是否有穿模
     * 检查：碰撞体重叠、附属物超出 Block 边界
     */
    validatePhysics(adjuncts: STDData): ValidationResult { ... }

    /**
     * 逻辑验证 - 触发器引用是否有效
     * 检查：触发目标是否存在、动作是否合法
     */
    validateTriggers(triggers: TriggerData[], adjuncts: STDData): ValidationResult { ... }
}
```

### AIWorldQuery

只读查询接口，让 AI "看到" 现有世界状态：

```typescript
class AIWorldQuery {
    /**
     * 获取 Block 的自然语言描述
     */
    describeBlock(coord: BlockCoord): BlockDescription {
        const entity = this.scenes.getActive()?.getEntity(toEntityId(coord));
        if (!entity) return { coord, elevation: 0, adjuncts: [] };
        // 将 STD 数据转为 AI 可理解的摘要
    }

    /**
     * 获取可用构型列表（带自然语言描述）
     */
    listVariants(theme?: number): VariantCatalog {
        // 返回每个面方向的可用构型名称和描述
    }

    /**
     * 获取 AI 输入的 JSON Schema
     */
    getInputSchema(): JSONSchema {
        return this.adapter.getSchema();
    }
}
```

---

## 跨 Block 规则

### Trigger 跨 Block 操作（协议层）

Trigger 的 `target` 可以引用其他 Block 中的 Adjunct，但引擎运行时必须验证**所有权一致性**：

```typescript
function validateTriggerAction(action: TriggerAction, sourceBlock: Block): boolean {
    const [type, bx, by, index] = action.target;
    const targetBlock = getBlock(bx, by);
    
    // 核心校验：跨 Block 操作要求同一所有者
    if (targetBlock.owner !== sourceBlock.owner) {
        return false;
    }
    return true;
}
```

同一所有者的多个 Block 可以通过 Trigger 实现联动（如踩下机关打开隔壁房间的门），但不能修改他人 Block 中的内容。

### 运行时特效跨 Block（引擎层）

粒子特效、物理碎片、光照、音效等纯渲染/模拟效果**不受 Block 边界约束**，因为它们不修改任何链上数据：

- 爆炸碎块可以飞入相邻 Block
- 火光可以照亮相邻 Block 的墙壁
- 投射物可以跨越多个 Block
- 音效按距离衰减，无视 Block 边界

---

## 相关文档

- [架构概述](../architecture/overview.md) - 系统总体架构
- [类型定义](../api/types.md) - TypeScript 类型定义
- [弦粒子系统](../features/spp.md) - 空间内容快速构建
- [AI 集成](../features/ai-integration.md) - AI 驱动的 3D 游戏开发
- [时间维度](../features/time-dimension.md) - 区块链时间驱动的世界演化
