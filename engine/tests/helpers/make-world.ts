import { Engine } from '../../src/Engine';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { createNullRenderEngine } from './null-render-engine';

const FIXED_DT = 1 / 60;

/** A deterministic local world config + player start for tests. */
class HeadlessDataSource {
  async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
  async view() { return null; }
  async module() { return {}; }
  async texture() { return {}; }
}

/**
 * Boot a real World headlessly (no GPU/DOM): injects a NullRenderEngine, uses
 * `uiMode: 'events'` (no DOM UI), and a deterministic local data source. Drive
 * it with `engine.step(dt)` — NOT `start()` (which is the rAF loop).
 *
 * Unblocked by the two prerequisite refactors (renderer DI + step(dt)).
 */
export async function makeHeadlessEngine(playerStart?: {
  block: [number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
}): Promise<Engine> {
  const engine = new Engine('headless-test-root', {
    api: new HeadlessDataSource() as any,
    renderer: createNullRenderEngine() as any,
    uiMode: 'events',
  });
  await engine.bootWorld(0, playerStart ?? {
    block: [2048, 2048],
    position: [8, 8, 1],
    rotation: [0, 0, 0],
  });
  return engine;
}

/** Pump the simulation `ticks` times at a fixed dt (deterministic). */
export function stepN(engine: Engine, ticks: number, dt: number = FIXED_DT): void {
  for (let i = 0; i < ticks; i++) engine.step(dt);
}
