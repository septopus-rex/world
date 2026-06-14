/**
 * setByPath — assign a value at a dotted key path, creating intermediate
 * containers as needed. Numeric segments index into arrays.
 *
 *   setByPath(o, "x", 5)                 -> o.x = 5
 *   setByPath(o, "material.resource", 3) -> o.material.resource = 3
 *   setByPath(o, "cells.0.faces.2", v)   -> o.cells[0].faces[2] = v
 *
 * Used by the edit form's `set` so nested adjunct properties (box material,
 * SPP cell faces) bind from form fields keyed by path. A plain key (no dot)
 * is a direct assignment — backward-compatible with the old flat merge.
 */
export function setByPath(root: any, path: string, value: any): void {
    if (!path.includes('.')) {
        root[path] = value;
        return;
    }
    const segs = path.split('.');
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i];
        if (node[seg] === undefined || node[seg] === null) {
            // Create an array if the NEXT segment is a numeric index, else an object.
            node[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {};
        }
        node = node[seg];
    }
    node[segs[segs.length - 1]] = value;
}
