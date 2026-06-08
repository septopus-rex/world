import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith } from '../helpers/make-world';
import { FakeTextureLoader, CountingDataSource, flushAsync } from '../helpers/fake-resources';

// End-to-end through World → BlockSystem → AdjunctSystem → AdjunctFactory: textured
// surfaces load their texture ONCE per id (shared across every surface using it),
// assign it as .map, ref-count it, and release on eviction.

const texRec = (raw: string) => ({ type: 'texture', format: 'jpg', raw, repeat: [1, 1] });

// Box instance with the optional texture slot (data[7]): [size, offset, rot,
// resource(colorIdx), repeat, animate, stop, TEXTURE_ID]. Box typeId 0x00a2 = 162.
const box = (ox: number, texId: string) => [[2, 2, 2], [ox, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0, texId];

function blockWithTexturedBoxes() {
    return [0.2, 1, [[162, [
        box(3, '7'), box(6, '7'), box(9, '7'), box(12, '7'), // 4× texture 7
        box(3, '9'),                                          // 1× texture 9
    ]]], []];
}

async function boot() {
    const texLoader = new FakeTextureLoader();
    const ds = new CountingDataSource({}, { '7': texRec('textures/brick.jpg'), '9': texRec('textures/wood.jpg') });
    const { engine } = await makeHeadlessEngineWith({ api: ds, resources: { textureLoader: texLoader } });
    return { engine, texLoader, ds };
}

describe('textured surfaces — load-once / shared-by-reference (end-to-end)', () => {
    it('N surfaces sharing a texture id trigger ONE fetch + decode, shared by reference', async () => {
        const { engine, texLoader, ds } = await boot();
        const world = engine.getWorld()!;

        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: blockWithTexturedBoxes(), elevation: 0.2 });
        for (let i = 0; i < 20; i++) engine.step(1 / 60);
        await flushAsync();
        for (let i = 0; i < 5; i++) engine.step(1 / 60);
        await flushAsync();

        // Two distinct texture files, each fetched + decoded exactly once...
        expect(ds.textureCalls['7'], 'texture 7 fetched once').toBe(1);
        expect(ds.textureCalls['9'], 'texture 9 fetched once').toBe(1);
        expect(texLoader.loadCount, 'two files decoded').toBe(2);

        // ... referenced by every surface that uses them (4× id7, 1× id9).
        const refs = world.resourceManager.getStats().textureRefs;
        expect(refs['7']).toBe(4);
        expect(refs['9']).toBe(1);
    });

    it('releases shared textures on eviction; the file is freed at the last user', async () => {
        const { engine } = await boot();
        const world = engine.getWorld()!;

        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: blockWithTexturedBoxes(), elevation: 0.2 });
        for (let i = 0; i < 20; i++) engine.step(1 / 60);
        await flushAsync();
        for (let i = 0; i < 5; i++) engine.step(1 / 60);
        await flushAsync();

        expect(world.resourceManager.getStats().textures).toBe(2);

        engine.removeBlock(2048, 2048);
        // Every textured box released its texture → both texture files freed.
        expect(world.resourceManager.getStats().textures).toBe(0);
        expect(world.resourceManager.getStats().textureRefs).toEqual({});
    });
});
