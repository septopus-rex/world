import { describe } from 'vitest';

/**
 * L2 — headless ECS system tick.
 *
 * The render-free systems (Physics, Trigger, Grid, Animation, Inventory,
 * ItemDrop) are unit-testable TODAY with no engine refactor: instantiate the
 * system, build a minimal fake world (helpers/fake-world.ts), feed components,
 * call system.update(world, FIXED_DT), assert component data.
 *
 * Marked `todo` until filled in. Worked example:
 *
 *   import { makeFakeWorld } from '../helpers/fake-world';
 *   import { PhysicsSystem } from '../../src/core/systems/PhysicsSystem';
 *   const world = makeFakeWorld();
 *   const id = world.spawn({
 *     TransformComponent: { position: [0, 10, 0] },
 *     RigidBodyComponent: { velocity: [0, 0, 0], useGravity: true },
 *   });
 *   const sys = new PhysicsSystem();
 *   for (let i = 0; i < 30; i++) sys.update(world as any, 1 / 60);
 *   expect(world.getComponent(id, 'TransformComponent').position[1]).toBeLessThan(10);
 *
 * NOTE: confirm each system's exact constructor + component names against the
 * source before asserting (they evolve during the JS->TS migration).
 */
describe.todo('PhysicsSystem — gravity integration over fixed ticks (fillable today)');
describe.todo('TriggerSystem — player enter/exit toggles trigger.entitiesInside (fillable today)');
