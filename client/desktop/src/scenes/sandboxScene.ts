import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * sandboxScene — a fixed-camera DIORAMA for sculpting SPP visually.
 *
 * A small N×N grid of SPP cells lives as ONE shared b6 source on a dedicated
 * block. You enter Observe mode (the engine's orbit camera) aimed at the grid
 * centre — it reads as a tabletop sandbox — and CLICK a cell's face to cycle it
 * (solid → doorway → window → open → solid). Each click mutates the shared b6
 * source and the engine re-expands it live (BlockSystem.reexpandParticle), so
 * you watch the structure change in 3D as you edit. This fills the gap that the
 * normal editor only edits a SINGLE cell's faces via a form — here you author a
 * whole multi-cell structure by clicking, in place.
 *
 * The whole sandbox is data: 9 SppCells + a base slab. The only "logic" is the
 * pure ray↔AABB face-picker below (no engine, no Three.js), which the loader
 * feeds with a camera ray to decide which cell-face a click targets.
 */

/** Sandbox block — one block NORTH-WEST of the demo spawn. Not a game zone. */
export const SANDBOX_BLOCK: [number, number] = [2047, 2049];

/** Grid geometry, SHARED by the scene builder and the click-picker. SPP metres. */
export const GRID = {
    n: 3,                              // 3×3 cells
    cell: 4,                          // level-0 cell = 4 m
    level: 0,
    origin: [2, 2, 0] as [number, number, number], // grid spans local [2,14]
};

/** Grid centre (SPP local) — where the frozen player sits so Observe orbits it. */
export const SANDBOX_CENTER: [number, number, number] = [
    GRID.origin[0] + (GRID.n * GRID.cell) / 2, // 8
    GRID.origin[1] + (GRID.n * GRID.cell) / 2, // 8
    2,
];

/** Face cycle order (a click advances one step). [state, variant]. */
const FACE_CYCLE: Array<[number, number]> = [
    [1, 0], // solid
    [1, 1], // doorway
    [1, 2], // window
    [0, 0], // open
];

export function nextFace(face: [number, number] | undefined): [number, number] {
    const i = FACE_CYCLE.findIndex((c) => c[0] === face?.[0] && c[1] === face?.[1]);
    return [...FACE_CYCLE[(i + 1) % FACE_CYCLE.length]];
}

/** cells array index for grid slot (gx,gy) — must match buildSandboxScene order. */
export function cellIndex(gx: number, gy: number): number {
    return gx * GRID.n + gy;
}

function initialCells(): any[] {
    const cells: any[] = [];
    for (let gx = 0; gx < GRID.n; gx++) {
        for (let gy = 0; gy < GRID.n; gy++) {
            // Roofless rooms with floors: Top open, Bottom + 4 sides solid. The
            // grid reads as a 3×3 of pens you sculpt by clicking the walls.
            cells.push({
                position: [gx, gy, 0], level: GRID.level,
                faces: [[0, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
            });
        }
    }
    return cells;
}

export function buildSandboxScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);
    // The shared SPP source — one b6 row holds the whole grid.
    data.raw[2].push([AdjunctType.Particle, [[GRID.origin, initialCells(), 'basic']]]);
    // A dark base slab so the white marble cells read as a tabletop diorama.
    const span = GRID.n * GRID.cell + 2;
    const c = GRID.origin[0] + (GRID.n * GRID.cell) / 2;
    data.raw[2].push([AdjunctType.Box, [[[span, span, 0.4], [c, c, -0.2], [0, 0, 0], 1, [1, 1], 0, 0]]]);
    return data.raw;
}

// ── pure ray ↔ AABB face picker (SPP-local space) ────────────────────────────

interface RayHit { t: number; axis: number; }

/** Slab method: nearest entry t into [min,max] + which axis the ray entered on. */
function rayAABB(o: number[], d: number[], min: number[], max: number[]): RayHit | null {
    let tmin = -Infinity, tmax = Infinity, axis = 0;
    for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < min[i] || o[i] > max[i]) return null; continue; }
        let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) { tmin = t1; axis = i; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
    }
    if (tmax < 0) return null; // box entirely behind the ray
    return { t: tmin, axis };
}

/** Entry face (ParticleFace index) from the entry axis + ray direction sign. */
function faceFromAxis(axis: number, d: number[]): number {
    if (axis === 0) return d[0] > 0 ? 4 : 5; // X: enter min(West/Left) vs max(East/Right)
    if (axis === 1) return d[1] > 0 ? 2 : 3; // Y: enter min(South/Front) vs max(North/Back)
    return d[2] > 0 ? 1 : 0;                  // Z: enter min(Bottom) vs max(Top)
}

export interface FacePick { cellIndex: number; gx: number; gy: number; face: number; }

/**
 * Which cell-face does a camera ray hit? `origin`/`dir` are in SPP-LOCAL space
 * (relative to the sandbox block). Picks the NEAREST cell the ray enters and the
 * face it enters through — so clicking through an open gap still targets that
 * cell's camera-facing face.
 */
export function pickFace(origin: number[], dir: number[]): FacePick | null {
    let best: { t: number; axis: number; gx: number; gy: number } | null = null;
    for (let gx = 0; gx < GRID.n; gx++) {
        for (let gy = 0; gy < GRID.n; gy++) {
            const min = [GRID.origin[0] + gx * GRID.cell, GRID.origin[1] + gy * GRID.cell, GRID.origin[2]];
            const max = [min[0] + GRID.cell, min[1] + GRID.cell, min[2] + GRID.cell];
            const hit = rayAABB(origin, dir, min, max);
            if (hit && (!best || hit.t < best.t)) best = { t: hit.t, axis: hit.axis, gx, gy };
        }
    }
    if (!best) return null;
    return { cellIndex: cellIndex(best.gx, best.gy), gx: best.gx, gy: best.gy, face: faceFromAxis(best.axis, dir) };
}

// ── two-level (cell → face) selection helpers ────────────────────────────────
// The editor works in two stages: first SELECT a cell, then edit only THAT
// cell's faces. These let the loader pick within a chosen cell (no neighbour
// ambiguity) and group derived wall/trigger pieces back to their owning cell so
// non-selected cells can be dimmed.

/** AABB (SPP-local, min/max corners) of grid cell `ci`. */
export function cellAabb(ci: number): { min: number[]; max: number[] } {
    const gx = Math.floor(ci / GRID.n), gy = ci % GRID.n;
    const min = [GRID.origin[0] + gx * GRID.cell, GRID.origin[1] + gy * GRID.cell, GRID.origin[2]];
    return { min, max: [min[0] + GRID.cell, min[1] + GRID.cell, min[2] + GRID.cell] };
}

/**
 * Face of ONE chosen cell that the ray enters (selection-scoped picking). Ray is
 * SPP-LOCAL. Returns the ParticleFace index, or null if the ray misses the cell
 * — so a click outside the selected cell is a no-op, not an accidental edit of a
 * neighbour. The complement of pickFace, which roams all cells.
 */
export function pickFaceInCell(origin: number[], dir: number[], ci: number): number | null {
    const { min, max } = cellAabb(ci);
    const hit = rayAABB(origin, dir, min, max);
    return hit ? faceFromAxis(hit.axis, dir) : null;
}

/**
 * Which cell owns an SPP-local point? Derived wall pieces sit thickness/2 INSIDE
 * their owning cell and triggers at its centre, so the piece centre lands cleanly
 * in exactly one cell — letting the loader colour pieces by cell. Returns the
 * cell index, or -1 if the point is outside the grid (e.g. the base slab).
 */
export function cellOfPoint(p: number[], eps = 0.01): number {
    for (let gx = 0; gx < GRID.n; gx++) {
        for (let gy = 0; gy < GRID.n; gy++) {
            const x0 = GRID.origin[0] + gx * GRID.cell, y0 = GRID.origin[1] + gy * GRID.cell, z0 = GRID.origin[2];
            if (p[0] >= x0 - eps && p[0] <= x0 + GRID.cell + eps &&
                p[1] >= y0 - eps && p[1] <= y0 + GRID.cell + eps &&
                p[2] >= z0 - eps && p[2] <= z0 + GRID.cell + eps) return cellIndex(gx, gy);
        }
    }
    return -1;
}
