import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { BlockSystem } from '../../src/core/systems/BlockSystem';
import { EditSystem } from '../../src/core/systems/EditSystem';
import { SystemMode } from '../../src/core/types/SystemMode';
import { Coords } from '../../src/core/utils/Coords';

// Gizmo-driven translation: the render-layer TransformControls wrapper feeds
// EditSystem.onGizmoChange (live position, snapped+clamped by CORE) and
// onGizmoDragState (drag brackets; release commits ONE undoable 'set' task).
// Headless: we drive those two callbacks directly — the render layer is just
// the hand, this is the authority chain the e2e drag exercises end-to-end.
//
// This also pins the fix for the legacy gap where plane-drag moves never wrote
// back to stdData (not undoable, not persisted) and executeSet's transform
// write-back dropped the block offset + elevation (any block but (1,1)).

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

const BX = 2048, BY = 2048, ELEV = 2;
// Engine-absolute position of the block's septopus origin corner.
const bWorld = Coords.septopusToEngine([0, 0, 0], [BX, BY]);

async function setup() {
    const { engine } = await makeHeadlessEngineWith({ api: api() });
    const world = engine.getWorld()!;
    engine.injectBlock({ x: BX, y: BY, world: 'main', elevation: ELEV, adjuncts: [ELEV, 1, [], []] });
    stepN(engine, 5);
    const blockEid = world.queryEntities('BlockComponent')[0];
    const bs = world.systems.findSystem(BlockSystem)!;
    const edit = world.systems.findSystem(EditSystem)! as any;

    // Box at block-relative [8, 8, 1] (raw altitudes exclude elevation).
    const boxEid = bs.spawnAdjunct(world, blockEid, 0x00a2, [[1, 1, 1], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0])!;
    engine.setMode(SystemMode.Edit);
    edit.activeBlockId = blockEid;
    edit.selectedEntityId = boxEid;
    stepN(engine, 2);
    return { engine, world, edit, boxEid };
}

describe('edit-mode gizmo translation', () => {
    it('snaps + clamps live drags, commits an undoable persisted set on release', async () => {
        const { engine, world, edit, boxEid } = await setup();
        const std = () => world.getComponent<any>(boxEid, 'AdjunctComponent').stdData;
        const trans = world.getComponent<any>(boxEid, 'TransformComponent');
        expect(trans.position[0]).toBeCloseTo(bWorld[0] + 8, 5);
        expect(trans.position[1]).toBeCloseTo(ELEV + 1, 5);   // elevation + oz

        // ── grab ─────────────────────────────────────────────────────────────
        edit.onGizmoDragState(world, true);
        expect(world.isMovingObject).toBe(true);              // camera gated

        // Live drag: raw position snaps to the 0.5 m grid (absolute coords).
        const out = edit.onGizmoChange(world, [bWorld[0] + 9.13, ELEV + 1.62, bWorld[2] - 8]);
        expect(out).toEqual([bWorld[0] + 9, ELEV + 1.5, bWorld[2] - 8]);
        expect(trans.position[0]).toBeCloseTo(bWorld[0] + 9, 5);
        expect(trans.dirty).toBe(true);

        // Dragging outside the block clamps to its bounds.
        const clamped = edit.onGizmoChange(world, [bWorld[0] + 40, ELEV - 5, bWorld[2] - 8]);
        expect(clamped![0]).toBeCloseTo(bWorld[0] + 16, 5);
        expect(clamped![1]).toBeCloseTo(ELEV, 5);

        // Back inside, settle at +10 East / alt 1.5.
        edit.onGizmoChange(world, [bWorld[0] + 10, ELEV + 1.5, bWorld[2] - 8]);
        expect(std().ox).toBe(8);                             // not yet committed

        // ── release: ONE 'set' lands in stdData (block-relative, minus elevation)
        edit.onGizmoDragState(world, false);
        expect(world.isMovingObject).toBe(false);
        expect(std().ox).toBeCloseTo(10, 5);
        expect(std().oy).toBeCloseTo(8, 5);
        expect(std().oz).toBeCloseTo(1.5, 5);                 // 3.5 abs − 2 elevation
        expect(edit.history.undoCount).toBe(1);

        // executeSet re-derived the transform WITH block offset + elevation.
        const trans2 = world.getComponent<any>(boxEid, 'TransformComponent');
        expect(trans2.position[0]).toBeCloseTo(bWorld[0] + 10, 5);
        expect(trans2.position[1]).toBeCloseTo(ELEV + 1.5, 5);
        expect(trans2.position[2]).toBeCloseTo(bWorld[2] - 8, 5);
        expect(trans2.dirty).toBe(true);                      // VisualSync will reposition the rebuilt mesh

        // ── undo restores BOTH stdData and the world transform ───────────────
        const ip = (world.systems.findSystemByName('CharacterController') as any).inputProvider;
        const keys: Set<string> = ip.keys;
        edit.selectedEntityId = boxEid;
        keys.add('ControlLeft'); keys.add('KeyZ');
        engine.step(1 / 60);
        keys.delete('KeyZ'); keys.delete('ControlLeft');
        expect(std().ox).toBe(8);
        const trans3 = world.getComponent<any>(boxEid, 'TransformComponent');
        expect(trans3.position[0]).toBeCloseTo(bWorld[0] + 8, 5);
        expect(trans3.position[1]).toBeCloseTo(ELEV + 1, 5);
    });

    it('release without displacement pushes nothing onto the history', async () => {
        const { world, edit } = await setup();
        edit.onGizmoDragState(world, true);
        edit.onGizmoDragState(world, false);                  // grabbed, never moved
        expect(edit.history.undoCount).toBe(0);
    });

    it('a quick click on an arrow (grab+release, no drag) does not fall through to deselect', async () => {
        const { engine, world, edit, boxEid } = await setup();
        // DOM-level: pointerdown grabs the axis, pointerup releases — both land
        // BEFORE the next engine step, so isGizmoBusy() is already false when the
        // interact events from that click get consumed. The latch must suppress.
        edit.onGizmoDragState(world, true);
        edit.onGizmoDragState(world, false);
        world.events.emit('interact.miss', {});
        engine.step(1 / 60);
        expect(edit.selectedEntityId).toBe(boxEid);   // still selected

        // Control: the SAME miss without a preceding grab does deselect.
        world.events.emit('interact.miss', {});
        engine.step(1 / 60);
        expect(edit.selectedEntityId).toBeNull();
    });

    it('undoing an add clears the dangling selection (no lingering gizmo/UI)', async () => {
        const { engine, world, edit } = await setup();
        // Simulate a palette placement: an 'add' task pushed onto the history.
        const task: any = {
            entityId: -1, adjunct: '', action: 'add',
            param: { typeId: 0x00a2, blockEntityId: edit.activeBlockId, raw: [[1, 1, 1], [4, 4, 0], [0, 0, 0], 0, [1, 1], 0, 0] },
        };
        const result = edit.executor.execute(world, task);
        expect(result.success).toBe(true);
        edit.history.push({ task, snapshot: result.snapshot });
        edit.selectedEntityId = task.entityId;          // placement auto-selects

        const ip = (world.systems.findSystemByName('CharacterController') as any).inputProvider;
        const keys: Set<string> = ip.keys;
        keys.add('ControlLeft'); keys.add('KeyZ');
        engine.step(1 / 60);                            // Ctrl+Z → undo add = delete entity
        keys.delete('KeyZ'); keys.delete('ControlLeft');

        expect(world.getComponent(task.entityId, 'AdjunctComponent')).toBeUndefined();
        expect(edit.selectedEntityId).toBeNull();       // selection no longer dangles
    });

    it('snap toggle off = free positions (still block-clamped)', async () => {
        const { world, edit, boxEid } = await setup();
        edit.snapEnabled = false;
        edit.onGizmoDragState(world, true);
        const out = edit.onGizmoChange(world, [bWorld[0] + 9.13, ELEV + 1.62, bWorld[2] - 7.77]);
        expect(out![0]).toBeCloseTo(bWorld[0] + 9.13, 5);     // no grid rounding
        edit.onGizmoDragState(world, false);
        const std = world.getComponent<any>(boxEid, 'AdjunctComponent').stdData;
        expect(std.ox).toBeCloseTo(9.13, 3);
    });
});
