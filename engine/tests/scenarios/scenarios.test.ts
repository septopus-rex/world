import { describe } from 'vitest';

/**
 * Discovers and runs every *.scenario.ts case through runScenario().
 * `todo` until the harness is wired (see _runner.ts + tests/README.md "Limitations").
 *
 * Target shape once unblocked:
 *
 *   import { it } from 'vitest';
 *   import { runScenario } from './_runner';
 *   const mods = import.meta.glob('./*.scenario.ts', { eager: true });
 *   for (const mod of Object.values(mods)) {
 *     const s = (mod as any).default;
 *     it(s.name, () => runScenario(s));
 *   }
 */
describe.todo('replay scenarios (blocked on P1 prerequisite refactors: renderer DI + fixed-dt step)');
