import { World, ISystem } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { BehaviorComponent, ProjectileComponent } from '../components/NpcComponents';
import { damageNpc } from '../utils/Combat';
import { SystemMode } from '../types/SystemMode';

/**
 * ProjectileSystem — flight, hit test and expiry for projectile entities
 * (F3, spec combat-damage.md §1.3). Straight-line, simulation-time motion;
 * center-distance sphere test against the player and living NPC agents.
 *
 * Damage lands ONLY in Game mode (the permission matrix) — a projectile still
 * in flight when the mode exits keeps flying and expiring but hits for zero.
 */
export class ProjectileSystem implements ISystem {
    public update(world: World, dt: number): void {
        const projectiles = world.getEntitiesWith(["ProjectileComponent", "TransformComponent"]);
        if (projectiles.length === 0) return;

        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        const playerId = players[0];
        const pTrans = playerId !== undefined
            ? world.getComponent<TransformComponent>(playerId, "TransformComponent") : null;
        const blocks: any = world.systems.findSystemByName('BlockSystem');

        // Living NPC targets, gathered once per frame.
        const npcs: Array<{ eid: number; t: TransformComponent; id: string }> = [];
        for (const eid of world.getEntitiesWith(["BehaviorComponent", "TransformComponent"])) {
            const b = world.getComponent<BehaviorComponent>(eid, "BehaviorComponent");
            if (!b || b.dead) continue;
            const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            npcs.push({ eid, t: world.getComponent<TransformComponent>(eid, "TransformComponent")!, id: String(adj?.adjunctId ?? '') });
        }

        for (const eid of projectiles) {
            const p = world.getComponent<ProjectileComponent>(eid, "ProjectileComponent")!;
            const t = world.getComponent<TransformComponent>(eid, "TransformComponent")!;

            t.position[0] += p.velocity[0] * dt;
            t.position[1] += p.velocity[1] * dt;
            t.position[2] += p.velocity[2] * dt;
            t.dirty = true;
            p.ttl -= dt;

            let dead = p.ttl <= 0;

            if (!dead && world.mode === SystemMode.Game) {
                // Player hit: sphere vs body-center (~1m above feet).
                if (pTrans && playerId !== undefined) {
                    const d = Math.hypot(
                        t.position[0] - pTrans.position[0],
                        t.position[1] - (pTrans.position[1] + 1.0),
                        t.position[2] - pTrans.position[2]);
                    if (d < p.radius + 0.5) {
                        world.events?.emit?.('combat.hit', { targetKind: 'player', amount: p.damage });
                        world.emitSimple('player:damage', { amount: p.damage }, playerId);
                        dead = true;
                    }
                }
                // NPC hits (never the shooter itself).
                if (!dead) {
                    for (const n of npcs) {
                        if (n.id === p.shooterId) continue;
                        const d = Math.hypot(
                            t.position[0] - n.t.position[0],
                            t.position[1] - (n.t.position[1] + 0.6),
                            t.position[2] - n.t.position[2]);
                        if (d < p.radius + 0.6) {
                            damageNpc(world, n.eid, p.damage);
                            dead = true;
                            break;
                        }
                    }
                }
            }

            if (dead) blocks?.despawnRuntime?.(world, eid, 'despawn');
        }
    }
}
