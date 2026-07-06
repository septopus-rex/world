/**
 * SppL2 — bridge between the engine's resolved SPP cells and the L2 binary
 * "Collapsed State" (CollapseCodec). L2 is the compact, content-addressable
 * wire/storage form: each cell is 4 bytes (6 face nibbles + a trigger byte).
 *
 * Scope (Workstream E, spp-protocol-full.md §3.E): the COLLAPSED basic-theme
 * form — 6 resolved faces + a trigger-presence flag. Position/level are
 * STRUCTURAL grid context (not stored per cell in L2), so decode takes the
 * positions back from the caller. Superposition (faceOptions) and nested
 * refinement are richer than the 4-byte cell and stay in the plaintext source
 * form (L2 is, by definition, already collapsed). Round-trip = identical
 * expansion for the covered form.
 */
import { CollapseCodec, CollapseHeader } from '../protocol/CollapseCodec';
import { FaceState, SubdivisionLevel } from '../types/ParticleCell';
import type { SppCell } from './Expander';
import type { TriggerLogicNode } from '../types/Trigger';

/** Face code ↔ [state, variant], matching faceCodes.ts (open/solid/doorway/window). */
function faceToIndex(face: [number, number] | null | undefined): number {
    if (!face || face[0] === FaceState.Open) return 0; // open
    if (face[1] === 1) return 2;                        // doorway
    if (face[1] === 2) return 3;                        // window
    return 1;                                           // solid
}
function indexToFace(idx: number): [number, number] {
    switch (idx) {
        case 0: return [FaceState.Open, 0];
        case 2: return [FaceState.Closed, 1];
        case 3: return [FaceState.Closed, 2];
        default: return [FaceState.Closed, 0];
    }
}

export interface SppL2Meta {
    cid?: Uint8Array;                 // 32-byte content id (zero-filled if omitted)
    origin: [number, number, number]; // SPP grid origin (0-255 per axis)
    baseLevel?: SubdivisionLevel;
    layerId?: number;
    encoding?: 0 | 1;                 // 0 raw, 1 RLE
}

/** Encode resolved cells to an L2 payload. Cells MUST be single-level, resolved
 *  (authored `faces`); a trigger is stored as a presence flag (id 1). */
export function encodeSppL2(cells: SppCell[], meta: SppL2Meta): Uint8Array {
    const header: CollapseHeader = {
        cid: meta.cid ?? new Uint8Array(32),
        cellCount: cells.length,
        encoding: meta.encoding ?? 0,
        flags: 0,
        originX: meta.origin[0] | 0, originY: meta.origin[1] | 0, originZ: meta.origin[2] | 0,
        baseLevel: (meta.baseLevel ?? 0) as SubdivisionLevel,
        layerId: meta.layerId ?? 0,
    };
    const encoded = cells.map(c => ({
        collapseIndices: [0, 1, 2, 3, 4, 5].map(f => faceToIndex(c.faces?.[f])) as [number, number, number, number, number, number],
        triggerId: c.trigger && c.trigger.length > 0 ? 1 : 0,
    }));
    return CollapseCodec.encodePayload(header, encoded);
}

/** Decode an L2 payload back to resolved cells. `positions` supplies the grid
 *  layout (structural, not in L2); when a cell had a trigger, `triggerFor`
 *  reattaches its logic (else a bare marker trigger). */
export function decodeSppL2(
    buf: Uint8Array,
    positions: Array<[number, number, number]>,
    triggerFor?: (cellIndex: number) => TriggerLogicNode[] | undefined,
): { cells: SppCell[]; header: CollapseHeader } {
    const { header, cells } = CollapseCodec.decodePayload(buf);
    const out: SppCell[] = cells.map((c, i) => {
        const cell: SppCell = {
            position: positions[i] ?? [0, 0, 0],
            level: header.baseLevel,
            faces: c.collapseIndices.map(indexToFace),
        };
        if (c.triggerId) cell.trigger = triggerFor?.(i) ?? [{ type: 'in', actions: [] }];
        return cell;
    });
    return { cells: out, header };
}
