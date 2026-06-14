/**
 * SPP coaster theme — collapses cells into c1 TUBE TRACK pieces instead of
 * walls. This is the "由 SPP 塌陷出来的过山车" path: each track cell has exactly
 * two OPEN faces (the rail enters one, exits the other); the piece is a tube
 * swept entry-face-center → cell-center → exit-face-center. Opposite faces →
 * straight; adjacent faces → quarter-arc (Catmull-Rom through the 3 points).
 *
 * The piece's control points exit/enter at face CENTERS, so adjacent cells'
 * pieces meet continuously. The cart's ride path is built separately by
 * CoasterSystem (from the same cells), so visuals and motion both derive from
 * the SPP source.
 */
import { ParticleFace, FaceState } from '../types/ParticleCell';
import { registerSppTheme, SppTheme } from './Variants';

export const TRACK_TYPE = 0x00c1;
export const TRACK_RADIUS = 0.3;

const FACES: ParticleFace[] = [
    ParticleFace.Top, ParticleFace.Bottom, ParticleFace.Front,
    ParticleFace.Back, ParticleFace.Left, ParticleFace.Right,
];

/** Center of a face on a cell of size `s`, relative to the cell origin corner. */
export function faceCenter(face: ParticleFace, s: number): [number, number, number] {
    const h = s / 2;
    switch (face) {
        case ParticleFace.Top: return [h, h, s];     // Z+
        case ParticleFace.Bottom: return [h, h, 0];  // Z-
        case ParticleFace.Front: return [h, 0, h];   // Y-
        case ParticleFace.Back: return [h, s, h];    // Y+
        case ParticleFace.Left: return [0, h, h];    // X-
        case ParticleFace.Right: return [s, h, h];   // X+
    }
}

/** Which faces of a cell are open (the track passes through them). */
export function openFaces(faces: Array<[number, number]>): ParticleFace[] {
    return FACES.filter(f => (faces?.[f]?.[0] ?? FaceState.Closed) === FaceState.Open);
}

export const COASTER_THEME: SppTheme = {
    thickness: 0.2,
    closed: [],
    open: [],
    expandCell: (cell, cellOrigin, s) => {
        const open = openFaces(cell.faces);
        if (open.length < 2) return []; // a track cell needs an entry + an exit
        const h = s / 2;
        const center: [number, number, number] = [h, h, h];
        const f1 = faceCenter(open[0], s);
        const f2 = faceCenter(open[1], s);
        // c1 raw: [pos (cell origin SPP), path (control points rel. to pos, SPP), radius]
        return [[TRACK_TYPE, [cellOrigin, [f1, center, f2], TRACK_RADIUS]]];
    },
};

registerSppTheme('coaster', COASTER_THEME);
