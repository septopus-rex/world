import { describe, it, expect, afterEach } from 'vitest';
import { descriptorToDefinition, validateDescriptor } from '../../src/core/services/DynamicAdjunct';
import {
    registerDynamicAdjunct, getDynamicAdjunct, getAdjunct, clearDynamicAdjuncts, getBuiltinAdjunct,
} from '../../src/core/services/AdjunctRegistry';

// L1 — the DECLARATIVE dynamic-adjunct pipeline below the sandbox: a plain-data
// descriptor compiles to a real AdjunctDefinition, and the registry routes a
// dynamic type-id through getAdjunct (built-in → dynamic). The Worker execution
// that produces the descriptor is browser-only (covered by e2e).

const PILLAR = {
    meta: { typeId: 0xf001, name: 'monolith', short: 'MON', version: '1.0.0' },
    layout: 'standard' as const,
    render: [
        { mesh: 'box' as const, color: 0x6a5acd },
        { mesh: 'sphere' as const, color: 0xffd54a, size: [0.8, 0.8, 0.8] as [number, number, number], offset: [0, 0, 2.4] as [number, number, number] },
    ],
};

describe('descriptorToDefinition (declarative dynamic adjunct)', () => {
    it('compiles a descriptor into a built-in-shaped AdjunctDefinition', () => {
        const def = descriptorToDefinition(PILLAR);
        expect(def.hooks.reg().typeId).toBe(0xf001);
        expect(def.hooks.reg().name).toBe('monolith');
        expect(typeof def.attribute?.deserialize).toBe('function');
        expect(typeof def.attribute?.serialize).toBe('function');
        expect(typeof def.transform.stdToRenderData).toBe('function');
        expect(def.menu).toBeTruthy(); // standard edit menu so it's selectable/editable
    });

    it('round-trips the standard raw layout through the attribute', () => {
        const def = descriptorToDefinition(PILLAR);
        const raw = [[1.2, 1.2, 3.0], [5, 8, 1.5], [0, 0, 0], 0, [1, 1], 0, 1];
        const std = def.attribute!.deserialize(raw);
        expect([std.x, std.y, std.z]).toEqual([1.2, 1.2, 3.0]);
        expect([std.ox, std.oy, std.oz]).toEqual([5, 8, 1.5]);
        expect(std.stop).toBe(1); // raw[6] → solid
    });

    it('emits one RenderObject per part, applying color/size/offset', () => {
        const def = descriptorToDefinition(PILLAR);
        const std = def.attribute!.deserialize([[1.2, 1.2, 3.0], [5, 8, 1.5], [0, 0, 0], 0, [1, 1], 0, 1]);
        const ros = def.transform.stdToRenderData([std], 0);
        expect(ros).toHaveLength(2);

        const [box, orb] = ros;
        expect(box.type).toBe('box');
        expect(box.params.size).toEqual([1.2, 1.2, 3.0]);     // default = std size
        expect(box.params.position).toEqual([5, 8, 1.5]);
        expect(box.material?.color).toBe(0x6a5acd);
        expect(box.stop).toBe(1);                              // collision propagates

        expect(orb.type).toBe('sphere');
        expect(orb.params.size).toEqual([0.8, 0.8, 0.8]);      // part size override
        expect(orb.params.position).toEqual([5, 8, 1.5 + 2.4]); // offset applied
        expect(orb.material?.color).toBe(0xffd54a);
    });

    it('adds elevation to every part position', () => {
        const def = descriptorToDefinition(PILLAR);
        const std = def.attribute!.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], 0, 0]);
        const ros = def.transform.stdToRenderData([std], 10);
        expect(ros[0].params.position[2]).toBe(10);
        expect(ros[1].params.position[2]).toBe(10 + 2.4);
    });

    it('accepts a single (non-array) render part', () => {
        const def = descriptorToDefinition({ meta: { typeId: 0xf002, name: 'cube' }, render: { mesh: 'box' } });
        const std = def.attribute!.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], 0, 0]);
        expect(def.transform.stdToRenderData([std], 0)).toHaveLength(1);
    });

    describe('validateDescriptor rejects malformed input', () => {
        it('missing meta.typeId', () => {
            expect(() => validateDescriptor({ render: { mesh: 'box' } })).toThrow(/typeId/);
        });
        it('no render parts', () => {
            expect(() => validateDescriptor({ meta: { typeId: 1, name: 'x' }, render: [] })).toThrow(/at least one/);
        });
        it('invalid mesh type', () => {
            expect(() => validateDescriptor({ meta: { typeId: 1, name: 'x' }, render: { mesh: 'teapot' } })).toThrow(/valid mesh/);
        });
        it('unsupported layout', () => {
            expect(() => validateDescriptor({ meta: { typeId: 1, name: 'x' }, layout: 'binary', render: { mesh: 'box' } })).toThrow(/layout/);
        });
        it('function-style hooks (not declarative)', () => {
            expect(() => validateDescriptor({ meta: { typeId: 1, name: 'x' }, transform: { stdToRenderData: () => [] }, render: { mesh: 'box' } }))
                .toThrow(/function-style hooks/);
        });
    });
});

describe('AdjunctRegistry dynamic routing', () => {
    afterEach(() => clearDynamicAdjuncts());

    it('getAdjunct resolves a registered dynamic type-id', () => {
        expect(getAdjunct(0xf001)).toBeUndefined();
        const def = descriptorToDefinition(PILLAR);
        registerDynamicAdjunct(0xf001, def);
        expect(getDynamicAdjunct(0xf001)).toBe(def);
        expect(getAdjunct(0xf001)).toBe(def);          // built-in → dynamic fallthrough
    });

    it('does not let a dynamic adjunct shadow a built-in', () => {
        expect(() => registerDynamicAdjunct(0x00a2, descriptorToDefinition(PILLAR)))
            .toThrow(/built-in/);
    });

    it('built-in resolution is unaffected by dynamic registration', () => {
        registerDynamicAdjunct(0xf001, descriptorToDefinition(PILLAR));
        expect(getAdjunct(0x00a2)).toBe(getBuiltinAdjunct(0x00a2)); // box still native
    });

    it('clearDynamicAdjuncts forgets registrations', () => {
        registerDynamicAdjunct(0xf001, descriptorToDefinition(PILLAR));
        clearDynamicAdjuncts();
        expect(getAdjunct(0xf001)).toBeUndefined();
    });
});
