/**
 * AdjunctDefaults — sensible starter raw rows for palette placement.
 *
 * `pos` is the clicked surface point in SPP coords (block-local, z = surface
 * altitude); each entry lifts volumetric types by half their height so the
 * new object sits ON the surface instead of straddling it. Creators refine
 * everything afterwards through the edit form.
 *
 * Module (a4) is NOT in PLACEABLE_ADJUNCTS — it needs a resource. The editor
 * palette appends one module button per registered model (world.moduleCatalog)
 * and calls defaultRawFor(AdjunctType.Module, pos, { resource }) with the chosen id.
 */

import { AdjunctType } from '../types/AdjunctType';

type Pos = [number, number, number];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Per-type placement options (module needs a resource id). */
export interface PlaceOpts { resource?: number | string; }

export const PLACEABLE_ADJUNCTS: ReadonlyArray<{ typeId: number; label: string }> = [
    { typeId: AdjunctType.Wall, label: 'Wall' },
    { typeId: AdjunctType.Box, label: 'Box' },
    { typeId: AdjunctType.Water, label: 'Water' },
    { typeId: AdjunctType.Light, label: 'Light' },
    { typeId: AdjunctType.Cone, label: 'Cone' },
    { typeId: AdjunctType.Ball, label: 'Ball' },
    { typeId: AdjunctType.Stop, label: 'Stop' },
    { typeId: AdjunctType.Item, label: 'Item' },
    { typeId: AdjunctType.Trigger, label: 'Trigger' },
    { typeId: AdjunctType.Particle, label: 'SPP Cell' },
    { typeId: AdjunctType.Motif, label: 'Motif' },
    { typeId: AdjunctType.Link, label: 'Link' },
    { typeId: AdjunctType.Audio, label: 'Audio' },
    { typeId: AdjunctType.Video, label: 'Video' },
    { typeId: AdjunctType.Spawner, label: 'Spawner' },
    { typeId: AdjunctType.Npc, label: 'NPC' },
];

export function defaultRawFor(typeId: number, pos: Pos, opts?: PlaceOpts): any[] | null {
    const [x, y, z] = [r2(pos[0]), r2(pos[1]), r2(pos[2])];
    switch (typeId) {
        case AdjunctType.Module: // module: [size, pos, rot, resourceId] — picked model id
            return [[2, 2, 2], [x, y, z + 1], [0, 0, 0], opts?.resource ?? 0];
        case AdjunctType.Wall: // wall: [size, pos, rot, texture, repeat, animation, stop]
            return [[2, 0.3, 2.5], [x, y, z + 1.25], [0, 0, 0], 0, [1, 1], 0, 1];
        case AdjunctType.Box: // box
            return [[1, 1, 1], [x, y, z + 0.5], [0, 0, 0], 0, [1, 1], 0, 0];
        case AdjunctType.Water: // water
            return [[2, 2, 0.6], [x, y, z + 0.3], [0, 0, 0], 0, [1, 1], 0, 0];
        case AdjunctType.Light: // light: [lightType, pos, rot, color, intensity, distance, angle, shadow]
            return [1, [x, y, z + 2.5], [0, 0, 0], 0xffeedd, 1, 12, Math.PI / 3, 0];
        case AdjunctType.Cone: // cone
            return [[0.8, 0.8, 1], [x, y, z + 0.5], [0, 0, 0], 0, [1, 1], 0, 0];
        case AdjunctType.Ball: // ball
            return [[0.8, 0.8, 0.8], [x, y, z + 0.4], [0, 0, 0], 0, [1, 1], 0, 0];
        case AdjunctType.Stop: // stop: [size, pos, rot, stopMode, animation]
            return [[1, 1, 1], [x, y, z + 0.5], [0, 0, 0], 0, null];
        case AdjunctType.Item: // item: [pos, templateId, seed, count, rot] — gem, no random attrs
            return [[x, y, z + 0.4], 1, 0, 1, [0, 0, 0]];
        case AdjunctType.Trigger: // trigger: [size, offset, rot, shape, gameOnly, events]
            return [[2, 2, 2], [x, y, z + 1], [0, 0, 0], 1, 0, []];
        case AdjunctType.Particle: // SPP particle: [origin, cells, theme] — one solid 4m cell
            // faces: [Top, Bottom, Front(S), Back(N), Left(W), Right(E)], [state, variant]
            //   state 1=closed 0=open · closed variant 0=solid 1=doorway 2=window
            return [[x, y, z], [{ position: [0, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]] }], 'basic'];
        case AdjunctType.Motif: // motif: [origin, template, seed, params] — generative content
            // Seed derived from the placement point so each motif differs by
            // location (deterministic, no randomness) — refine via the edit form.
            return [[x, y, z], 'totem', Math.abs(Math.round(x * 131 + y * 977)) % 100000, null];
        case AdjunctType.Link: // link: [size, pos, rot, resource, repeat, animate, stop, url, texture?]
            return [[2, 0.1, 2], [x, y, z + 1], [0, 0, 0], 0, [1, 1], null, null, 'https://example.com'];
        case AdjunctType.Audio: // audio: [size, pos, rot, source, autoplay, loop, volume, refDistance]
            return [[0.4, 0.4, 0.4], [x, y, z + 0.4], [0, 0, 0], opts?.resource ?? '', 1, 1, 1, 8];
        case AdjunctType.Video: // video: [size, pos, rot, source, autoplay, loop, muted, volume]
            return [[3.2, 0.1, 1.8], [x, y, z + 1.2], [0, 0, 0], opts?.resource ?? '', 1, 1, 1, 1];
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
