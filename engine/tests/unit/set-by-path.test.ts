import { describe, it, expect } from 'vitest';
import { setByPath } from '../../src/core/edit/setByPath';

// The edit form's `set` binds form fields to stdData by dotted key path, so
// nested properties (box material, SPP cell faces) can be edited. Before this,
// executeSet did a flat merge — a key like "material.resource" created a literal
// "material.resource" property the transform ignored (box recolour was a no-op).

describe('setByPath', () => {
    it('plain key is a direct assignment (flat, backward-compatible)', () => {
        const o: any = { x: 1 };
        setByPath(o, 'x', 5);
        expect(o.x).toBe(5);
    });

    it('dotted path sets a nested object property (box material)', () => {
        const o: any = { material: { resource: 0, repeat: [1, 1] } };
        setByPath(o, 'material.resource', 3);
        expect(o.material.resource).toBe(3);
        expect(o.material.repeat).toEqual([1, 1]); // siblings untouched
    });

    it('numeric segments index into arrays (SPP cell face)', () => {
        const o: any = { cells: [{ faces: [[1, 0], [1, 0], [1, 0]] }] };
        setByPath(o, 'cells.0.faces.2', [1, 1]);
        expect(o.cells[0].faces[2]).toEqual([1, 1]);
        expect(o.cells[0].faces[0]).toEqual([1, 0]); // others untouched
    });

    it('creates missing intermediate containers (array vs object by next segment)', () => {
        const o: any = {};
        setByPath(o, 'a.b', 7);
        expect(o.a).toEqual({ b: 7 });
        const p: any = {};
        setByPath(p, 'list.0.k', 'v');
        expect(Array.isArray(p.list)).toBe(true);
        expect(p.list[0]).toEqual({ k: 'v' });
    });
});
