import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { consolidateSppRows, setSppConsolidation, isSppConsolidationEnabled } from '../../src/core/spp/Consolidator';
import { expandSpp, type ExpandedRow } from '../../src/core/spp/Expander';
import { AdjunctType } from '../../src/core/types/AdjunctType';

describe('SPP Post-Expansion Consolidator', () => {
    beforeEach(() => {
        setSppConsolidation(false);
    });

    afterEach(() => {
        setSppConsolidation(false);
    });

    it('merges two collinear adjacent A2 boxes along X and scales UV repeat proportionally', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 2, 0], [0, 0, 0], 0, [1, 1], null, 0, 36],
            ],
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [6, 2, 0], [0, 0, 0], 0, [1, 1], null, 0, 36],
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(1);

        const [typeId, raw] = consolidated[0];
        expect(typeId).toBe(AdjunctType.Box);
        expect(raw[0]).toEqual([8, 4, 0.1]); // size sx=8
        expect(raw[1]).toEqual([4, 2, 0]);   // center ox=4
        expect(raw[4]).toEqual([2, 1]);       // repeat rx=2, ry=1
        expect(raw[7]).toBe(36);              // texture preserved
    });

    it('merges two collinear adjacent A2 boxes along Y and scales UV repeat proportionally', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 2, 0], [0, 0, 0], 0, [1, 1], null, 0, 'path_stone'],
            ],
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 6, 0], [0, 0, 0], 0, [1, 1], null, 0, 'path_stone'],
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(1);

        const [typeId, raw] = consolidated[0];
        expect(typeId).toBe(AdjunctType.Box);
        expect(raw[0]).toEqual([4, 8, 0.1]); // size sy=8
        expect(raw[1]).toEqual([2, 4, 0]);   // center oy=4
        expect(raw[4]).toEqual([1, 2]);       // repeat rx=1, ry=2
        expect(raw[7]).toBe('path_stone');
    });

    it('merges two adjacent B4 Stop colliders into a single continuous AABB', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Stop,
                [[4, 0.3, 2.5], [2, 0, 1.25], [0, 0, 0], 1, null, 1, 1],
            ],
            [
                AdjunctType.Stop,
                [[4, 0.3, 2.5], [6, 0, 1.25], [0, 0, 0], 1, null, 1, 1],
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(1);

        const [typeId, raw] = consolidated[0];
        expect(typeId).toBe(AdjunctType.Stop);
        expect(raw[0]).toEqual([8, 0.3, 2.5]); // size sx=8
        expect(raw[1]).toEqual([4, 0, 1.25]);  // center ox=4
        expect(raw[3]).toBe(1);                // stopMode=1
        expect(raw[5]).toBe(1);                // stopShape=1 (box)
        expect(raw[6]).toBe(1);                // stopHidden=1
    });

    it('deduplicates identical overlapping boxes', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 2, 0], [0, 0, 0], 11, [1, 1], null, 0],
            ],
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 2, 0], [0, 0, 0], 11, [1, 1], null, 0],
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(1);
    });

    it('does NOT merge boxes with different textures or different colors', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 2, 0], [0, 0, 0], 0, [1, 1], null, 0, 101],
            ],
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [6, 2, 0], [0, 0, 0], 0, [1, 1], null, 0, 102], // different texture!
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(2);
    });

    it('does NOT merge animated boxes or rotated boxes', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [2, 2, 0], [0, 45, 0], 0, [1, 1], null, 0, 36], // rotated!
            ],
            [
                AdjunctType.Box,
                [[4, 4, 0.1], [6, 2, 0], [0, 45, 0], 0, [1, 1], null, 0, 36],
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(2);
    });

    it('leaves non-mergeable types (Model, Trigger) completely intact', () => {
        const rows: ExpandedRow[] = [
            [
                AdjunctType.Model,
                [[1, 1, 1], [0, 0, 0], [0, 0, 0], 110],
            ],
            [
                AdjunctType.Trigger,
                [[4, 4, 4], [2, 2, 2], [0, 0, 0], 1, 0, []],
            ],
        ];

        const consolidated = consolidateSppRows(rows);
        expect(consolidated).toHaveLength(2);
    });

    it('expandSpp default leaves rows unmerged (backward compatible), but consolidates when ctx.consolidate is true', () => {
        // 3 adjacent cells with solid walls
        const rawSpp: any = [
            [0, 0, 0],
            [
                { position: [0, 0, 0], level: 0, faces: [[1, 0], [0, 0], [1, 0], [1, 0], [1, 0], [0, 'empty']] },
                { position: [1, 0, 0], level: 0, faces: [[1, 0], [0, 0], [1, 0], [1, 0], [0, 'empty'], [0, 'empty']] },
                { position: [2, 0, 0], level: 0, faces: [[1, 0], [0, 0], [1, 0], [1, 0], [0, 'empty'], [1, 0]] },
            ],
            'basic',
        ];

        const rawRows = expandSpp(rawSpp);
        const consolidatedRows = expandSpp(rawSpp, { consolidate: true });

        // The 3 consecutive south walls and 3 consecutive north walls merge!
        expect(consolidatedRows.length).toBeLessThan(rawRows.length);
        expect(consolidatedRows.length).toBeGreaterThan(0);
    });

    it('global toggle setSppConsolidation controls expandSpp output', () => {
        const rawSpp: any = [
            [0, 0, 0],
            [
                { position: [0, 0, 0], level: 0, faces: [[1, 0], [0, 0], [1, 0], [1, 0], [1, 0], [0, 'empty']] },
                { position: [1, 0, 0], level: 0, faces: [[1, 0], [0, 0], [1, 0], [1, 0], [0, 'empty'], [1, 0]] },
            ],
            'basic',
        ];

        expect(isSppConsolidationEnabled()).toBe(false);
        const unmergedCount = expandSpp(rawSpp).length;

        setSppConsolidation(true);
        expect(isSppConsolidationEnabled()).toBe(true);
        const mergedCount = expandSpp(rawSpp).length;

        expect(mergedCount).toBeLessThan(unmergedCount);
    });
});
