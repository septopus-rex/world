/**
 * Spatial collision check (spec docs/plan/specs/ai-builder.md §4) — the piece
 * ai-gateway v1 doesn't have. `validateGenerationDoc` only checks schema/
 * ranges/budget; it never asks "do these two solids occupy the same space".
 * This module does, with axis-aligned bounding boxes.
 *
 * Only "occupies space" types participate (COLLIDABLE_TYPES below) — lights,
 * water, items, triggers, spawners, NPCs and link panels are all meant to
 * share space with other content (a lamp mounted ON a wall is normal), so
 * flagging them would just manufacture false positives.
 *
 * Generator pieces (house/road/building/…) are expanded through the SAME
 * `expandMotif` the engine uses at runtime — checking only `origin` would miss
 * the common case of "a house's footprint overlaps a road's footprint" (the
 * pieces themselves don't touch, their boxes do).
 */
import { AdjunctType } from '../../engine/src/core/types/AdjunctType';
import { expandMotif } from '../../engine/src/core/motif/MotifExpander';
import type { GenerationDoc } from '../../engine/src/core/protocol/GenerationDoc';

export interface Box3 { min: [number, number, number]; max: [number, number, number]; }
export interface CollidableUnit { box: Box3; label: string; }
export interface CollisionError { code: 'collision'; path: string; msg: string; }

/** Types whose raw[0]=size/raw[1]=pos slots describe real occupied volume.
 *  Rotation is ignored (conservative AABB) — the same simplification
 *  `MovementCollider`'s SHAPE_BOX already makes at runtime; not a new
 *  inconsistency. */
export const COLLIDABLE_TYPES: ReadonlySet<number> = new Set([
    AdjunctType.Wall, AdjunctType.Box, AdjunctType.Cone, AdjunctType.Ball, AdjunctType.Stop,
]);

/** Touching/flush geometry (e.g. two walls sharing an exact edge, a common
 *  generator output) must NOT be flagged — only genuine penetration counts. */
const EPS = 0.05;

/** AABB from a box's size/pos/rot, accounting for YAW (rot[1], the vertical
 *  axis — the only rotation component any generator or whitelisted type ever
 *  uses; rx/rz stay 0 throughout MotifTemplates.ts and the standard-attribute
 *  primitives). Ignoring yaw here would silently swap which axis is "long"
 *  for any rotated box — the `road` motif template authors its segments
 *  long-in-Y and yaws them to lie along X, so an unrotated AABB reports a
 *  bogus collision against everything near the road's ENTIRE original
 *  length instead of its actual (much narrower) footprint. Uses the standard
 *  rotated-rectangle AABB formula (sign-agnostic — correct regardless of the
 *  yaw sign convention): newHalfX = hx·|cos| + hy·|sin|, newHalfY = hx·|sin| + hy·|cos|. */
function boxFromSizePos(size: any, pos: any, rot?: any): Box3 | null {
    if (!Array.isArray(size) || !Array.isArray(pos) || size.length < 3 || pos.length < 3) return null;
    let hx = size[0] / 2, hy = size[1] / 2;
    const yaw = Array.isArray(rot) ? Number(rot[1]) || 0 : 0;
    if (yaw !== 0) {
        const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
        const newHx = hx * c + hy * s;
        const newHy = hx * s + hy * c;
        hx = newHx; hy = newHy;
    }
    const hz = size[2] / 2;
    return {
        min: [pos[0] - hx, pos[1] - hy, pos[2] - hz],
        max: [pos[0] + hx, pos[1] + hy, pos[2] + hz],
    };
}

function overlaps(a: Box3, b: Box3): boolean {
    return a.min[0] < b.max[0] - EPS && a.max[0] > b.min[0] + EPS
        && a.min[1] < b.max[1] - EPS && a.max[1] > b.min[1] + EPS
        && a.min[2] < b.max[2] - EPS && a.max[2] > b.min[2] + EPS;
}

/** A GenerationDoc's pieces → collidable units. Generator pieces are expanded
 *  via expandMotif (identical to what BlockSystem does at inject time), so a
 *  piece's ACTUAL geometry is checked, not just its anchor origin. */
export function collidableUnitsFromDoc(doc: GenerationDoc): CollidableUnit[] {
    const units: CollidableUnit[] = [];
    doc.pieces.forEach((p, i) => {
        if (p.kind === 'generator') {
            const seed = p.seed ?? (doc.seed + i);
            const rows = expandMotif([p.origin, p.name, seed, p.params ?? null]);
            rows.forEach(([typeId, row], j) => {
                if (typeId !== AdjunctType.Box) return; // expandMotif only ever emits Box rows today
                const box = boxFromSizePos(row[0], row[1], row[2]);
                if (box) units.push({ box, label: `pieces[${i}](${p.name}).box[${j}]` });
            });
        } else if (p.kind === 'adjunct' && COLLIDABLE_TYPES.has(p.typeId)) {
            const raw = p.raw as any[];
            const box = boxFromSizePos(raw?.[0], raw?.[1], raw?.[2]);
            if (box) units.push({ box, label: `pieces[${i}](adjunct 0x${p.typeId.toString(16)})` });
        }
    });
    return units;
}

/** Existing block content (raw adjunct groups `[[typeId, rows[]], …]`) →
 *  collidable units. Trusted as-is — never itself checked for self-overlap,
 *  only used as a backdrop the new pieces must avoid. */
export function collidableUnitsFromExisting(existing: any): CollidableUnit[] {
    const units: CollidableUnit[] = [];
    if (!Array.isArray(existing)) return units;
    existing.forEach(([typeId, rows]: [number, any[]], gi: number) => {
        if (!COLLIDABLE_TYPES.has(typeId) || !Array.isArray(rows)) return;
        rows.forEach((row: any[], ri: number) => {
            const box = boxFromSizePos(row?.[0], row?.[1], row?.[2]);
            if (box) units.push({ box, label: `existing[${gi}][${ri}](0x${typeId.toString(16)})` });
        });
    });
    return units;
}

/** Pairwise AABB overlap: (new units × new units) ∪ (new units × existing
 *  units). Existing-vs-existing is never checked — pre-existing content is
 *  trusted, only the freshly proposed doc is on trial. */
export function detectCollisions(doc: GenerationDoc, existing?: any): CollisionError[] {
    const fresh = collidableUnitsFromDoc(doc);
    const prior = collidableUnitsFromExisting(existing);
    const errors: CollisionError[] = [];
    for (let i = 0; i < fresh.length; i++) {
        for (let j = i + 1; j < fresh.length; j++) {
            if (overlaps(fresh[i].box, fresh[j].box)) {
                errors.push({ code: 'collision', path: fresh[i].label, msg: `overlaps ${fresh[j].label}` });
            }
        }
        for (const p of prior) {
            if (overlaps(fresh[i].box, p.box)) {
                errors.push({ code: 'collision', path: fresh[i].label, msg: `overlaps existing content ${p.label}` });
            }
        }
    }
    return errors;
}
