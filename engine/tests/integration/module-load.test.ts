import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { createNullRenderEngine } from '../helpers/null-render-engine';
import {
    FakeModelLoader,
    CountingDataSource,
    makePlainTemplate,
    flushAsync,
} from '../helpers/fake-resources';

// End-to-end through the real World → BlockSystem → AdjunctSystem → AdjunctFactory
// path: a block placing ONE model id many times must load the file ONCE and
// instance it many times, swapping each placeholder box for a model clone.

const fixture = JSON.parse(readFileSync(new URL('../fixtures/region-module.json', import.meta.url), 'utf8'));
const block = fixture.block;
const modRec = (raw: string) => ({ type: 'module', format: 'glb', raw });

async function bootWithModuleBlock() {
    const loader = new FakeModelLoader(makePlainTemplate);
    const ds = new CountingDataSource({ '27': modRec('models/robot.glb'), '31': modRec('models/tree.glb') });
    const nullEngine = createNullRenderEngine();
    const { engine } = await makeHeadlessEngineWith({
        api: ds,
        resources: { loader },
        nullEngine,
    });
    return { engine, loader, ds, nullEngine };
}

describe('module adjunct — load-once / instance-many (end-to-end)', () => {
    it('N placements of one id trigger ONE fetch + decode, N clones', async () => {
        const { engine, loader, ds, nullEngine } = await bootWithModuleBlock();
        const world = engine.getWorld()!;

        engine.injectBlock({ x: block.x, y: block.y, world: 'main', adjuncts: block.raw, elevation: block.raw[0] });

        // Build blocks + adjuncts (frame-split budgets), then let the async model
        // loads + swaps settle.
        for (let i = 0; i < 30; i++) engine.step(1 / 60);
        await flushAsync();
        for (let i = 0; i < 5; i++) engine.step(1 / 60);
        await flushAsync();

        // 6 module placements (5×id27 + 1×id31) but each FILE fetched exactly once.
        expect(ds.moduleCalls['27'], 'id 27 fetched once').toBe(1);
        expect(ds.moduleCalls['31'], 'id 31 fetched once').toBe(1);
        expect(loader.parseCount, 'two distinct files decoded').toBe(2);

        // ... and instanced per placement: 5 clones of 27, 1 of 31.
        const refs = world.resourceManager.getStats().modelRefs;
        expect(refs['27']).toBe(5);
        expect(refs['31']).toBe(1);

        // The swap ran: model clones were added and placeholders removed.
        expect(nullEngine.__counts.added).toBeGreaterThan(0);
        expect(nullEngine.__counts.removed).toBeGreaterThanOrEqual(6); // ≥ one placeholder per module
    });

    it('module adjuncts respect the per-frame build budget (frame-split safe)', async () => {
        const { engine } = await bootWithModuleBlock();
        const world = engine.getWorld()!;

        engine.injectBlock({ x: block.x, y: block.y, world: 'main', adjuncts: block.raw, elevation: block.raw[0] });

        const builtCount = () => world.getEntitiesWith(['AdjunctComponent'])
            .filter((id: number) => (world.getComponent<any>(id, 'AdjunctComponent') as any)?.isInitialized).length;

        engine.step(1 / 60);
        // Only the cheap placeholder boxes are built synchronously; the heavy model
        // decode is off the build budget (a promise), so one frame stays bounded.
        expect(builtCount()).toBeLessThanOrEqual(16);
    });
});

describe('module adjunct — eviction releases shared template (disposal safety)', () => {
    it('a shared model id survives until its LAST referencing block is evicted', async () => {
        const loader = new FakeModelLoader(makePlainTemplate);
        const ds = new CountingDataSource({ '27': modRec('models/robot.glb') });
        const { engine } = await makeHeadlessEngineWith({ api: ds, resources: { loader } });
        const world = engine.getWorld()!;

        // Two blocks, each placing model id 27 once.
        const oneModuleBlock = [0.2, 1, [[164, [[[2, 2, 3], [4, 4, 0], [0, 0, 0], 27, 0, 0]]]], []];
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: oneModuleBlock, elevation: 0.2 });
        engine.injectBlock({ x: 2049, y: 2048, world: 'main', adjuncts: oneModuleBlock, elevation: 0.2 });

        for (let i = 0; i < 20; i++) engine.step(1 / 60);
        await flushAsync();
        for (let i = 0; i < 5; i++) engine.step(1 / 60);
        await flushAsync();

        expect(ds.moduleCalls['27'], 'one file for two blocks').toBe(1);
        expect(world.resourceManager.getStats().modelRefs['27'], 'two clones').toBe(2);

        // Evict block A — template must stay (block B still uses it).
        engine.removeBlock(2048, 2048);
        expect(world.resourceManager.getModelEntry('27')?.refCount, 'one clone left').toBe(1);

        // Evict block B — last reference gone, template freed.
        engine.removeBlock(2049, 2048);
        expect(world.resourceManager.getModelEntry('27'), 'template disposed + dropped').toBeUndefined();
        expect(world.resourceManager.getStats().models).toBe(0);
    });
});
