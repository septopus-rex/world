import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';

// L3 — proves the two prerequisite refactors: a real World boots and ticks all
// systems in Node with NO GPU/DOM (injected NullRenderEngine), driven by the
// deterministic step(dt) path instead of the rAF loop.

describe('headless World boot (renderer DI + step refactor)', () => {
  it('boots without a GPU/DOM and exposes a World', async () => {
    const engine = await makeHeadlessEngine();
    expect(engine.getWorld()).toBeTruthy();
  });

  it('steps the simulation deterministically without throwing', async () => {
    const engine = await makeHeadlessEngine();
    expect(() => stepN(engine, 10)).not.toThrow();
  });

  it('sets up a player entity on boot', async () => {
    const engine = await makeHeadlessEngine();
    stepN(engine, 1);
    const world = engine.getWorld()!;
    expect(world.getEntitiesWith(['TransformComponent']).length).toBeGreaterThan(0);
  });

  it('materializes an injected block within a few steps', async () => {
    const engine = await makeHeadlessEngine();
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [], elevation: 0 });
    stepN(engine, 5);
    const world = engine.getWorld()!;
    expect(world.getEntitiesWith(['BlockComponent']).length).toBeGreaterThan(0);
  });
});
