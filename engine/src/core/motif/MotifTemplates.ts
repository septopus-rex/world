/**
 * Motif template registry (c2) — the generators a motif seed drives.
 *
 * A template is a pure function (rng, params) → boxes in motif-LOCAL SPP
 * meters. The motif expander offsets them by the motif origin and emits one
 * standard a2 box row per box. Mirrors core/spp/Variants.ts (theme registry).
 *
 * Add a template = register one more generator here; the editor form picks it
 * up automatically via motifTemplateIds().
 */
import { Rng, range, int, pick } from './Rng';

/** A single box a template wants placed, in motif-LOCAL SPP meters (relative
 *  to the motif origin). resource = basic_box colour-palette index. */
export interface MotifBox {
    size: [number, number, number];
    pos: [number, number, number];
    rot: [number, number, number];
    resource: number;
}

export interface MotifTemplate {
    id: string;
    /** Deterministic given (rng stream, params). No wall clock, no Math.random. */
    build(rng: Rng, params?: Record<string, any>): MotifBox[];
}

// Colour-palette indices that basic_box maps to real colours
// (0 gray · 1 dark · 2 blue · 3 red · 10 white). Generative content picks
// from these so the output is visibly varied.
const COLORS = [0, 1, 2, 3, 10] as const;

const REGISTRY = new Map<string, MotifTemplate>();
export function registerMotifTemplate(t: MotifTemplate): void { REGISTRY.set(t.id, t); }
export function getMotifTemplate(id: string): MotifTemplate | undefined { return REGISTRY.get(id); }
export function motifTemplateIds(): string[] { return [...REGISTRY.keys()]; }

/** totem — a vertical stack of tapering boxes (a carved pole). */
registerMotifTemplate({
    id: 'totem',
    build(rng, params) {
        const n = (params?.count as number) ?? int(rng, 3, 6);
        const boxes: MotifBox[] = [];
        let z = 0;
        for (let i = 0; i < n; i++) {
            const taper = Math.max(0.3, 1 - i * 0.12);
            const w = range(rng, 0.7, 1.2) * taper;
            const d = range(rng, 0.7, 1.2) * taper;
            const h = range(rng, 0.5, 1.0);
            boxes.push({
                size: [w, d, h],
                pos: [0, 0, z + h / 2],
                rot: [0, 0, range(rng, -0.4, 0.4)],
                resource: pick(rng, COLORS),
            });
            z += h;
        }
        return boxes;
    },
});

/** cluster — boxes scattered across a small footprint (rocks / crystals). */
registerMotifTemplate({
    id: 'cluster',
    build(rng, params) {
        const n = (params?.count as number) ?? int(rng, 4, 9);
        const spread = (params?.spread as number) ?? 1.6;
        const boxes: MotifBox[] = [];
        for (let i = 0; i < n; i++) {
            const w = range(rng, 0.4, 1.0);
            const d = range(rng, 0.4, 1.0);
            const h = range(rng, 0.4, 1.4);
            boxes.push({
                size: [w, d, h],
                pos: [range(rng, -spread, spread), range(rng, -spread, spread), h / 2],
                rot: [0, 0, range(rng, 0, Math.PI)],
                resource: pick(rng, COLORS),
            });
        }
        return boxes;
    },
});

/** arch — two pillars + a lintel (a recognizable gateway, seed-varied). */
registerMotifTemplate({
    id: 'arch',
    build(rng, params) {
        const span = (params?.span as number) ?? range(rng, 2.0, 3.2);
        const height = range(rng, 2.4, 3.6);
        const pw = range(rng, 0.5, 0.8);
        const pillar = pick(rng, COLORS);
        const top = range(rng, 0.4, 0.7);
        return [
            { size: [pw, pw, height], pos: [-span / 2, 0, height / 2], rot: [0, 0, 0], resource: pillar },
            { size: [pw, pw, height], pos: [span / 2, 0, height / 2], rot: [0, 0, 0], resource: pillar },
            { size: [span + pw, pw, top], pos: [0, 0, height + top / 2], rot: [0, 0, 0], resource: pick(rng, COLORS) },
        ];
    },
});
