import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ParticleFX } from '../../src/render/ParticleFX';

// The weather volume shipped for months as a cloud of little SQUARES glued to the
// player: PointsMaterial with no `map` (three's default point sprite IS an opaque
// square), positions never integrated (updateWeather only re-centred the box), and
// `snow` never rendered at all. These tests pin each of those separately — none of
// them needs a GPU, because all four defects live in geometry/material setup and
// in the CPU-side integration loop. The real-GL half (does it draw?) is
// client/desktop/e2e/weather-particles.spec.ts.

const W = ParticleFX.WEATHER;
const fx = () => new ParticleFX(new THREE.Group());
const geo = (h: any) => (h as THREE.Points).geometry;
const pos = (h: any) => geo(h).attributes.position.array as Float32Array;
const alpha = (h: any, i: number) => (geo(h).attributes.color.array as Float32Array)[i * 4 + 3];
const mat = (h: any) => (h as THREE.Points).material as THREE.PointsMaterial;

/** Absolute world position of particle i = box-local coords + the box's anchor. */
function abs(h: any, i: number): [number, number, number] {
    const p = pos(h), o = (h as THREE.Points).position;
    return [p[i * 3] + o.x, p[i * 3 + 1] + o.y, p[i * 3 + 2] + o.z];
}

describe('weather particles — sprites, not squares', () => {
    it('both kinds carry an alpha sprite (a bare PointsMaterial draws a square)', () => {
        const h = fx().createWeather();
        const p = h as THREE.Points;
        const materials = [(p.userData.weather as any).rainMat, (p.userData.weather as any).snowMat];

        for (const m of materials) {
            expect(m.map, 'no map ⇒ every particle is an opaque square').toBeTruthy();
            expect(m.map!.image.width).toBeGreaterThan(1);
            // Alpha must actually vary across the sprite — a fully opaque texture
            // would be the square all over again, just tinted.
            const data = m.map!.image.data as Uint8Array;
            const alphas = new Set<number>();
            for (let i = 3; i < data.length; i += 4) alphas.add(data[i]);
            expect(alphas.size, 'sprite alpha is constant ⇒ still a square').toBeGreaterThan(8);
            expect(Math.min(...alphas)).toBe(0);    // transparent at the rim
            expect(Math.max(...alphas)).toBeGreaterThan(200); // solid at the core

            // Nearest filtering on a magnified 64² sprite is a blocky square too.
            expect(m.map!.magFilter).toBe(THREE.LinearFilter);
            // A transparent particle that writes depth punches a hole in what follows.
            expect(m.depthWrite).toBe(false);
            expect(m.transparent).toBe(true);
            // Per-particle alpha (near fade) rides the vec4 colour attribute.
            expect(m.vertexColors).toBe(true);
        }
        expect(geo(h).attributes.color.itemSize, 'RGB only ⇒ no per-particle alpha').toBe(4);
    });

    it('burst sparks are sprites too', () => {
        const { handle } = fx().createBurst(20, 0xff5500);
        expect(mat(handle).map).toBeTruthy();
        expect(mat(handle).depthWrite).toBe(false);
    });
});

describe('weather particles — they actually fall', () => {
    it('rain descends and stays put in the world while the box follows the player', () => {
        const f = fx();
        const h = f.createWeather();
        f.updateWeather(h, 0, 0, 0, 'rain', 3, 1 / 60);   // frame 1 anchors the box
        const before = abs(h, 0);

        // Walk 5 m east over one frame. The box moves with us; the rain must NOT —
        // otherwise the whole downpour is welded to the camera and reads as fog.
        f.updateWeather(h, 5, 0, 0, 'rain', 3, 1 / 60);
        const after = abs(h, 0);

        expect(after[1], 'rain did not fall').toBeLessThan(before[1]);
        expect(before[1] - after[1]).toBeGreaterThan(0.1);          // ~20 m/s at 1/60 s
        expect(Math.abs(after[0] - before[0]), 'dragged along with the player').toBeLessThan(0.2);
        expect(Math.abs(after[2] - before[2])).toBeLessThan(0.05);
    });

    it('snow drifts sideways and falls far slower than rain', () => {
        const f = fx();
        // Accumulate descent modulo the box height — over 30 frames a rain drop
        // wraps past the floor, and a raw start-minus-end delta would read that
        // wrap as the drop having risen.
        const descent = (kind: 'rain' | 'snow', frames: number) => {
            const h = f.createWeather();
            f.updateWeather(h, 0, 0, 0, kind, 2, 1 / 60);
            let total = 0, prev = pos(h)[1];
            for (let i = 0; i < frames; i++) {
                f.updateWeather(h, 0, 0, 0, kind, 2, 1 / 60);
                const y = pos(h)[1];
                total += ((prev - y) % W.height + W.height) % W.height;
                prev = y;
            }
            return total;
        };
        expect(descent('rain', 30)).toBeGreaterThan(5 * descent('snow', 30));

        const snow = f.createWeather();
        f.updateWeather(snow, 0, 0, 0, 'snow', 2, 1 / 60);

        // Lateral sway is what makes snow read as snow rather than as slow rain.
        const sx = abs(snow, 0)[0], sz = abs(snow, 0)[2];
        for (let i = 0; i < 60; i++) f.updateWeather(snow, 0, 0, 0, 'snow', 2, 1 / 60);
        expect(Math.hypot(abs(snow, 0)[0] - sx, abs(snow, 0)[2] - sz)).toBeGreaterThan(0.05);
    });

    it('a teleport re-scatters the volume in ONE frame (modulo wrap, not a chase)', () => {
        const f = fx();
        const h = f.createWeather();
        f.updateWeather(h, 0, 0, 0, 'rain', 3, 1 / 60);
        f.updateWeather(h, 8000, 0, -8000, 'rain', 3, 1 / 60); // portal jump

        const p = pos(h);
        for (let i = 0; i < 200; i++) {
            expect(p[i * 3]).toBeGreaterThanOrEqual(0);
            expect(p[i * 3]).toBeLessThan(W.span);
            expect(p[i * 3 + 1]).toBeGreaterThanOrEqual(0);
            expect(p[i * 3 + 1]).toBeLessThan(W.height);
        }
    });

    it('keeps box-local coords small so float32 stays precise 32 km out', () => {
        const f = fx();
        const h = f.createWeather();
        f.updateWeather(h, 32768, 40, 32768, 'rain', 3, 1 / 60);
        f.updateWeather(h, 32768, 40, 32768, 'rain', 3, 1 / 60);
        const p = pos(h);
        // Absolute coords in the attribute would quantise to ~4 mm here — the very
        // reason FloatingOrigin exists. The anchor carries the magnitude instead.
        for (let i = 0; i < 50; i++) expect(Math.abs(p[i * 3])).toBeLessThan(64);
        expect((h as THREE.Points).position.x).toBeGreaterThan(30000);
    });
});

describe('weather particles — visibility, grade and the near fade', () => {
    it('clear weather hides the volume; rain and snow both show it', () => {
        const f = fx();
        const h = f.createWeather();
        expect((h as THREE.Points).visible).toBe(false);

        f.updateWeather(h, 0, 0, 0, null, 0, 1 / 60);
        expect((h as THREE.Points).visible).toBe(false);

        f.updateWeather(h, 0, 0, 0, 'rain', 1, 1 / 60);
        expect((h as THREE.Points).visible).toBe(true);

        // 'snow' used to fall through to hidden — a quarter of the weather cycle
        // rendered nothing at all.
        f.updateWeather(h, 0, 0, 0, 'snow', 1, 1 / 60);
        expect((h as THREE.Points).visible).toBe(true);
        expect(mat(h).size).toBeLessThan(0.3); // swapped to the flake material
    });

    it('grade scales the drawn count — a drizzle is not a downpour', () => {
        const f = fx();
        const h = f.createWeather();
        const drawnAt = (g: number) => {
            f.updateWeather(h, 0, 0, 0, 'rain', g, 1 / 60);
            return geo(h).drawRange.count;
        };
        expect(drawnAt(0)).toBeLessThan(drawnAt(1));
        expect(drawnAt(1)).toBeLessThan(drawnAt(3));
        expect(drawnAt(9), 'out-of-range grade clamps').toBe(drawnAt(3));
    });

    it('fades particles out at the lens and at the volume edge', () => {
        const f = fx();
        const h = f.createWeather();
        // Park one particle on the camera, one a few metres out, one far away.
        f.updateWeather(h, 0, 0, 0, 'rain', 3, 1 / 60);
        const p = pos(h);
        const put = (i: number, x: number, y: number, z: number) => {   // → box-local
            p[i * 3] = x + W.span / 2; p[i * 3 + 1] = y + W.below; p[i * 3 + 2] = z + W.span / 2;
        };
        put(0, 0.1, 0, 0);              // in your face
        put(1, 6, 0, 0);                // comfortable middle distance
        put(2, 0, 0, W.span / 2 - 1);   // just inside the box's near face
        f.updateWeather(h, 0, 0, 0, 'rain', 3, 0);  // dt 0 → no motion, just the fade

        expect(alpha(h, 0), 'a streak glued to the lens').toBe(0);
        expect(alpha(h, 1)).toBeGreaterThan(0.4);
        expect(alpha(h, 2), 'the cubic box boundary must dissolve').toBe(0);
    });
});
