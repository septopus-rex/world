import { describe, it, expect, afterEach } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';
import {
    getSppTheme, registerStylePack, listSppThemes, setStyleOverride, getStyleOverride,
} from '../../src/core/spp/Variants';

// Workstream B — StylePacks: the SAME cell matrix restyles by swapping the
// theme reference (colour + geometry), plus a world-level override, plus
// external (data-only) pack registration. Spec: spp-protocol-full.md §3.B.

const solidCell = (): SppCell => ({
    position: [0, 0, 0], level: 0,
    faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]], // 6 solid faces
});
const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a1);
/** a1 wall raw: [size, pos, rot, resource, repeat, anim, stop, color?]. */
const wallColor = (row: any[]) => row[1][7];
const wallThickness = (row: any[]) => Math.min(...row[1][0]); // slab thickness = smallest dim

afterEach(() => setStyleOverride(null)); // never leak the global override across tests

describe('SPP StylePacks (Workstream B)', () => {
    it('ships built-in bundled packs (basic/brick/garden/coaster)', () => {
        const ids = listSppThemes();
        expect(ids).toEqual(expect.arrayContaining(['basic', 'brick', 'garden', 'coaster']));
    });

    it('the SAME cells recolour by swapping the theme ref (asset-free)', () => {
        const cells = [solidCell()];
        const basic = walls(expandSpp([[0, 0, 0], cells, 'basic']));
        const brick = walls(expandSpp([[0, 0, 0], cells, 'brick']));

        // Same geometry footprint (brick reuses basic's variants) …
        expect(basic).toHaveLength(6);
        expect(brick).toHaveLength(6);
        // … but brick bakes an explicit wall colour into slot 7; basic has none.
        expect(wallColor(basic[0])).toBeUndefined();
        expect(wallColor(brick[0])).toBe(0x9c5a3c);
    });

    it('brick is thicker than basic — same cells, different slab depth', () => {
        const cells = [solidCell()];
        const basic = walls(expandSpp([[0, 0, 0], cells, 'basic']));
        const brick = walls(expandSpp([[0, 0, 0], cells, 'brick']));
        expect(wallThickness(basic[0])).toBeCloseTo(0.2);
        expect(wallThickness(brick[0])).toBeCloseTo(0.35);
    });

    it('garden changes GEOMETRY, not just colour — a lattice screen per face', () => {
        const cells = [solidCell()];
        const basic = walls(expandSpp([[0, 0, 0], cells, 'basic'])); // 1 slab × 6 faces
        const garden = walls(expandSpp([[0, 0, 0], cells, 'garden'])); // 3 slats × 6 faces
        expect(basic).toHaveLength(6);
        expect(garden).toHaveLength(18);
        expect(wallColor(garden[0])).toBe(0x5f8a3a);
    });

    it('world style override restyles every VISUAL source wholesale', () => {
        const cells = [solidCell()];
        setStyleOverride('brick');
        expect(getStyleOverride()).toBe('brick');
        // A source authored as 'basic' now expands as brick.
        const overridden = walls(expandSpp([[0, 0, 0], cells, 'basic']));
        expect(wallColor(overridden[0])).toBe(0x9c5a3c);
    });

    it('override leaves STRUCTURAL themes (coaster) alone', () => {
        // A coaster cell (2 open faces) with a brick override still collapses to a
        // c1 track piece, NOT brick walls.
        const trackCell: SppCell = {
            position: [0, 0, 0], level: 0,
            faces: [[0, 0], [0, 0], [1, 0], [1, 0], [1, 0], [1, 0]], // top+bottom open
        };
        setStyleOverride('brick');
        const rows = expandSpp([[0, 0, 0], [trackCell], 'coaster']);
        expect(rows.every(r => r[0] === 0x00c1)).toBe(true);
        expect(walls(rows)).toHaveLength(0);
    });

    it('registers an EXTERNAL data-only StylePack, usable by id', () => {
        const id = registerStylePack({
            format: 'septopus.spp.stylepack', version: 1, id: 'neon',
            thickness: 0.1, color: 0x00ffcc,
            closed: [{ name: 'solid', pieces: [{ du: 0, dv: 0, su: 1, sv: 1 }] }],
            open: [{ name: 'empty', pieces: [] }],
        });
        expect(id).toBe('neon');
        expect(getSppTheme('neon')?.color).toBe(0x00ffcc);
        const w = walls(expandSpp([[0, 0, 0], [solidCell()], 'neon']));
        expect(wallColor(w[0])).toBe(0x00ffcc);
        expect(wallThickness(w[0])).toBeCloseTo(0.1);
    });

    it('rejects malformed StylePacks (never throws)', () => {
        expect(registerStylePack({ id: 'bad' } as any)).toBeNull();
        expect(registerStylePack(null as any)).toBeNull();
    });

    it('unset override + unknown theme still degrade to nothing, no throw', () => {
        setStyleOverride(null);
        expect(expandSpp([[0, 0, 0], [solidCell()], 'does-not-exist'])).toEqual([]);
    });
});
