/**
 * AdjunctDefaults — sensible starter raw rows for palette placement.
 *
 * `pos` is the clicked surface point in Septopus coords (block-local, z = surface
 * altitude); each entry lifts volumetric types by half their height so the
 * new object sits ON the surface instead of straddling it. Creators refine
 * everything afterwards through the edit form.
 *
 * Module (a4) is NOT in PLACEABLE_ADJUNCTS — it needs a resource. The editor
 * palette appends one module button per registered model (world.moduleCatalog)
 * and calls defaultRawFor(AdjunctType.Module, pos, { resource }) with the chosen id.
 *
 * ── Two callers, one source (2026-08-05) ─────────────────────────────────────
 * A raw row of the common shape is `[size, pos, rot, ...tail]`, and the two
 * halves have different owners:
 *   · `[size, pos, rot]` is WHERE the thing goes — world-absolute here, but the
 *     SPP option editor expresses the same three slots as a normalized unit
 *     frame (u/v/su/sv/w/sw), so it cannot reuse these.
 *   · `tail` (slots 3+) is WHAT the thing looks like / does — colour, texture,
 *     repeat, animation, stop mode, url… — and is entirely position-independent,
 *     so BOTH editors want the identical defaults.
 * `defaultTailFor` therefore owns the tails; `defaultRawFor` prefixes them with
 * the placement triple. The SPP library editor consumes the tails through
 * `spp/Variants.listOptionPartKinds()`. Before this split the editor kept a
 * hand-copied second list of 5 types (which had already drifted into being an
 * arbitrary subset); adding a type now updates both palettes at once.
 */

import { AdjunctType } from '../types/AdjunctType';

type Pos = [number, number, number];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Per-type placement options (module needs a resource id). */
export interface PlaceOpts { resource?: number | string; }

/**
 * Types whose raw begins with the `[size, pos, rot]` triple — the ONLY types a
 * unit-frame editor can place, since that frame is exactly what fills those
 * three slots. `size` = starter dimensions, `lift` = how far above the clicked
 * surface the centre sits (half the height, so it rests ON the ground).
 *
 * Deliberately absent (their raw starts differently, so they have no tail and
 * cannot be expressed in a unit frame): a3 light `[lightType, pos, …]` ·
 * b5 item `[pos, templateId, …]` · b6 SPP source · c2 motif · b7 spawner ·
 * f1 npc — all of them sources/logic rather than surface geometry.
 */
const PLACEMENT: Readonly<Record<number, { size: number[]; lift: number }>> = {
    [AdjunctType.Module]: { size: [2, 2, 2], lift: 1 },
    [AdjunctType.Wall]: { size: [2, 0.3, 2.5], lift: 1.25 },
    [AdjunctType.Box]: { size: [1, 1, 1], lift: 0.5 },
    [AdjunctType.Water]: { size: [2, 2, 0.6], lift: 0.3 },
    [AdjunctType.Cone]: { size: [0.8, 0.8, 1], lift: 0.5 },
    [AdjunctType.Ball]: { size: [0.8, 0.8, 0.8], lift: 0.4 },
    [AdjunctType.Sign]: { size: [1.2, 2], lift: 2.2 },      // flat plane: size is [E, N]
    [AdjunctType.Stop]: { size: [1, 1, 1], lift: 0.5 },
    [AdjunctType.Trigger]: { size: [2, 2, 2], lift: 1 },
    [AdjunctType.Link]: { size: [2, 0.1, 2], lift: 1 },
    [AdjunctType.Audio]: { size: [0.4, 0.4, 0.4], lift: 0.4 },
    [AdjunctType.Video]: { size: [3.2, 0.1, 1.8], lift: 1.2 },
    [AdjunctType.Book]: { size: [0.7, 0.2, 0.9], lift: 1 },
    [AdjunctType.Board]: { size: [2.4, 0.15, 1.6], lift: 0.8 },
};

/** Starter `[size, lift]` for a placement-shaped type, or null. */
export function placementFor(typeId: number): { size: number[]; lift: number } | null {
    return PLACEMENT[typeId] ?? null;
}

/** Every `[size, pos, rot, …]`-shaped type id. This is a SHAPE fact, not a
 *  curated menu — unlike PLACEABLE_ADJUNCTS (which omits a4 module because the
 *  world palette needs a model picked first, a UI concern). Unit-frame editors
 *  enumerate from here, so a4 IS available to them. */
export function placementTypes(): number[] {
    return Object.keys(PLACEMENT).map(Number);
}

/**
 * The position-INDEPENDENT half of a starter raw: slots 3+ ("the tail"). Both
 * the world palette (via defaultRawFor) and the SPP option editor (via
 * listOptionPartKinds) read their defaults from here, so a type's look/behaviour
 * defaults are defined exactly once.
 *
 * Returns null for types that are not `[size, pos, rot, …]`-shaped — see the
 * PLACEMENT note above. A null answer is the machine-checkable form of "this
 * type cannot go into a unit frame".
 */
export function defaultTailFor(typeId: number, opts?: PlaceOpts): any[] | null {
    switch (typeId) {
        case AdjunctType.Module: // [resourceId] — the picked model
            return [opts?.resource ?? 0];
        case AdjunctType.Wall:   // [texture, repeat, animation, stop]
            return [0, [1, 1], 0, 1];
        case AdjunctType.Box:
        case AdjunctType.Water:
        case AdjunctType.Cone:
        case AdjunctType.Ball:
            return [0, [1, 1], 0, 0];
        case AdjunctType.Sign:   // [texture, opacity] — unlit guide plane
            return [7, 1];
        case AdjunctType.Stop:   // [stopMode, animation]
            return [0, null];
        case AdjunctType.Trigger: // [shape, gameOnly, events]
            return [1, 0, []];
        case AdjunctType.Link:   // [resource, repeat, animate, stop, url]
            return [0, [1, 1], null, null, 'https://example.com'];
        case AdjunctType.Audio:  // [source, autoplay, loop, volume, refDistance]
            return [opts?.resource ?? '', 1, 1, 1, 8];
        case AdjunctType.Video:  // [source, autoplay, loop, muted, volume]
            return [opts?.resource ?? '', 1, 1, 1, 1];
        case AdjunctType.Board:  // [resource, repeat, animate, stop, channel, title]
            return [0, [1, 1], null, null, 'lobby', '留言板'];
        case AdjunctType.Book:   // [resource, repeat, animate, stop, pages, title]
            return [0, [1, 1], null, null,
                ['第一页：点击书本可以翻页。', '第二页：文字以 string[] 承载，可存于 IPFS。', '（合上书本。）'], '无题之书'];
        default:
            return null;
    }
}

export const PLACEABLE_ADJUNCTS: ReadonlyArray<{ typeId: number; label: string }> = [
    { typeId: AdjunctType.Wall, label: 'Wall' },
    { typeId: AdjunctType.Box, label: 'Box' },
    { typeId: AdjunctType.Water, label: 'Water' },
    { typeId: AdjunctType.Light, label: 'Light' },
    { typeId: AdjunctType.Cone, label: 'Cone' },
    { typeId: AdjunctType.Ball, label: 'Ball' },
    { typeId: AdjunctType.Sign, label: 'Sign' },
    { typeId: AdjunctType.Stop, label: 'Stop' },
    { typeId: AdjunctType.Item, label: 'Item' },
    { typeId: AdjunctType.Trigger, label: 'Trigger' },
    { typeId: AdjunctType.Spp, label: 'SPP' },
    { typeId: AdjunctType.Motif, label: 'Motif' },
    { typeId: AdjunctType.Link, label: 'Link' },
    { typeId: AdjunctType.Audio, label: 'Audio' },
    { typeId: AdjunctType.Video, label: 'Video' },
    { typeId: AdjunctType.Book, label: 'Book' },
    { typeId: AdjunctType.Board, label: 'Board' },
    { typeId: AdjunctType.Spawner, label: 'Spawner' },
    { typeId: AdjunctType.Npc, label: 'NPC' },
];

export function defaultRawFor(typeId: number, pos: Pos, opts?: PlaceOpts): any[] | null {
    const [x, y, z] = [r2(pos[0]), r2(pos[1]), r2(pos[2])];
    // The common shape: placement triple + the shared, position-independent tail.
    const place = PLACEMENT[typeId];
    const tail = defaultTailFor(typeId, opts);
    if (place && tail) return [place.size, [x, y, z + place.lift], [0, 0, 0], ...tail];
    // Everything else has its own raw layout (source / logic types).
    switch (typeId) {
        case AdjunctType.Light: // light: [lightType, pos, rot, color, intensity, distance, angle, shadow]
            return [1, [x, y, z + 2.5], [0, 0, 0], 0xffeedd, 1, 12, Math.PI / 3, 0];
        case AdjunctType.Item: // item: [pos, templateId, seed, count, rot] — gem, no random attrs
            return [[x, y, z + 0.4], 1, 0, 1, [0, 0, 0]];
        case AdjunctType.Spp: // SPP source: [origin, cells, theme] — one solid 4m cell
            // faces: [Top, Bottom, Front(S), Back(N), Left(W), Right(E)], [state, variant]
            //   state 1=closed 0=open · closed variant 0=solid 1=doorway 2=window
            return [[x, y, z], [{ position: [0, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]] }], 'basic'];
        case AdjunctType.Motif: // motif: [origin, template, seed, params] — generative content
            // Seed derived from the placement point so each motif differs by
            // location (deterministic, no randomness) — refine via the edit form.
            return [[x, y, z], 'totem', Math.abs(Math.round(x * 131 + y * 977)) % 100000, null];
        case AdjunctType.Npc: // npc: [pos, visual, behavior, seed] — friendly wanderer demo
            return [[x, y, z], { shape: 'box', size: [0.6, 0.6, 1.7], color: 0xcc8844 }, {
                initial: 'idle',
                states: {
                    idle: { move: { kind: 'stay' }, transitions: [{ when: { '>': [{ var: 'npc.timeInState' }, 2] }, to: 'wander' }] },
                    wander: { move: { kind: 'wander', speed: 1.2, radius: 3 }, transitions: [{ when: { '<': [{ var: 'npc.distToPlayer' }, 2] }, to: 'idle' }] },
                },
            }, 0];
        case AdjunctType.Spawner: // spawner: [pos, template, interval, maxAlive, autoStart, seed]
            // Default template: a small box popping up 1m above the spawner every 5s (max 3).
            return [[x, y, z], [AdjunctType.Box, [[0.5, 0.5, 0.5], [0, 0, 1], [0, 0, 0], 2, [1, 1], 0, 0]], 5, 3, 1, 0];
        default:
            return null;
    }
}
