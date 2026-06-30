import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * tumbleScene — the NATIVE in-world block-tower (Jenga), Pattern B, and the first
 * native game with a REAL rigid-body topple (TumbleSystem drives a scoped rapier
 * world). Like the other native games it's ZONE-GATED + TRIGGER-ENTERED: the
 * scene is just a coarse "playable here" bit (raw[4]=1) plus a GAME TRIGGER that
 * fires enterGame when you walk up to the tower. TumbleSystem builds the 15×3
 * tower of a2 box pieces ON ENTERING Game and tears it down on leaving; clicking
 * a piece in-world pulls it (interact.primary → the System) and the rest reacts.
 *
 * Sits NE of the demo spawn (pool N, mahjong W, shooting S, external-mahjong E),
 * so it joins the cluster of games the player can walk between.
 */

/** Block carrying the native tumble tower — NE of spawn. */
export const TUMBLE_BLOCK: [number, number] = [2049, 2049];

/** Tower centre (block-local SPP). TumbleSystem builds the stack here, standing on
 *  the block ground; the player walks up and clicks pieces to pull them. */
export const TUMBLE_ORIGIN: [number, number] = [8, 8];

export function buildTumbleScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);

    // GAME TRIGGER (b8): walking up to the tower ENTERS Game (trigger-borne entry,
    // docs/systems/game-mode-entry.md §1). enterGame carries the per-game exitPolicy
    // — 'ephemeral' here: an arcade cabinet, walk off the block and the round ends,
    // walk back and a fresh tower is built. Volume is centred on the tower so you
    // enter by approaching it (gameOnly=0 → fires in Normal). row format =
    // [size, centre, rot, shape(1=box), gameOnly, [{type, oneTime?, actions}]].
    const enterTumble = { type: 'player', method: 'enterGame', params: [{ exitPolicy: 'ephemeral' }] };
    data.raw[2].push([AdjunctType.Trigger, [
        [[5, 5, 3], [TUMBLE_ORIGIN[0], TUMBLE_ORIGIN[1], 1.5], [0, 0, 0], 1, 0, [{ type: 'in', oneTime: false, actions: [enterTumble] }]],
    ]]);

    // raw[4] = coarse "this block is playable" bit (the zone gate scoping where
    // enterGame may succeed). Not an external-app id — the rich declaration is on
    // the trigger; TumbleSystem owns the game natively.
    data.raw[4] = 1;
    return data.raw;
}
