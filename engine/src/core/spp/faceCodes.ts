/**
 * SPP cell face <-> edit-form select code.
 *
 * A face is [state, variant]: state 1=closed 0=open; closed variant 0=solid
 * 1=doorway 2=window. The edit form's <select> stringifies its values, so faces
 * are edited as flat string CODES (faceTop="doorway", ...) which the edit path
 * folds back into cells[0].faces via normalizeParticleFaces.
 */
export type FaceCode = 'open' | 'solid' | 'doorway' | 'window';

const CODE_TO_FACE: Record<FaceCode, [number, number]> = {
    open: [0, 0], solid: [1, 0], doorway: [1, 1], window: [1, 2],
};

/** Form field keys for the six faces, in ParticleFace order. */
export const FACE_FORM_KEYS = ['faceTop', 'faceBottom', 'faceFront', 'faceBack', 'faceLeft', 'faceRight'] as const;

export function codeFromFace(face: any): FaceCode {
    const s = face?.[0] ?? 1, v = face?.[1] ?? 0;
    if (s === 0) return 'open';
    if (v === 1) return 'doorway';
    if (v === 2) return 'window';
    return 'solid';
}

/**
 * Fold any faceTop.. form fields (set on stdData by the edit form) into the
 * first cell's faces, then strip the temp keys. No-op when none are present
 * (e.g. undo restoring a real cells array). Single-cell editing; multi-cell
 * worlds use the cells JSON sidebar.
 */
export function normalizeParticleFaces(std: any): void {
    if (!Array.isArray(std?.cells) || !std.cells[0]) return;
    if (!Array.isArray(std.cells[0].faces) || std.cells[0].faces.length < 6) {
        std.cells[0].faces = [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]];
    }
    const faces = std.cells[0].faces;
    FACE_FORM_KEYS.forEach((key, j) => {
        const code = std[key];
        if (typeof code === 'string' && code in CODE_TO_FACE) {
            faces[j] = [...CODE_TO_FACE[code as FaceCode]];
        }
        delete std[key];
    });
}
