import { World } from './core/World';
import type { RenderEngine } from './render/RenderEngine';
import { IDataSource } from './core/services/DataSource';
import { IUIProvider } from './core/services/UIProvider';
import { DefaultUIProvider } from './core/services/DefaultUIProvider';
import { EventUIProxy } from './core/services/EventUIProxy';
import { IChainPublisher } from './core/services/IChainPublisher';
import { ExportService } from './core/services/ExportService';
import { Coords } from './core/utils/Coords';
import { GlobalConfig } from './core/GlobalConfig';
import { WorldConfig, FullWorldConfig } from './core/types/WorldConfig';

export interface EngineServices {
    api: IDataSource;
    ui?: IUIProvider;
    /**
     * UI rendering mode:
     *   'default' — use provider (DefaultUIProvider or injected) AND emit ui:* events
     *   'events'  — emit ui:* events ONLY, no built-in DOM rendering
     */
    uiMode?: 'default' | 'events';
    /** Optional chain publisher for uploading edits to blockchain */
    publisher?: IChainPublisher;
    /**
     * Optional injected render engine. Omit in production (the real WebGL
     * RenderEngine is created by default). Tests inject a headless NullRenderEngine
     * so a World can boot and step without a GPU/DOM.
     */
    renderer?: RenderEngine;
    /** Injectable resource loaders (tests pass fakes + fetch counters). */
    resources?: import('./render/ResourceManager').ResourceManagerConfig;
    /** Durable draft storage backend (default: IndexedDB in browsers). */
    draftBackend?: import('./core/services/DraftStore').IDraftBackend | null;
    /** Trigger-action executor (default: LocalActuator; chain builds inject their own). */
    actuator?: import('./core/services/Actuator').IActuator;
    config?: any;
}

export class Engine {
    private world: World | null = null;
    private services: EngineServices;
    private containerId: string;
    private eventQueue: Array<{ type: string; callback: (payload: any) => void }> = [];
    private eventWrappers = new Map<any, (ev: any) => void>();

    constructor(containerId: string, services: EngineServices) {
        this.containerId = containerId;
        this.services = services;
    }

    public async bootWorld(worldIndex: number, playerStart?: any) {
        // 1. Fetch the specific World Config (King's Config)
        const kingConfig: WorldConfig = await this.services.api.world(worldIndex);

        // 2. Merge with Global Constants (Hierarchical Merging)
        const fullConfig: FullWorldConfig = {
            ...GlobalConfig,
            ...kingConfig,
            world: {
                ...GlobalConfig.world,
                ...kingConfig.world,
                containerId: this.containerId // Inject runtime container
            },
            time: {
                ...GlobalConfig.time,
                // Individual worlds currently don't override global time epoch/speed in this implementation
                // but could be expanded here if needed.
            }
        };

        // 3. Coordinate conversion for player start
        const start = playerStart || fullConfig.player.start;
        const enginePos = Coords.sppToEngine(start.position, start.block);
        const engineRot = Coords.sppRotationToEngine(start.rotation || [0, 0, 0]);

        fullConfig.player.start = { ...start, position: enginePos, rotation: engineRot };

        this.world = new World(fullConfig, {
            renderEngine: this.services.renderer,
            dataSource: this.services.api,
            resources: this.services.resources,
            draftBackend: this.services.draftBackend,
            actuator: this.services.actuator
        });

        // 3.5 UI Orchestration
        const uiMode = this.services.uiMode || 'default';
        let baseProvider: IUIProvider | null = this.services.ui || null;

        // In 'default' mode, ensure there is always a base provider
        if (!baseProvider && uiMode === 'default') {
            baseProvider = new DefaultUIProvider(this.containerId);
        }

        // Wrap with EventUIProxy — always emits ui:* events, optionally delegates to provider
        const emitter = (event: string, data: any) => this.world?.emitSimple(event, data);
        const uiProxy = new EventUIProxy(emitter, baseProvider, uiMode);
        this.world.setUIProvider(uiProxy);

        // 4. Initialize Player
        const player = this.world.setupPlayer(fullConfig.player.start.position, fullConfig.player.start.rotation);


        this.eventQueue.forEach(sub => this.on(sub.type, sub.callback));
        this.eventQueue = [];

        if (this.services.ui && typeof (this.services.ui as any).showToast === 'function') {
            (this.services.ui as any).showToast("Environment Ready");
        }
    }

    public start() {
        this.world?.start();
    }

    /**
     * Advance the simulation by one fixed step (deterministic). Used by tests to
     * pump the world frame-by-frame instead of the rAF-driven start() loop.
     */
    public step(dt: number) {
        this.world?.step(dt);
    }

    public stop() {
        this.world?.stop();
    }

    public injectBlock(stdData: any) {
        if (this.world?.blocks) {
            const blockEntity = this.world.createEntity();
            this.world.addComponent(blockEntity, "BlockComponent", {
                x: stdData.x,
                y: stdData.y,
                elevation: stdData.elevation || 0,
                world: stdData.world || 'main',
                adjuncts: stdData.adjuncts || [],
                isInitialized: false
            });
        }
    }

    /**
     * Load every persisted draft for a world into the DraftStore's sync cache,
     * and restore the player's persisted inventory. Call AFTER bootWorld and
     * BEFORE injecting the first block — BlockSystem reads drafts synchronously
     * while materializing blocks.
     */
    public async hydrateDrafts(worldId: number = 0): Promise<void> {
        const world = this.world;
        if (!world) return;
        await world.draftStore.hydrate(worldId);

        const savedItems = await world.draftStore.loadMeta(worldId, 'inventory');
        if (Array.isArray(savedItems)) {
            const players = world.queryEntities("InventoryComponent", "InputStateComponent");
            const inv = players.length > 0
                ? world.getComponent<any>(players[0], "InventoryComponent") : null;
            if (inv) {
                inv.items = savedItems;
                world.emitSimple('inventory_updated', { entity: players[0], inventory: inv });
            }
        }
    }

    /** Export all local drafts of a world as a versioned JSON string (P1). */
    public async exportWorldJson(worldId: number = 0): Promise<string> {
        if (!this.world) throw new Error('[Engine] exportWorldJson before bootWorld');
        return new ExportService(this.world.draftStore).exportWorld(worldId);
    }

    /** Import a previously exported JSON file into the local draft store (P1).
     *  Already-loaded blocks keep their current meshes; re-streamed or reloaded
     *  blocks pick the imported drafts up. */
    public async importWorldJson(json: string): Promise<{ worldId: number; imported: number }> {
        if (!this.world) throw new Error('[Engine] importWorldJson before bootWorld');
        return new ExportService(this.world.draftStore).importWorld(json);
    }

    /**
     * Drop `count` of an inventory item at the local player's feet (atomic:
     * bag debit + b5 adjunct spawn + draft save — see ItemSystem.dropItem).
     */
    public dropItem(itemId: string, count: number = 1): boolean {
        const world = this.world;
        if (!world) return false;
        const itemSystem = world.systems.findSystemByName('ItemSystem') as any;
        const players = world.queryEntities("InventoryComponent", "InputStateComponent");
        if (!itemSystem?.dropItem || players.length === 0) return false;
        return itemSystem.dropItem(world, players[0], itemId, count);
    }

    /** Destroy a streamed-in block and its adjuncts (frees meshes). Used by the
     *  loader's view-window eviction to bound memory as the player roams. */
    public removeBlock(x: number, y: number): void {
        const bs = this.world?.systems.findSystemByName('BlockSystem') as any;
        if (bs?.removeBlock) bs.removeBlock(this.world, x, y);
    }

    /**
     * Feed a chain-height tick to the environment (time + weather are derived from
     * block height + hash, like the old engine's slot subscription). In the
     * chain-decoupled client a mock ticker drives this so the day/night cycle and
     * weather actually advance. Without it, time stays frozen at the initial state.
     */
    public feedChainState(height: number, hash: string, intervalSeconds: number): void {
        const env = this.world?.systems.findSystemByName('EnvironmentSystem') as any;
        if (env?.onNewBlock) env.onNewBlock(this.world, height, hash, intervalSeconds);
    }

    /** Switch the camera between first-person and third-person (slight top-down). */
    public setCameraView(mode: 'first' | 'third'): void {
        const cc = this.world?.systems.findSystemByName('CharacterController') as any;
        cc?.setViewMode?.(mode);
    }

    /** Toggle first/third-person; returns the new mode (or undefined if not ready). */
    public toggleCameraView(): 'first' | 'third' | undefined {
        const cc = this.world?.systems.findSystemByName('CharacterController') as any;
        return cc?.toggleViewMode?.();
    }

    public getWorld(): World | null {
        return this.world;
    }

    public on(event: string, callback: (payload: any) => void) {
        if (!this.world) {
            this.eventQueue.push({ type: event, callback });
            return;
        }

        const wrapper = (ev: any) => callback(ev.payload);
        this.eventWrappers.set(callback, wrapper);
        this.world.on(event, wrapper);
    }

    public off(event: string, callback: (payload: any) => void) {
        this.eventQueue = this.eventQueue.filter(sub => sub.callback !== callback);
        const wrapper = this.eventWrappers.get(callback);
        if (wrapper && this.world) {
            this.world.off(event, wrapper);
            this.eventWrappers.delete(callback);
        }
    }

    public setMoveIntent(x: number, y: number) {
        this.world?.controls.setMoveIntent(x, y);
    }

    public jump() {
        this.world?.controls.triggerJump();
    }

    public lock() {
        this.world?.controls.lock();
    }

    public unlock() {
        this.world?.controls.unlock();
    }

    public setEditMode(active: boolean) {
        this.world?.setEditMode(active);
    }

    public injectStyle(tokens: Record<string, string>) {
        this.services.ui?.injectStyle?.(tokens);
    }

    public ui(): IUIProvider | undefined {
        return this.services.ui;
    }

    public dispose() {
        this.world?.dispose();
    }
}
