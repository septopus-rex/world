import { World, ISystem } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { SystemMode } from '../types/SystemMode';
import { Coords } from '../utils/Coords';

/**
 * GameZoneSystem — derives "is the player standing in a PLAYABLE block?" from the
 * block-level `game` flag (BlockComponent.game / raw[4]) and publishes it as
 * `world.gameZoneActive` plus `game.zone_enter` / `game.zone_exit` events.
 *
 * WHY a block flag and not an adjunct/trigger: Game-mode entry must be gated on
 * a single, explicit, block-level signal that ANY interpreter (the 3D engine is
 * only one) can read straight off the block data — eventually on-chain — without
 * scanning/collapsing adjuncts. That is the canonical, interpreter-agnostic
 * entry contract (the new-engine successor to the old engine's
 * BLOCK_INDEX_GAME_SETTING + block:in/out 'mode' menu). See
 * docs/systems/game-mode-entry.md.
 *
 * The system only DERIVES the affordance + auto-exits Game on leaving the zone;
 * the actual entry is an explicit player action (a confirm button, or a
 * data-driven trigger via the actuator's player.enterGame), which funnels into
 * the zone-gated World.setMode(Game).
 */
export class GameZoneSystem implements ISystem {
    /** Block key (`x_y`) whose game zone the player is currently inside, or null. */
    private activeKey: string | null = null;

    // Runs every frame (no throttle): the loaded-block set is tiny, so the cost
    // is negligible, and the zone affordance should appear the instant the player
    // steps onto a playable block (also keeps short-step tests deterministic).
    public update(world: World): void {
        // While a ride carries the player (CoasterSystem owns the position), freeze
        // zone tracking: a rail that crosses a block boundary must not auto-exit
        // Game mode out from under the rider.
        if (world.rideActive) return;

        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        if (players.length === 0) return;
        const t = world.getComponent<TransformComponent>(players[0], "TransformComponent");
        if (!t) return;

        const spp = Coords.engineToSpp([t.position[0], t.position[1], t.position[2]]);
        const bx = spp.block[0], by = spp.block[1];
        const key = `${bx}_${by}`;
        const game = this.blockGame(world, bx, by);
        const inZone = game >= 1;

        if (inZone && this.activeKey !== key) {
            // Entered a (new) game zone. If we somehow jumped straight from one
            // zone to another, close the old one first.
            if (this.activeKey !== null) this.leaveZone(world, this.activeKey);
            this.activeKey = key;
            world.gameZoneActive = true;
            world.events.emit('game.zone_enter', { block: [bx, by], key, game });
        } else if (!inZone && this.activeKey !== null) {
            this.leaveZone(world, this.activeKey);
        }
    }

    /** Leave the active zone: clear the flag + announce it. Whether we also drop
     *  out of Game depends on the active session's exitPolicy:
     *   - 'ephemeral' (default): silent auto-exit — `setMode(Normal)` tears the
     *     round down (the arcade-cabinet model).
     *   - 'confirm': KEEP the round alive (mode stays Game, the session's
     *     activeGameBlock anchor is untouched, so native Systems don't tear down)
     *     and emit `game.leave_intent` so the interpreter can ask "leave game?".
     *     The player then exits (exitGame) or walks back in to resume. */
    private leaveZone(world: World, key: string): void {
        const [bxs, bys] = key.split('_');
        const block: [number, number] = [Number(bxs), Number(bys)];
        this.activeKey = null;
        world.gameZoneActive = false;
        world.events.emit('game.zone_exit', { block, key });
        if (world.mode === SystemMode.Game) {
            if (world.gameExitPolicy === 'confirm') {
                world.events.emit('game.leave_intent', { block, key });
            } else {
                world.setMode(SystemMode.Normal);
            }
        }
    }

    /** The game flag of the (loaded) block at [bx,by]; 0 if not loaded / not a
     *  game block. Loaded set is small (the streamed neighbourhood). */
    private blockGame(world: World, bx: number, by: number): number {
        for (const eid of world.getEntitiesWith(["BlockComponent"])) {
            const b = world.getComponent<BlockComponent>(eid, "BlockComponent");
            if (b && b.x === bx && b.y === by) return b.game ?? 0;
        }
        return 0;
    }
}
