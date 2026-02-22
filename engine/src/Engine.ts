import { World } from './core/World';
import { IDataSource } from './core/services/DataSource';
import { IUIProvider } from './core/services/UIProvider';
import { Coords } from './core/utils/Coords';

export interface EngineServices {
    api: IDataSource;
    ui?: IUIProvider;
    config?: any; // Global system settings
}

/**
 * High-level Engine entry point.
 * Usage: const engine = new Engine("container-id", { api, ui });
 */
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

    /**
     * Boots a specific world. 
     * World data is fetched from the injected API based on the index.
     */
    public async bootWorld(worldIndex: number, playerStart?: any) {
        const config = await this.services.api.world(worldIndex);

        // 1. Transform Start Position to Global World Space
        // Use provided override (from storage) OR calculate from default config
        const start = playerStart || config.player.start;
        const enginePos = Coords.sppToEngine(start.position, start.block);

        config.player.start = {
            ...start,
            position: enginePos
        };

        config.world = config.world || {};
        config.world.containerId = this.containerId;

        this.world = new World(config);

        // 2. Replay Queued Subscriptions
        this.eventQueue.forEach(sub => {
            this.on(sub.type, sub.callback);
        });
        this.eventQueue = [];

        // Initialize UI if provided
        if (this.services.ui) {
            this.services.ui.show("toast", "Environment Ready");
        }
    }

    public start() {
        this.world?.start();
    }

    public stop() {
        this.world?.stop();
    }

    /**
     * Injects a block's standard data into the engine.
     */
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
        this.world.subscribe(event, wrapper);
    }

    public off(event: string, callback: (payload: any) => void) {
        // Clean queue
        this.eventQueue = this.eventQueue.filter(sub => sub.callback !== callback);

        // Clean active world
        const wrapper = this.eventWrappers.get(callback);
        if (wrapper && this.world) {
            this.world.unsubscribe(event, wrapper);
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

    public dispose() {
        this.world?.dispose();
    }
}
