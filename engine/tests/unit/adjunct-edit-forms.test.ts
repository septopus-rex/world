import { describe, it, expect } from 'vitest';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';

// G4-1: every standard placeable primitive must expose a working edit form, so
// the editor loop place -> right-click -> Edit Properties can refine size and
// position. Before this, only box/light/stop/module had a form; wall/cone/ball/
// water had none (right-click yielded nothing useful).

const std: any = {
    x: 2, y: 0.3, z: 2.5, ox: 5, oy: 6, oz: 1.25, rx: 0, ry: 0, rz: 0,
    material: { resource: 0, repeat: [1, 1] },
};

const cases = [
    { id: 0x00a1, name: 'wall' },
    { id: 0x00a6, name: 'cone' },
    { id: 0x00a7, name: 'ball/sphere' },
    { id: 0x00a5, name: 'water' },
];

describe('standard primitive edit forms (G4-1)', () => {
    for (const c of cases) {
        it(`${c.name} exposes a Size + Position form and Edit/Delete context menu`, () => {
            const def = getBuiltinAdjunct(c.id)! as any;
            expect(def.menu, `${c.name} has a menu`).toBeTruthy();

            const groups = def.menu.form(std);
            const titles = groups.map((g: any) => g.title);
            expect(titles).toContain('Size');
            expect(titles).toContain('Position');

            const size = groups.find((g: any) => g.title === 'Size');
            expect(size.fields.map((f: any) => f.key)).toEqual(['x', 'y', 'z']);
            // values are bound to the std object so the form pre-fills
            expect(size.fields[0].value).toBe(2);

            const pos = groups.find((g: any) => g.title === 'Position');
            expect(pos.fields.map((f: any) => f.key)).toEqual(['ox', 'oy', 'oz']);

            const actions = def.menu.contextMenu(std).map((m: any) => m.action);
            expect(actions).toContain('edit');
            expect(actions).toContain('delete');
        });
    }
});
