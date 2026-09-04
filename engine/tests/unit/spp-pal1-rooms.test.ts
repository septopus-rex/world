import { describe, it, expect, beforeAll } from 'vitest';
import { expandSpp } from '../../src/core/spp/Expander';
import { registerStylePack, type StylePack } from '../../src/core/spp/Variants';
import pal1Pack from '../../../client/core/src/stylepacks/pal1_inn.stylepack.json';

beforeAll(() => {
    registerStylePack(pal1Pack as unknown as StylePack);
});

describe('pal1_inn StylePack: 3 rooms connected by corridor', () => {
    it('expands 3 rooms + corridor and analyzes generated adjuncts', () => {
        // Layout:
        // Corridor: (0,0,0), (1,0,0), (2,0,0)
        // Room 1: (0,1,0)
        // Room 2: (1,1,0)
        // Room 3: (2,1,0)
        // Order of faces: [Top, Bottom, Front(Y-), Back(Y+), Left(X-), Right(X+)]
        // FaceState: 0=Open, 1=Closed
        const cells: any[] = [
            // Corridor Cell 0: (0, 0, 0)
            {
                position: [0, 0, 0], level: 0,
                faces: [
                    [1, 'roof_front_west'],   // Top (front roof with west bargeboard)
                    [1, 'wood_floor'],        // Bottom (corridor wood floor)
                    [1, 'gallery_railing'],   // Front (South, open to outside with railing)
                    [1, 'guest_door'],        // Back (North, entrance to Room 1)
                    [1, 'solid'],             // Left (West, outer end)
                    [0, 'empty'],             // Right (East, corridor continues)
                ]
            },
            // Corridor Cell 1: (1, 0, 0)
            {
                position: [1, 0, 0], level: 0,
                faces: [
                    [1, 'roof_front'],        // Top (front roof continuous)
                    [1, 'wood_floor'],        // Bottom
                    [1, 'gallery_railing'],   // Front (South)
                    [1, 'guest_door'],        // Back (North, entrance to Room 2)
                    [0, 'empty'],             // Left (connected to Cell 0)
                    [0, 'empty'],             // Right (connected to Cell 2)
                ]
            },
            // Corridor Cell 2: (2, 0, 0)
            {
                position: [2, 0, 0], level: 0,
                faces: [
                    [1, 'roof_front_east'],   // Top (front roof with east bargeboard)
                    [1, 'wood_floor'],        // Bottom
                    [1, 'gallery_railing'],   // Front (South)
                    [1, 'guest_door'],        // Back (North, entrance to Room 3)
                    [0, 'empty'],             // Left (connected to Cell 1)
                    [1, 'solid'],             // Right (East, outer end)
                ]
            },
            // Room 1: (0, 1, 0)
            {
                position: [0, 1, 0], level: 0,
                faces: [
                    [1, 'roof_back_west'],    // Top (back roof with west bargeboard & Chiwen)
                    [1, 'floor'],            // Bottom
                    [0, 'empty'],             // Front (shared with Corridor 0 Back - negative face skipped or guest_door owns)
                    [1, 'lattice_window'],    // Back (North, window)
                    [1, 'solid'],             // Left (West, solid gable wall)
                    [1, 'solid'],             // Right (East, dividing wall with Room 2)
                ]
            },
            // Room 2: (1, 1, 0)
            {
                position: [1, 1, 0], level: 0,
                faces: [
                    [1, 'roof_back'],         // Top (back roof continuous)
                    [1, 'floor'],            // Bottom
                    [0, 'empty'],             // Front (shared with Corridor 1 Back)
                    [1, 'lattice_window'],    // Back (North, window)
                    [0, 'empty'],             // Left (shared with Room 1 Right)
                    [1, 'solid'],             // Right (East, dividing wall with Room 3)
                ]
            },
            // Room 3: (2, 1, 0)
            {
                position: [2, 1, 0], level: 0,
                faces: [
                    [1, 'roof_back_east'],    // Top (back roof with east bargeboard & Chiwen)
                    [1, 'floor'],            // Bottom
                    [0, 'empty'],             // Front (shared with Corridor 2 Back)
                    [1, 'lattice_window'],    // Back (North, window)
                    [0, 'empty'],             // Left (shared with Room 2 Right)
                    [1, 'solid'],             // Right (East, solid gable wall)
                ]
            },
        ];

        const rows = expandSpp([[0, 0, 0], cells, 'pal1_inn']);
        console.log('Total expanded rows:', rows.length);
        const byType: Record<number, number> = {};
        for (const r of rows) {
            byType[r[0]] = (byType[r[0]] ?? 0) + 1;
        }
        console.log('Rows by type:', byType);

        // Inspect 164 (modules)
        const modules = rows.filter(r => r[0] === 164);
        console.log('Modules count:', modules.length);
        for (const m of modules) {
            console.log('Module:', {
                size: m[1][0],
                pos: m[1][1],
                rot: m[1][2],
                id: m[1][3],
            });
        }

        // Inspect 162 (boxes)
        const boxes = rows.filter(r => r[0] === 162);
        console.log('Boxes count:', boxes.length);
        for (const b of boxes.slice(0, 5)) {
            console.log('Box sample:', {
                size: b[1][0],
                pos: b[1][1],
                tex: b[1][7],
            });
        }
    });
});
