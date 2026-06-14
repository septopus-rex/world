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
 * and calls defaultRawFor(0x00a4, pos, { resource }) with the chosen id.
 */

type Pos = [number, number, number];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Per-type placement options (module needs a resource id). */
export interface PlaceOpts { resource?: number | string; }

export const PLACEABLE_ADJUNCTS: ReadonlyArray<{ typeId: number; label: string }> = [
    { typeId: 0x00a1, label: 'Wall' },
    { typeId: 0x00a2, label: 'Box' },
    { typeId: 0x00a5, label: 'Water' },
    { typeId: 0x00a3, label: 'Light' },
    { typeId: 0x00a6, label: 'Cone' },
    { typeId: 0x00a7, label: 'Ball' },
    { typeId: 0x00b4, label: 'Stop' },
    { typeId: 0x00b5, label: 'Item' },
    { typeId: 0x00b8, label: 'Trigger' },
    { typeId: 0x00b6, label: 'SPP Cell' },
    { typeId: 0x00e1, label: 'Link' },
];

export function defaultRawFor(typeId: number, pos: Pos, opts?: PlaceOpts): any[] | null {
    const [x, y, z] = [r2(pos[0]), r2(pos[1]), r2(pos[2])];
    switch (typeId) {
        case 0x00a4: // module: [size, pos, rot, resourceId] — picked model id
            return [[2, 2, 2], [x, y, z + 1], [0, 0, 0], opts?.resource ?? 0];
        case 0x00a1: // wall: [size, pos, rot, texture, repeat, animation, stop]
            return [[2, 0.3, 2.5], [x, y, z + 1.25], [0, 0, 0], 0, [1, 1], 0, 1];
        case 0x00a2: // box
            return [[1, 1, 1], [x, y, z + 0.5], [0, 0, 0], 0, [1, 1], 0, 0];
        case 0x00a5: // water
            return [[2, 2, 0.6], [x, y, z + 0.3], [0, 0, 0], 0, [1, 1], 0, 0];
        case 0x00a3: // light: [lightType, pos, rot, color, intensity, distance, angle, shadow]
            return [1, [x, y, z + 2.5], [0, 0, 0], 0xffeedd, 1, 12, Math.PI / 3, 0];
        case 0x00a6: // cone
            return [[0.8, 0.8, 1], [x, y, z + 0.5], [0, 0, 0], 0, [1, 1], 0, 0];
        case 0x00a7: // ball
            return [[0.8, 0.8, 0.8], [x, y, z + 0.4], [0, 0, 0], 0, [1, 1], 0, 0];
        case 0x00b4: // stop: [size, pos, rot, stopMode, animation]
            return [[1, 1, 1], [x, y, z + 0.5], [0, 0, 0], 0, null];
        case 0x00b5: // item: [pos, templateId, seed, count, rot] — gem, no random attrs
            return [[x, y, z + 0.4], 1, 0, 1, [0, 0, 0]];
        case 0x00b8: // trigger: [size, offset, rot, shape, gameOnly, events]
            return [[2, 2, 2], [x, y, z + 1], [0, 0, 0], 1, 0, []];
        case 0x00b6: // SPP particle: [origin, cells, theme] — one solid 4m cell
            // faces: [Top, Bottom, Front(S), Back(N), Left(W), Right(E)], [state, variant]
            //   state 1=closed 0=open · closed variant 0=solid 1=doorway 2=window
            return [[x, y, z], [{ position: [0, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]] }], 'basic'];
        case 0x00e1: // link: [size, pos, rot, resource, repeat, animate, stop, url, texture?]
            return [[2, 0.1, 2], [x, y, z + 1], [0, 0, 0], 0, [1, 1], null, null, 'https://example.com'];
        default:
            return null;
    }
}
