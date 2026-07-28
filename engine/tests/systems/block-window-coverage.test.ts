import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { BlockLODSystem } from '../../src/core/systems/BlockLODSystem';
import { AdjunctComponent } from '../../src/core/components/AdjunctComponents';
import { MeshComponent } from '../../src/core/components/VisualizationComponents';
import { WorldMetrics } from '../../src/core/utils/WorldMetrics';

/**
 * The visible boundary must be ISOTROPIC — the same in every direction, at every
 * position the player can stand. Corner artefacts ("缺角") shipped twice because
 * it was not:
 *
 *   · 2026-07-27: fog far = ext·bw·1.2 = 38.4 m, lodNear = 40 m — both sized by
 *     the window's ORTHOGONAL edge, while corner blocks sit √2× further. Exactly
 *     the four corners got clipped: an "井" from above.
 *   · 2026-07-28: the fix enlarged fog far to ext·hypot(bw,bl)·1.2 = 54.3 m. That
 *     covered the corner CENTRES but not the corner tips (60.5 m), and pushed the
 *     fog 22 m PAST the nearest window face — so the ground now ended in mid-air
 *     at 36 % haze in the orthogonal directions. The mirror-image bug.
 *
 * The lesson these tests exist to keep: a SQUARE window (Chebyshev, centred on
 * the player's BLOCK) and a RADIAL mask (Euclidean, centred on the player) can
 * never coincide, so no choice of radius fixes it. The window is a PREFETCH
 * region; the VISIBLE region is the disc of `metrics.streamingReach(ext)` inside
 * it. Both masks derive from that one number, and what falls outside the disc is
 * already 100 % fogged regardless of shape.
 *
 * Data streaming was never at fault in either bug (all 25 blocks always loaded
 * and simulated) — which is why the pre-existing e2e missed it: `loadedBlocks
 * <= 25` is satisfied by a corner-less 21 too.
 */

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

const BX = 2048, BY = 2048;

/** A block raw carrying one a2 box, so the block has a LOD-clippable adjunct. */
const rawWithBox = () => [0, 1, [[0x00a2, [[[1, 1, 1], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0]]]], []];

/** Inject the full (2·ext+1)² window centred on (BX,BY), as the loader does. */
async function setupWindow(ext: number) {
    const { engine, nullEngine } = await makeHeadlessEngineWith({ api: api() });
    const world = engine.getWorld()!;
    for (let dx = -ext; dx <= ext; dx++) {
        for (let dy = -ext; dy <= ext; dy++) {
            engine.injectBlock({ x: BX + dx, y: BY + dy, world: 'main', elevation: 0, adjuncts: rawWithBox() });
        }
    }
    // Enough frames for AdjunctSystem's budgeted mesh build AND at least one
    // BlockLODSystem interval (0.25 s).
    stepN(engine, 60);
    return { engine, world, nullEngine };
}

/** Per-block adjunct mesh visibility, keyed by offset from the window centre. */
function visibilityByOffset(world: any): Record<string, { total: number; visible: number }> {
    const byBlock = new Map<number, { x: number; y: number; total: number; visible: number }>();
    for (const eid of world.queryEntities('BlockComponent')) {
        const b = world.getComponent(eid, 'BlockComponent');
        if (b) byBlock.set(eid, { x: b.x, y: b.y, total: 0, visible: 0 });
    }
    for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
        const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
        if (!adj) continue;
        const rec = byBlock.get(adj.parentBlockEntityId as number);
        if (!rec) continue;
        if (typeof adj.adjunctId === 'string' && adj.adjunctId.startsWith('ground')) continue;
        const mesh = world.getComponent<MeshComponent>(eid, 'MeshComponent');
        if (!mesh?.handle) continue;
        rec.total++;
        if ((mesh.handle as any).visible !== false) rec.visible++;
    }
    const out: Record<string, { total: number; visible: number }> = {};
    for (const r of byBlock.values()) out[`${r.x - BX},${r.y - BY}`] = { total: r.total, visible: r.visible };
    return out;
}

describe('the visible boundary is a disc inside the window, not the window itself', () => {
    it('fog closes at or before the NEAREST window face — never past it', async () => {
        const { world, nullEngine } = await setupWindow(2);
        const fog = nullEngine.__counts.lastFog as { near: number; far: number };
        const m = world.metrics;
        const ext = (world.config.player as any)?.extend ?? 2;
        expect(fog).not.toBeNull();

        // The window is centred on the player's BLOCK, so standing at your own
        // block's far edge leaves only `ext` whole blocks on that side. Anything
        // beyond this and the ground can end while still partly transparent.
        const guaranteed = ext * Math.min(m.blockWidth, m.blockLength);   // 32 m
        expect(m.streamingReach(ext)).toBe(guaranteed);
        expect(fog.far).toBeLessThanOrEqual(guaranteed);

        // Both historical values are now regressions, in both directions.
        expect(fog.far).not.toBeCloseTo(ext * m.blockWidth * 1.2, 1);              // 38.4 m
        expect(fog.far).not.toBeCloseTo(ext * Math.hypot(m.blockWidth, m.blockLength) * 1.2, 1); // 54.3 m

        // Still a haze with depth, not an opaque wall in your face.
        expect(fog.near).toBeGreaterThan(0);
        expect(fog.near).toBeLessThan(fog.far);
    });

    it('nothing is LOD-hidden while it is still visible through the fog', async () => {
        const { world, nullEngine } = await setupWindow(2);
        const fog = nullEngine.__counts.lastFog as { near: number; far: number };
        const ext = (world.config.player as any)?.extend ?? 2;
        const lodNear = world.metrics.streamingReach(ext);

        // THE coupling. LOD hides a block once its NEAREST point passes lodNear;
        // the fog is total at `far`. lodNear < far would wink adjuncts out while
        // they were still on screen — the same anisotropy bug, second location.
        expect(lodNear).toBeGreaterThanOrEqual(fog.far);
        expect(world.systems.findSystem(BlockLODSystem)).toBeTruthy();
    });

    it('the disc is isotropic: hidden-ness depends on distance alone, not direction', async () => {
        const { world } = await setupWindow(2);
        const vis = visibilityByOffset(world);
        const m = world.metrics;
        const player = world.getComponent<any>(
            world.queryEntities('TransformComponent', 'InputStateComponent')[0], 'TransformComponent');
        const lodNear = m.streamingReach((world.config.player as any)?.extend ?? 2);

        const nearest = (bx: number, by: number) => {
            const c = m.blockCentre(bx, by);
            const dx = Math.max(0, Math.abs(player.position[0] - c[0]) - m.blockWidth / 2);
            const dz = Math.max(0, Math.abs(player.position[2] - c[2]) - m.blockLength / 2);
            return Math.hypot(dx, dz);
        };

        // Data layer is untouched by any of this: all 25 cells are resident.
        expect(Object.keys(vis).length).toBe(25);

        // The disc must actually CUT the square, or this test proves nothing: the
        // outer diagonal cells fall outside `reach` while the orthogonal ones do
        // not. (If a future radius change makes every cell one tier, this fails
        // loudly instead of passing vacuously.)
        const tiers = new Set(Object.values(vis).filter((v) => v.total > 0).map((v) => v.visible === v.total));
        expect(tiers.size, 'vacuous — every cell landed in the same tier').toBe(2);

        // Every cell's visibility must agree with its DISTANCE. The 井 bug was
        // precisely a cell being hidden at a distance where another cell, in a
        // different direction, stayed lit.
        for (const [key, v] of Object.entries(vis)) {
            if (v.total === 0) continue;
            const [dx, dy] = key.split(',').map(Number);
            const d = nearest(BX + dx, BY + dy);
            const shouldBeNear = d <= lodNear;
            expect(v.visible === v.total, `${key} @ ${d.toFixed(1)}m (lodNear ${lodNear})`).toBe(shouldBeNear);
        }
    });

    it('LOD still clips genuinely distant blocks (the fix is not a disable)', async () => {
        const { engine, world } = await setupWindow(2);
        // A block well outside any plausible window: centre 8 blocks (128 m) east.
        engine.injectBlock({ x: BX + 8, y: BY, world: 'main', elevation: 0, adjuncts: rawWithBox() });
        stepN(engine, 60);

        const vis = visibilityByOffset(world);
        expect(vis['8,0'].total).toBeGreaterThan(0);
        expect(vis['8,0'].visible).toBe(0);              // far tier → adjuncts hidden
        expect(vis['0,0'].visible).toBe(vis['0,0'].total); // the block you stand in, always
    });

    it('takes the SHORTER axis on a non-square grid', () => {
        // The guarantee is per-direction, so an oblong block is bounded by its
        // short side — hypot (the 2026-07-27 answer) overshoots it 4×.
        const oblong = new WorldMetrics({ block: [32, 8, 16] });
        expect(oblong.streamingReach(2)).toBe(16);
        expect(2 * Math.hypot(32, 8)).toBeCloseTo(65.97, 1);
        // Degenerate extends must not produce a negative or fractional radius.
        expect(oblong.streamingReach(0)).toBe(0);
        expect(oblong.streamingReach(-3)).toBe(0);
        expect(oblong.streamingReach(2.7)).toBe(16);
    });
});
