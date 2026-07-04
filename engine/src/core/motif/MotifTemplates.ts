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
                // Yaw twist per segment — index 1 (engine Y = up); index 2 is roll.
                rot: [0, range(rng, -0.4, 0.4), 0],
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
                // Random yaw — index 1 (engine Y = up); index 2 is roll.
                rot: [0, range(rng, 0, Math.PI), 0],
                resource: pick(rng, COLORS),
            });
        }
        return boxes;
    },
});

/** panel — a single flat upright board: the canvas for an image. Pair with
 *  params.texture (e.g. a live IPFS hash) for a live image board / billboard. */
registerMotifTemplate({
    id: 'panel',
    build() {
        return [{ size: [3, 0.15, 2], pos: [0, 0, 1.2], rot: [0, 0, 0], resource: 0 }];
    },
});

/** house — four walls with a doorway + flat roof. AI-authoring catalog piece.
 *  params: w/d footprint (3..8), h wall height (2.2..3.5), door 'S'|'N'|'E'|'W',
 *  color (wall palette idx). Local coords centered on the motif origin. */
registerMotifTemplate({
    id: 'house',
    build(rng, params) {
        const w = clamp(num(params?.w, 4.5), 3, 8);
        const d = clamp(num(params?.d, 4.5), 3, 8);
        const h = clamp(num(params?.h, 2.6), 2.2, 3.5);
        const door = ['S', 'N', 'E', 'W'].includes(params?.door) ? params!.door : 'S';
        const wall = typeof params?.color === 'number' ? params!.color : pick(rng, COLORS);
        const roof = pick(rng, COLORS);
        const T = 0.25, DOOR_W = 1.2, DOOR_H = 1.9;
        const boxes: MotifBox[] = [];

        // The doorway wall: two segments + a lintel above the gap.
        const segW = (w - DOOR_W) / 2;
        const doorWall = (place: (sz: [number, number, number], off: number) => MotifBox) => {
            boxes.push(place([segW, T, h], -(DOOR_W + segW) / 2));
            boxes.push(place([segW, T, h], (DOOR_W + segW) / 2));
            if (h - DOOR_H > 0.05) boxes.push({
                ...place([DOOR_W, T, h - DOOR_H], 0),
                pos: [place([0, 0, 0], 0).pos[0], place([0, 0, 0], 0).pos[1], DOOR_H + (h - DOOR_H) / 2],
            });
        };
        const solidWall = (axis: 'x' | 'y', at: number) => boxes.push(axis === 'y'
            ? { size: [w, T, h], pos: [0, at, h / 2], rot: [0, 0, 0], resource: wall }
            : { size: [T, d - 2 * T, h], pos: [at, 0, h / 2], rot: [0, 0, 0], resource: wall });

        if (door === 'S' || door === 'N') {
            const y = door === 'S' ? -d / 2 : d / 2;
            doorWall((sz, off) => ({ size: sz, pos: [off, y, h / 2], rot: [0, 0, 0], resource: wall }));
            solidWall('y', -y);
            solidWall('x', -w / 2); solidWall('x', w / 2);
        } else {
            const x = door === 'W' ? -w / 2 : w / 2;
            doorWall((sz, off) => ({ size: [sz[1], sz[0], sz[2]], pos: [x, off, h / 2], rot: [0, 0, 0], resource: wall }));
            solidWall('x', -x);
            solidWall('y', -d / 2); solidWall('y', d / 2);
        }
        boxes.push({ size: [w + 0.4, d + 0.4, T], pos: [0, 0, h + T / 2], rot: [0, 0, 0], resource: roof });
        return boxes;
    },
});

/** road — flat walkable strips along a polyline. AI-authoring catalog piece.
 *  params: points [[x,y],..] (2..8, motif-local meters), width (1..4). */
registerMotifTemplate({
    id: 'road',
    build(_rng, params) {
        const pts: [number, number][] = Array.isArray(params?.points) && params!.points.length >= 2
            ? params!.points.slice(0, 8) : [[0, -4], [0, 4]];
        const width = clamp(num(params?.width, 2), 1, 4);
        const boxes: MotifBox[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
            const dx = x1 - x0, dy = y1 - y0;
            const len = Math.hypot(dx, dy);
            if (!(len > 0.1)) continue;
            boxes.push({
                size: [width, len + width * 0.5, 0.1],   // slight overlap keeps corners closed
                pos: [(x0 + x1) / 2, (y0 + y1) / 2, 0.05],
                // Adjunct rotation is ENGINE-frame Euler (coordinate.md §3.1): the
                // vertical-axis yaw is index 1 (engine Y = up), and engine yaw ψ maps
                // local north to (E,N) = (-sinψ, cosψ) ⇒ ψ = atan2(-dx, dy). The
                // original wrote atan2 into index 2 — engine ROLL — which stood every
                // non-north-south road up on its edge as a wall.
                rot: [0, Math.atan2(-dx, dy), 0],
                resource: 1,                              // dark: reads as pavement
            });
        }
        return boxes;
    },
});

/** building — a multi-storey tower with a WALKABLE L-shaped staircase.
 *  AI-authoring catalog piece. params: floors (2..6), w/d footprint (7..12),
 *  floorHeight (2.4..3.2), color.
 *
 *  Stairs are fire-escape style: every storey repeats the IDENTICAL plan —
 *  half-flight west→east along the north wall, corner landing at NE, half-
 *  flight north→south along the east wall. Because consecutive storeys stack
 *  the same profile, vertical clearance anywhere on the stairs is exactly
 *  floorHeight − treadThickness (≈2.55 m) — headroom holds in BOTH directions
 *  at any walking speed (a switchback packs flights against each other and
 *  the upper flight scalps whoever walks the lower lane). Treads rise ≤0.4
 *  (under the 0.5 step-over cap) and are thin slabs, so the collider both
 *  climbs them (step-over) and descends them (short drops) naturally. */
registerMotifTemplate({
    id: 'building',
    build(rng, params) {
        const floors = Math.round(clamp(num(params?.floors, 5), 2, 6));
        const w = clamp(num(params?.w, 8), 7, 12);
        const d = clamp(num(params?.d, 8), 7, 12);
        const fh = clamp(num(params?.floorHeight, 2.8), 2.4, 3.2);
        const wall = typeof params?.color === 'number' ? params!.color : pick(rng, COLORS);
        const T = 0.25, DOOR_W = 1.4, DOOR_H = 2.0, LANE = 1.2;
        const boxes: MotifBox[] = [];

        // Stair geometry: two half-flights + the corner landing per storey gap.
        const half = fh / 2;
        const nSteps = Math.max(3, Math.ceil(half / 0.4));
        const rise = half / nSteps;                        // ≤ 0.4 by construction
        const run = 0.5, runLen = nSteps * run;
        const yLane = d / 2 - T - LANE / 2;                // north-wall lane centre (flight A)
        const xLane = w / 2 - T - LANE / 2;                // east-wall lane centre (flight B)
        const landC: [number, number] = [xLane, yLane];    // NE corner landing centre
        const ax1 = xLane - LANE / 2;                      // flight A top (east end, at landing)
        const ax0 = ax1 - runLen;                          // flight A bottom (west end)
        const by1 = yLane - LANE / 2;                      // flight B top (north end, at landing)
        const by0 = by1 - runLen;                          // flight B bottom (south end)

        // Perimeter walls (ground floor gets a south doorway).
        for (let f = 0; f < floors; f++) {
            const z = f * fh;
            if (f === 0) {
                const segW = (w - DOOR_W) / 2;
                boxes.push({ size: [segW, T, fh], pos: [-(DOOR_W + segW) / 2, -d / 2, z + fh / 2], rot: [0, 0, 0], resource: wall });
                boxes.push({ size: [segW, T, fh], pos: [(DOOR_W + segW) / 2, -d / 2, z + fh / 2], rot: [0, 0, 0], resource: wall });
                boxes.push({ size: [DOOR_W, T, fh - DOOR_H], pos: [0, -d / 2, z + DOOR_H + (fh - DOOR_H) / 2], rot: [0, 0, 0], resource: wall });
            } else {
                boxes.push({ size: [w, T, fh], pos: [0, -d / 2, z + fh / 2], rot: [0, 0, 0], resource: wall });
            }
            boxes.push({ size: [w, T, fh], pos: [0, d / 2, z + fh / 2], rot: [0, 0, 0], resource: wall });
            boxes.push({ size: [T, d - 2 * T, fh], pos: [-w / 2, 0, z + fh / 2], rot: [0, 0, 0], resource: wall });
            boxes.push({ size: [T, d - 2 * T, fh], pos: [w / 2, 0, z + fh / 2], rot: [0, 0, 0], resource: wall });
        }

        // Floor slabs (floors 1..N-1): three pieces leaving the stair L open —
        // the SW body, a north strip west of flight A, an east strip south of
        // flight B. Each flight's low end lands ON a strip (no drop to void).
        for (let f = 1; f < floors; f++) {
            const zTop = f * fh;
            const bodyW = (ax0 - 0.3) - (-w / 2 + T);      // SW body: up to flight A's foot
            const bodyD = (by0 - 0.3) - (-d / 2 + T);
            boxes.push({ size: [w - 2 * T, bodyD, T], pos: [0, (-d / 2 + T + (by0 - 0.3)) / 2, zTop - T / 2], rot: [0, 0, 0], resource: 10 });
            boxes.push({ size: [bodyW, (d - 2 * T) - bodyD, T], pos: [(-w / 2 + T + (ax0 - 0.3)) / 2, (by0 - 0.3 + d / 2 - T) / 2, zTop - T / 2], rot: [0, 0, 0], resource: 10 });
        }
        // Roof seals the top (no opening).
        boxes.push({ size: [w + 0.4, d + 0.4, T], pos: [0, 0, floors * fh + T / 2], rot: [0, 0, 0], resource: pick(rng, COLORS) });

        // The L staircase, identical every storey gap (uniform headroom).
        for (let f = 0; f < floors - 1; f++) {
            const z = f * fh;
            for (let i = 1; i <= nSteps; i++) {            // flight A: west → east along the north wall
                boxes.push({
                    size: [run, LANE, T], rot: [0, 0, 0], resource: 1,
                    pos: [ax0 + run * (i - 1) + run / 2, yLane, z + rise * i - T / 2],
                });
            }
            boxes.push({                                    // NE corner landing (z = half)
                size: [LANE + 0.1, LANE + 0.1, T], rot: [0, 0, 0], resource: 1,
                pos: [landC[0], landC[1], z + half - T / 2],
            });
            for (let i = 1; i <= nSteps; i++) {            // flight B: north → south along the east wall
                boxes.push({
                    size: [LANE, run, T], rot: [0, 0, 0], resource: 1,
                    pos: [xLane, by1 - run * (i - 1) - run / 2, z + half + rise * i - T / 2],
                });
            }
        }
        return boxes;
    },
});

function num(v: any, dflt: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : dflt; }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

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
