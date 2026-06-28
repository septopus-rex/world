/**
 * Motif expander (c2) — the pure function that turns a generative content
 * descriptor into STANDARD adjunct rows (a2 boxes). Sibling of the SPP particle
 * expander (core/spp/Expander.ts): the motif row renders nothing itself; each
 * emitted row becomes its own entity with native collision / LOD.
 *
 *   expandMotif([origin, template, seed, params]) → [typeId, rawRow][]
 *
 * "Generative" but DETERMINISTIC: variety comes from the explicit seed via a
 * seeded PRNG, so (template, seed) reproduce identical content anywhere — the
 * very property an iNFT needs, without coupling to any chain. No Math.random,
 * no wall clock.
 */
import { AdjunctType } from '../types/AdjunctType';
import type { ExpandedRow } from '../spp/Expander';
import { getMotifTemplate } from './MotifTemplates';
import { makeRng } from './Rng';

export type MotifRaw = [
    origin: [number, number, number],
    template: string,
    seed: number,
    params?: Record<string, any> | null,
];

export function expandMotif(raw: MotifRaw): ExpandedRow[] {
    const [origin, templateId, seed, params] = raw;
    const tpl = getMotifTemplate(templateId ?? 'totem');
    if (!tpl || !Array.isArray(origin)) return [];

    const rng = makeRng((seed ?? 0) >>> 0);
    const boxes = tpl.build(rng, params ?? undefined);

    // a2 box raw: [size, pos, rot, resource(colour), repeat, animation, stop].
    // stop = 1 → generated content is solid (tangible in-world).
    return boxes.map((b) => [AdjunctType.Box, [
        b.size,
        [origin[0] + b.pos[0], origin[1] + b.pos[1], origin[2] + b.pos[2]],
        b.rot,
        b.resource,
        [1, 1],
        0,
        1,
    ]]);
}
