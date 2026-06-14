import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { BlockSystem } from '../../src/core/systems/BlockSystem';
import { EditSystem } from '../../src/core/systems/EditSystem';
import { SystemMode } from '../../src/core/types/SystemMode';

// G4-4: the rotate/scale "gizmo" — keyboard transform of the selected object in
// Edit mode ( [ / ] yaw, - / = uniform scale ), each an undoable 'set'. Plane-
// drag already handles translation.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

describe('edit-mode keyboard transform (G4-4)', () => {
    it('[ / ] rotate yaw and - / = scale the selected object, undoably', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [], []] });
        stepN(engine, 5);
        const blockEid = world.queryEntities('BlockComponent')[0];
        const bs = world.systems.findSystem(BlockSystem)!;
        const edit = world.systems.findSystem(EditSystem)! as any;
        const ip = (world.systems.findSystemByName('CharacterController') as any).inputProvider;

        const boxEid = bs.spawnAdjunct(world, blockEid, 0x00a2, [[1, 1, 1], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0])!;
        const std = () => world.getComponent<any>(boxEid, 'AdjunctComponent').stdData;

        engine.setMode(SystemMode.Edit);
        edit.activeBlockId = blockEid;
        const keys: Set<string> = (ip as any).keys;

        // Edge-detected against the held-key set: add (press), step, delete (release).
        const press = (code: string) => {
            edit.selectedEntityId = boxEid;       // keep it selected
            keys.add(code);
            engine.step(1 / 60);
            keys.delete(code);
        };

        press('BracketRight');                    // yaw +15°
        expect(std().ry).toBeCloseTo(Math.PI / 12, 3);
        const trans = world.getComponent<any>(boxEid, 'TransformComponent');
        expect(trans.rotation[1]).toBeCloseTo(Math.PI / 12, 3); // transform synced

        press('Equal');                           // scale ×1.1
        expect(std().x).toBeCloseTo(1.1, 3);
        expect(std().z).toBeCloseTo(1.1, 3);

        press('BracketLeft');                     // yaw back to 0
        expect(std().ry).toBeCloseTo(0, 3);

        // Each nudge pushed an undoable history entry.
        expect((edit.history as any).undoCount).toBeGreaterThanOrEqual(3);

        // Ctrl+Z now actually fires (edge-detected) and reverts the last nudge
        // (the BracketLeft yaw → back to +15°).
        edit.selectedEntityId = boxEid;
        keys.add('ControlLeft');
        keys.add('KeyZ');                         // edge: not held last frame
        engine.step(1 / 60);
        keys.delete('KeyZ');
        keys.delete('ControlLeft');
        expect(std().ry).toBeCloseTo(Math.PI / 12, 3); // last yaw undone
    });
});
