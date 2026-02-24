import { World, ISystem } from './World';

/**
 * SystemManager: Manages system registration and execution order.
 * Extracted from World.ts to separate orchestration from logic.
 */
export class SystemManager {
    private systems: ISystem[] = [];

    public addSystem(system: ISystem): void {
        this.systems.push(system);
    }

    public update(world: World, dt: number): void {
        for (const system of this.systems) {
            system.update(world, dt);
        }
    }

    public findSystem<T extends ISystem>(ctor: new (...args: any[]) => T): T | undefined {
        return this.systems.find(s => s instanceof ctor) as T;
    }

    public findSystemByName(name: string): ISystem | undefined {
        return this.systems.find(s => s.constructor.name === name);
    }

    public clear(): void {
        this.systems = [];
    }
}
