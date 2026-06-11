import { World, ISystem, EntityId, GameEvent } from '../World';
import { HealthComponent } from '../components/HealthComponent';
import { TransformComponent, RigidBodyComponent } from '../components/PlayerComponents';

/**
 * HealthSystem — the death/respawn gameplay loop.
 *
 *   player:fell    (CharacterController, drop ≥ fallDeathHeight) → lethal
 *   player:damage  ({amount}, e.g. actuator 'player' action, Game mode) → hp loss
 *   player:heal    ({amount}) → hp gain, clamped to maxHp
 *
 * hp ≤ 0 → emit player:died {cause}, teleport to the world spawn point, reset
 * velocity, restore full hp, emit player:respawned. Every change broadcasts
 * player:health {hp, maxHp} for the UI.
 */
export class HealthSystem implements ISystem {
    private world!: World;
    private _subscribed = false;

    public update(world: World, _dt: number): void {
        this.world = world;
        if (this._subscribed || typeof world.on !== 'function') return;
        world.on('player:fell', (ev: GameEvent) => this.onFell(ev));
        world.on('player:damage', (ev: GameEvent) => this.applyDelta(ev, -(ev?.payload?.amount ?? 0), 'damage'));
        world.on('player:heal', (ev: GameEvent) => this.applyDelta(ev, +(ev?.payload?.amount ?? 0), 'heal'));
        this._subscribed = true;
    }

    private playerId(ev?: GameEvent): EntityId | null {
        if (ev?.source !== undefined && ev.source !== null) return ev.source;
        const players = this.world.queryEntities("HealthComponent", "InputStateComponent");
        return players.length > 0 ? players[0] : null;
    }

    /** A registered lethal fall (drop already ≥ fallDeathHeight) kills outright. */
    private onFell(ev: GameEvent): void {
        const eid = this.playerId(ev);
        const health = eid !== null ? this.world.getComponent<HealthComponent>(eid, "HealthComponent") : null;
        if (eid === null || !health) return;
        health.hp = 0;
        this.world.emitSimple('player:health', { hp: health.hp, maxHp: health.maxHp }, eid);
        this.die(eid, health, 'fall');
    }

    private applyDelta(ev: GameEvent, delta: number, kind: string): void {
        if (!delta) return;
        const eid = this.playerId(ev);
        const health = eid !== null ? this.world.getComponent<HealthComponent>(eid, "HealthComponent") : null;
        if (eid === null || !health) return;

        health.hp = Math.min(health.maxHp, health.hp + delta);
        this.world.emitSimple('player:health', { hp: health.hp, maxHp: health.maxHp }, eid);
        if (health.hp <= 0) this.die(eid, health, kind);
    }

    private die(eid: EntityId, health: HealthComponent, cause: string): void {
        const world = this.world;
        world.emitSimple('player:died', { cause }, eid);

        // Respawn at the world spawn point (config.player.start is already in
        // engine coords after bootWorld's conversion).
        const start = (world.config as any)?.player?.start;
        const trans = world.getComponent<TransformComponent>(eid, "TransformComponent");
        const body = world.getComponent<RigidBodyComponent>(eid, "RigidBodyComponent");
        if (trans && Array.isArray(start?.position)) {
            trans.position[0] = start.position[0];
            trans.position[1] = start.position[1];
            trans.position[2] = start.position[2];
            trans.dirty = true;
        }
        if (body) {
            body.velocity[0] = body.velocity[1] = body.velocity[2] = 0;
            body.isGrounded = false;
        }

        health.hp = health.maxHp;
        world.emitSimple('player:health', { hp: health.hp, maxHp: health.maxHp }, eid);
        world.emitSimple('player:respawned', { position: trans ? [...trans.position] : null, cause }, eid);
    }
}
