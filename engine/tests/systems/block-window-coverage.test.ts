import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { BlockLODSystem } from '../../src/core/systems/BlockLODSystem';
import { AdjunctComponent } from '../../src/core/components/AdjunctComponents';
import { MeshComponent } from '../../src/core/components/VisualizationComponents';

/**
 * The streaming window must be a FILLED SQUARE — a "田", not a "井" with its
 * corners punched out (bug found 2026-07-27).
 *
 * What went wrong: the window is a (2·ext+1)² square of blocks, so its farthest
 * content lies on the DIAGONAL — a corner block's centre is ext·√(bw²+bl²) away,
 * √2× the orthogonal edge (45.3 m vs 32 m at ext=2). Two consumers sized
 * themselves by the ORTHOGONAL distance and so clipped exactly the four corners:
 *
 *   · fog far = ext·blockWidth·1.2 = 38.4 m  → corners (45.3 m) painted pure sky
 *   · lodNear = 40 m vs corner CENTRE 45.3 m → corner adjunct meshes hidden
 *
 * Data streaming was never at fault (all 25 blocks loaded and simulated); they
 * were merely invisible. That is why the pre-existing e2e missed it — it asserted
 * `loadedBlocks <= 25`, which a corner-less 21 also satisfies.
 *
 * These tests pin the VISIBLE window, not just the loaded one.
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

describe('streaming window is a filled square (田, not 井)', () => {
    it('every block in the default window keeps its adjuncts VISIBLE — corners included', async () => {
        const { world } = await setupWindow(2);
        const vis = visibilityByOffset(world);

        // All 25 cells present…
        expect(Object.keys(vis).length).toBe(25);
        // …and not one of them had its adjuncts clipped. The four corners are the
        // regression: they used to come back visible 0 of 1.
        const clipped = Object.entries(vis)
            .filter(([, v]) => v.total > 0 && v.visible === 0)
            .map(([k]) => k);
        expect(clipped).toEqual([]);

        for (const corner of ['-2,-2', '-2,2', '2,-2', '2,2']) {
            expect(vis[corner].total).toBeGreaterThan(0);
            expect(vis[corner].visible).toBe(vis[corner].total);
        }
    });

    it('LOD is judged on a block\'s NEAREST point, so tiers cannot be anisotropic', async () => {
        const { world } = await setupWindow(2);
        const m = world.metrics;
        const lod = world.systems.findSystem(BlockLODSystem)!;
        const player = world.getComponent<any>(
            world.queryEntities('TransformComponent', 'InputStateComponent')[0], 'TransformComponent');

        // The old metric was the block CENTRE: at ext=2 the corner centre (45.3 m)
        // exceeded lodNear=40 while the orthogonal centre (32 m) did not — the
        // window got an "井" hole. The AABB metric keeps the whole window near.
        const nearest = (bx: number, by: number) => {
            const c = m.blockCentre(bx, by);
            const dx = Math.max(0, Math.abs(player.position[0] - c[0]) - m.blockWidth / 2);
            const dz = Math.max(0, Math.abs(player.position[2] - c[2]) - m.blockLength / 2);
            return Math.hypot(dx, dz);
        };
        const cornerCentre = Math.hypot(
            player.position[0] - m.blockCentre(BX + 2, BY + 2)[0],
            player.position[2] - m.blockCentre(BX + 2, BY + 2)[2]);

        expect(cornerCentre).toBeGreaterThan(40);      // the old metric DID exceed lodNear…
        expect(nearest(BX + 2, BY + 2)).toBeLessThan(40); // …the new one does not.
        expect(lod).toBeTruthy();
    });

    it('LOD still clips genuinely distant blocks (the fix is not a disable)', async () => {
        const { engine, world } = await setupWindow(2);
        // A block well outside any plausible window: centre 8 blocks (128 m) east.
        engine.injectBlock({ x: BX + 8, y: BY, world: 'main', elevation: 0, adjuncts: rawWithBox() });
        stepN(engine, 60);

        const vis = visibilityByOffset(world);
        expect(vis['8,0'].total).toBeGreaterThan(0);
        expect(vis['8,0'].visible).toBe(0);            // far tier → adjuncts hidden
        expect(vis['2,2'].visible).toBe(vis['2,2'].total); // window corner still near
    });
});

describe('fog reaches the window\'s diagonal, not just its edge', () => {
    it('the far plane sits beyond the farthest CORNER block centre', async () => {
        const { world, nullEngine } = await setupWindow(2);
        const fog = nullEngine.__counts.lastFog as { near: number; far: number };
        const m = world.metrics;
        const ext = (world.config.player as any)?.extend ?? 2;

        expect(fog).not.toBeNull();

        const cornerCentre = ext * Math.hypot(m.blockWidth, m.blockLength); // 45.25 m
        const orthoEdge = ext * m.blockWidth;                               // 32 m
        expect(cornerCentre).toBeGreaterThan(orthoEdge);                    // the √2 the bug ignored

        // THE regression: corner content must be inside the fog, not past it.
        expect(fog.far).toBeGreaterThan(cornerCentre);
        // Still a local haze, not a disabled fog — the boundary must stay hidden.
        expect(fog.near).toBeLessThan(cornerCentre);
        expect(fog.far).toBeLessThan(cornerCentre * 2);
    });

    it('scales with a non-square grid per axis', async () => {
        // hypot uses BOTH horizontal extents, so an oblong block is handled too.
        const m = { blockWidth: 32, blockLength: 8 };
        expect(2 * Math.hypot(m.blockWidth, m.blockLength)).toBeCloseTo(65.97, 1);
        // (vs the old max()-based radius of 64 — which again fell short of the corner.)
    });
});
