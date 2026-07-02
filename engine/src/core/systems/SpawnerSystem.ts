import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { spawnRelative } from '../utils/Spawn';
import type { TaskHandle } from '../services/Scheduler';

/**
 * SpawnerSystem — arms b9 spawner adjuncts on the world scheduler (F1, spec
 * docs/plan/specs/scheduler-and-spawn.md §3.2).
 *
 * Lifecycle contract (spec §2.4):
 *   block loads   → spawner entity appears → armed: every(interval) task
 *   task fires    → count live derivedFrom-me entities; below maxAlive → spawn
 *   block evicts  → spawner entity gone → disarmed (children died with block)
 *   spawner edited-out → disarmed + its children destroyed (spawner_deleted)
 *   re-entry      → fresh arm, fresh timers (nothing persisted — spec §2.2)
 *
 * A stale task firing after its spawner died is a safe no-op (component gone).
 */
export class SpawnerSystem implements ISystem {
    /** armed spawner entity → its repeat-task handle + adjunctId (for cleanup). */
    private armed = new Map<EntityId, { handle: TaskHandle; adjunctId: string }>();

    public update(world: World, _dt: number): void {
        const seen = new Set<EntityId>();

        for (const eid of world.getEntitiesWith(["AdjunctComponent"])) {
            const a = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            const std = a?.stdData;
            if (!a || std?.typeId !== AdjunctType.Spawner) continue;
            // A spawner that was itself runtime-spawned is NOT armed — spawners
            // spawning spawners is unbounded recursion territory (v2, if ever).
            if (std.derivedFrom) continue;
            seen.add(eid);
            if (this.armed.has(eid)) continue;
            if (!std.autoStart) continue;

            const interval = Number(std.interval) > 0 ? Number(std.interval) : 5;
            const handle = world.scheduler.every(interval, () => this.trySpawn(world, eid));
            this.armed.set(eid, { handle, adjunctId: String(a.adjunctId) });
        }

        // Disarm spawners whose entity is gone (evicted or deleted). Eviction
        // already destroyed the children with the block (destroyDerived is a
        // no-op then); an edit-delete leaves them behind → clean up here.
        for (const [eid, entry] of this.armed) {
            if (seen.has(eid)) continue;
            world.scheduler.cancel(entry.handle);
            this.armed.delete(eid);
            const blocks: any = world.systems.findSystemByName('BlockSystem');
            blocks?.destroyDerived?.(world, entry.adjunctId);
        }
    }

    private trySpawn(world: World, spawnerEid: EntityId): void {
        const a = world.getComponent<AdjunctComponent>(spawnerEid, "AdjunctComponent");
        const std = a?.stdData;
        if (!a || !std || a.parentBlockEntityId == null) return; // stale task — disarmed next update
        const template = std.template;
        if (!Array.isArray(template) || template.length < 2 || !Array.isArray(template[1])) return;

        // maxAlive: live entities this spawner produced.
        let alive = 0;
        for (const eid of world.getEntitiesWith(["AdjunctComponent"])) {
            const b = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            if (b?.stdData?.derivedFrom === a.adjunctId) alive++;
        }
        if (alive >= (Number(std.maxAlive) > 0 ? Number(std.maxAlive) : 1)) return;

        const res = spawnRelative(world, a.parentBlockEntityId, Number(template[0]), template[1], std, String(a.adjunctId));
        if (res) {
            world.events?.emit?.('spawn.created', {
                adjunctId: res.adjunctId, typeId: Number(template[0]), spawnerId: String(a.adjunctId),
            });
        }
    }
}
