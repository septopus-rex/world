import { EntityId, ComponentType, ComponentData } from './World';

/**
 * ECSRegistry: Manages entities and components.
 * Extracted from World.ts to separate state management from orchestration.
 *
 * OPTIMIZATION: Query results are cached and invalidated on any structural change.
 * After world load stabilises, per-frame queryEntities / getEntitiesWith calls become O(1).
 */
export class ECSRegistry {
    private entities: Set<EntityId> = new Set();
    private components: Map<ComponentType, Map<EntityId, ComponentData>> = new Map();
    private entityCounter: number = 0;

    // Query result cache — key is a sorted, pipe-joined component type string
    private queryCache: Map<string, EntityId[]> = new Map();

    // ── Cache helpers ──────────────────────────────────────────────────────────

    private makeCacheKey(types: ComponentType[]): string {
        return types.length === 1 ? types[0] : [...types].sort().join('|');
    }

    /** Invalidate all cached queries that reference the given component type(s). */
    private invalidateCache(types: ComponentType[]): void {
        if (this.queryCache.size === 0) return;
        for (const key of this.queryCache.keys()) {
            for (const t of types) {
                if (key === t || key.includes(t)) {
                    this.queryCache.delete(key);
                    break;
                }
            }
        }
    }

    /** Full cache clear — used when an entity is destroyed (affects all types). */
    private invalidateAll(): void {
        this.queryCache.clear();
    }

    // ── Entity management ──────────────────────────────────────────────────────

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
        this.invalidateAll();
    }

    // ── Component management ───────────────────────────────────────────────────

    public addComponent<T>(entityId: EntityId, type: ComponentType, data: T): void {
        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }
        this.components.get(type)!.set(entityId, data);
        this.invalidateCache([type]);
    }

    public getComponent<T>(entityId: EntityId, type: ComponentType): T | undefined {
        return this.components.get(type)?.get(entityId);
    }

    public removeComponent(entityId: EntityId, type: ComponentType): void {
        this.components.get(type)?.delete(entityId);
        this.invalidateCache([type]);
    }

    // ── Querying ───────────────────────────────────────────────────────────────

    public queryEntities(type: ComponentType): EntityId[] {
        const cached = this.queryCache.get(type);
        if (cached) return cached;

        const compMap = this.components.get(type);
        const result = compMap ? Array.from(compMap.keys()) : [];
        this.queryCache.set(type, result);
        return result;
    }

    public getEntitiesWith(types: ComponentType[]): EntityId[] {
        if (types.length === 0) return Array.from(this.entities);

        const key = this.makeCacheKey(types);
        const cached = this.queryCache.get(key);
        if (cached) return cached;

        // Start with entities having the first component
        let results = this.queryEntities(types[0]);

        // Intersect with entities having subsequent components
        for (let i = 1; i < types.length; i++) {
            const nextTypeEntities = new Set(this.queryEntities(types[i]));
            results = results.filter(id => nextTypeEntities.has(id));
        }

        this.queryCache.set(key, results);
        return results;
    }

    public clear(): void {
        this.entities.clear();
        this.components.clear();
        this.entityCounter = 0;
        this.queryCache.clear();
    }
}
