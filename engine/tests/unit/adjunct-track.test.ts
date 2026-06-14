import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { MeshFactory } from '../../src/render/MeshFactory';

// C0: the tube track adjunct (c1) — wires the render-layer tube primitive into
// the ECS/data pipeline so a coaster rail can be authored / expanded from SPP /
// serialized / rendered. Raw: [pos, path(SPP rel), radius].

describe('track adjunct (c1)', () => {
    const def = getBuiltinAdjunct(0x00c1)! as any;
    // a quarter-arc-ish piece: enters from -Y, through the centre, exits +Z
    const raw = [[2, 2, 1], [[2, 0, 2], [2, 2, 2], [2, 2, 4]], 0.4];

    it('is registered at 0x00c1', () => {
        expect(def).toBeDefined();
        expect(def.hooks.reg().typeId).toBe(0x00c1);
    });

    it('deserializes path + radius and round-trips', () => {
        const std = def.attribute.deserialize(raw);
        expect(std.path).toHaveLength(3);
        expect(std.radius).toBe(0.4);
        expect([std.ox, std.oy, std.oz]).toEqual([2, 2, 1]);
        const back = def.attribute.serialize(std);
        expect(back[1]).toHaveLength(3);
        expect(back[2]).toBe(0.4);
        expect(def.attribute.deserialize(back).path).toEqual(std.path);
    });

    it('transforms to a tube RenderObject with engine-local path', () => {
        const std = def.attribute.deserialize(raw);
        const ro = def.transform.stdToRenderData([std], 0)[0];
        expect(ro.type).toBe('tube');
        expect(ro.params.path).toHaveLength(3);
        // localSppToEngine([2,0,2]) = [x, z, -y] = [2, 2, 0]
        expect(ro.params.path[0]).toEqual([2, 2, -0]);
        expect(ro.params.size[0]).toBe(0.4); // radius

        // and it actually builds a real tube mesh (not a degenerate box)
        const mesh = MeshFactory.create(ro as any) as THREE.Mesh;
        expect(mesh.isMesh).toBe(true);
        expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(100);
    });
});
