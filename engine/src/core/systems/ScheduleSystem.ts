import { World, ISystem } from '../World';

/**
 * ScheduleSystem — drives the world's Scheduler on simulation time (F1, spec
 * docs/plan/specs/scheduler-and-spawn.md §3.1).
 *
 * Registered right after LiveSystem — the "time input" slot: due tasks execute
 * at the top of the frame, so anything they mutate/spawn is visible to every
 * later system (triggers, physics, rendering) the SAME frame.
 */
export class ScheduleSystem implements ISystem {
    public update(world: World, dt: number): void {
        world.scheduler.tick(dt);
    }
}
