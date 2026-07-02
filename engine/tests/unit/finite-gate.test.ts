import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { finite, sanitizeStdTransform } from '../../src/core/utils/Num';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// Hardening ②: the finite gate at the adjunct chokepoint. Hand-edited/imported
// content with NaN / Infinity / strings in transform slots must clamp (reported)
// instead of silently poisoning transforms and physics.

describe('finite()', () => {
    it('passes finite numbers, coerces numeric strings, clamps garbage', () => {
        expect(finite(2.5, 0)).toBe(2.5);
        expect(finite('3', 0)).toBe(3);        // numeric string coerces
        expect(finite(NaN, 7)).toBe(7);
        expect(finite(Infinity, 7)).toBe(7);
        expect(finite('abc', 7)).toBe(7);
        expect(finite(undefined, 7)).toBe(7);
    });
});

describe('sanitizeStdTransform()', () => {
    it('clamps non-finite transform slots in place and reports dirtiness', () => {
        const std: any = { ox: NaN, oy: 2, oz: Infinity, rx: 'junk', x: NaN, y: 3, z: 1 };
        expect(sanitizeStdTransform(std)).toBe(true);
        expect(std).toMatchObject({ ox: 0, oy: 2, oz: 0, rx: 0, x: 1, y: 3, z: 1 });
    });

    it('is a no-op on clean data (returns false, values untouched)', () => {
        const std: any = { ox: 1, oy: 2, oz: 3, rx: 0.5, x: 2, y: 2, z: 2 };
        expect(sanitizeStdTransform(std)).toBe(false);
        expect(std).toEqual({ ox: 1, oy: 2, oz: 3, rx: 0.5, x: 2, y: 2, z: 2 });
    });

    it('leaves absent slots alone (downstream defaults apply)', () => {
        const std: any = { ox: 1 };
        expect(sanitizeStdTransform(std)).toBe(false);
        expect('x' in std).toBe(false);
    });
});

describe('finite gate at the block-inject chokepoint', () => {
    it('a poisoned box row materializes with finite transform + solid size', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;

        // [size, pos, rot, resId, repeat, anim, stop] with garbage in every slot class.
        const poisoned = [
            [NaN, 2, 'x'],            // size → x clamps to 1, z clamps to 1
            [Infinity, 4, NaN],       // position → ox/oz clamp to 0
            ['spin', 0, 0],           // rotation → rx clamps to 0
            0, [1, 1], 0, 1,          // solid (stop=1) so physics consumes it
        ];
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [0, 1, [[AdjunctType.Box, [poisoned]]], [], 0], elevation: 0 });
        stepN(engine, 6);

        const adj = world.getEntitiesWith(['AdjunctComponent'])
            .map((eid) => ({ eid, a: world.getComponent<any>(eid, 'AdjunctComponent') }))
            .find(({ a }) => a?.adjunctId?.includes('_162_'))!;
        expect(adj).toBeTruthy();

        const t = world.getComponent<any>(adj.eid, 'TransformComponent');
        expect(t.position.every((v: number) => Number.isFinite(v))).toBe(true);
        expect(t.rotation.every((v: number) => Number.isFinite(v))).toBe(true);

        const s = world.getComponent<any>(adj.eid, 'SolidComponent');
        if (s) expect(s.size.every((v: number) => Number.isFinite(v))).toBe(true);

        // The player can step near it without transform poisoning (no NaN leak).
        stepN(engine, 30);
        const player = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const pt = world.getComponent<any>(player, 'TransformComponent');
        expect(pt.position.every((v: number) => Number.isFinite(v))).toBe(true);
    });
});
