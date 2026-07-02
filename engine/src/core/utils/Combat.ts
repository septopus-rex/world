import { World, EntityId } from '../World';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { BehaviorComponent } from '../components/NpcComponents';
import { MeshComponent } from '../components/VisualizationComponents';

/**
 * damageNpc — the ONE damage sink for NPC targets (combat spec §1.2), shared by
 * the actuator `damage` action and ProjectileSystem.
 *
 * Death flow: run the behavior document's top-level `onDeath` actions (full
 * actuator vocabulary — loot drops are a `spawn` of a b5 row, zero new
 * primitives), emit npc.died, then:
 *   - spawner-DERIVED agent → real despawn (frees its maxAlive slot);
 *   - AUTHORED agent → hidden + inert, entity KEPT (destroying it would drop
 *     its row from the next draft save = content loss); block reload revives.
 *
 * Returns true when damage was applied (target exists, damageable, alive).
 */
export function damageNpc(world: World, eid: EntityId, amount: number): boolean {
    const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
    const b = world.getComponent<BehaviorComponent>(eid, "BehaviorComponent");
    if (!adj || !b || b.dead || b.maxHp <= 0) return false;

    b.hp -= Math.max(0, amount);
    world.events?.emit?.('combat.hit', { targetKind: 'npc', adjunctId: String(adj.adjunctId), amount });
    if (b.hp > 0) return true;

    // ── death ──
    b.dead = true;
    const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
    const onDeath = b.doc?.onDeath;
    if (Array.isArray(onDeath)) {
        for (const a of onDeath) {
            world.actuator.execute(a, { world, playerId: players[0] ?? null, mode: world.mode, sourceEntity: eid });
        }
    }
    world.events?.emit?.('npc.died', { adjunctId: String(adj.adjunctId) });

    const blocks: any = world.systems.findSystemByName('BlockSystem');
    if (adj.stdData?.derivedFrom) {
        blocks?.despawnRuntime?.(world, eid, 'despawn');
    } else {
        // Authored: hide + stay (revived by block reload).
        const mesh = world.getComponent<MeshComponent>(eid, "MeshComponent");
        if (mesh?.handle) (world.renderEngine as any).setObjectVisible?.(mesh.handle, false);
    }
    return true;
}
