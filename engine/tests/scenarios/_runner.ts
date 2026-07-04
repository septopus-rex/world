/**
 * Scenario harness — declarative, data-driven behavioral test cases.
 *
 * A scenario is a plain object: world + player setup, a sequence of input steps
 * (each run for N fixed-dt ticks), and an `expect` assertion over the final world
 * state. Authoring a new case = add a `*.scenario.ts` file that default-exports
 * `defineScenario({...})`. No boilerplate.
 *
 * STATUS: the two prerequisite refactors are DONE — a World boots headlessly
 * with an injected NullRenderEngine and is driven by `step(dt)` (see
 * helpers/make-world.ts `makeHeadlessEngine` + `integration/headless-boot.test.ts`).
 * `runScenario` is implementable now; remaining work is (a) loading the scenario's
 * `world.blocks` fixtures and (b) mapping `step.input` to `engine.setMoveIntent` /
 * `engine.jump`, then reading the player back via `Coords.engineToSeptopus`. Left as the
 * next step. The TYPES + authoring format below are stable.
 */

export interface ScenarioInput {
  forward?: boolean; back?: boolean; left?: boolean; right?: boolean; jump?: boolean;
}

export interface ScenarioStep {
  ticks: number;        // number of fixed-dt ticks to run
  input?: ScenarioInput;
}

export interface ScenarioWorldView {
  player: { position: [number, number, number]; block: [number, number] };
  // extend with component accessors (getComponent, etc.) as scenarios require
}

export interface Scenario {
  name: string;
  world: { blocks: string[] };  // fixture refs, e.g. 'flat@2048,2048'
  player: { block: [number, number]; position: [number, number, number] };
  steps: ScenarioStep[];
  expect: (w: ScenarioWorldView) => void;
}

export const FIXED_DT = 1 / 60;

export function defineScenario(s: Scenario): Scenario {
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runScenario(_s: Scenario): Promise<void> {
  throw new Error(
    'runScenario not wired yet. Prereqs (renderer DI + step(dt)) are DONE — ' +
    'remaining: fixture loading + input scripting via makeHeadlessEngine/setMoveIntent. ' +
    'See engine/tests/README.md.',
  );
}
