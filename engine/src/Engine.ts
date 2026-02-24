import { World } from './core/World';
import { IDataSource } from './core/services/DataSource';
import { IUIProvider } from './core/services/UIProvider';
import { DefaultUIProvider } from './core/services/DefaultUIProvider';
import { Coords } from './core/utils/Coords';
import { PlayerControlSystem } from './core/systems/PlayerControlSystem';
import { GlobalConfig } from './core/GlobalConfig';
import { WorldConfig, FullWorldConfig } from './core/types/WorldConfig';

export interface EngineServices {
    api: IDataSource;
    ui?: IUIProvider;
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

        this.world = new World(fullConfig);

        // 3.5 UI Orchestration
        if (!this.services.ui) {
            this.services.ui = new DefaultUIProvider(this.containerId);
        }
        this.world.setUIProvider(this.services.ui);

        // 4. Initialize Player
        const player = this.world.setupPlayer(fullConfig.player.start.position, fullConfig.player.start.rotation);

        // Find PlayerControlSystem and attach
        const controlSystem = (this.world as any).systems.find((s: any) => s instanceof PlayerControlSystem) as PlayerControlSystem;
        if (controlSystem) {
            controlSystem.attachToEntity(player);
        }

        this.eventQueue.forEach(sub => this.on(sub.type, sub.callback));
        this.eventQueue = [];

        if (this.services.ui && typeof (this.services.ui as any).showToast === 'function') {
            (this.services.ui as any).showToast("Environment Ready");
        }
    }

    public start() {
        this.world?.start();
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
