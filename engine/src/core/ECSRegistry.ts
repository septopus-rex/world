import { EntityId, ComponentType, ComponentData } from './World';

/**
 * ECSRegistry: Manages entities and components.
 * Extracted from World.ts to separate state management from orchestration.
 */
export class ECSRegistry {
    private entities: Set<EntityId> = new Set();
    private components: Map<ComponentType, Map<EntityId, ComponentData>> = new Map();
    private entityCounter: number = 0;

    public createEntity(): EntityId {
        const id = ++this.entityCounter;
        this.entities.add(id);
        return id;
    }

    public removeEntity(id: EntityId): void {
        this.entities.delete(id);
        for (const compMap of this.components.values()) {
            compMap.delete(id);
        }
    }

    public addComponent<T>(entityId: EntityId, type: ComponentType, data: T): void {
        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }
        this.components.get(type)!.set(entityId, data);
    }

    public getComponent<T>(entityId: EntityId, type: ComponentType): T | undefined {
        return this.components.get(type)?.get(entityId);
    }

    public removeComponent(entityId: EntityId, type: ComponentType): void {
        this.components.get(type)?.delete(entityId);
    }

    public queryEntities(type: ComponentType): EntityId[] {
        const compMap = this.components.get(type);
        return compMap ? Array.from(compMap.keys()) : [];
    }

    public getEntitiesWith(types: ComponentType[]): EntityId[] {
        if (types.length === 0) return Array.from(this.entities);

        // Start with entities having the first component
        let results = this.queryEntities(types[0]);

        // Intersect with entities having subsequent components
        for (let i = 1; i < types.length; i++) {
            const nextTypeEntities = new Set(this.queryEntities(types[i]));
            results = results.filter(id => nextTypeEntities.has(id));
        }

        return results;
    }

    public clear(): void {
        this.entities.clear();
        this.components.clear();
        this.entityCounter = 0;
    }
}
