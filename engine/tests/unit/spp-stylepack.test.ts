import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';
import {
    getSppTheme, registerStylePack, listSppThemes, setStyleOverride, getStyleOverride, StylePack,
} from '../../src/core/spp/Variants';

// Workstream B + ② — StylePacks: the SAME cell matrix restyles by swapping the
// theme reference (colour + geometry), plus a world-level override, plus
// external (data-only) pack registration. Visual packs are CONTENT resolved at
// boot (not engine built-ins); these tests register them inline to exercise the
// mechanism. Spec: spp-protocol-full.md §3.B.

// Content packs (mirror client/desktop/src/stylepacks/*.json) registered inline.
const BRICK: StylePack = {
    format: 'septopus.spp.stylepack', version: 1, id: 'brick', thickness: 0.35, color: 0x9c5a3c,
    closed: [{ name: 'solid', pieces: [{ du: 0, dv: 0, su: 1, sv: 1 }] }],
    open: [{ name: 'empty', pieces: [] }],
};
const GARDEN: StylePack = {
    format: 'septopus.spp.stylepack', version: 1, id: 'garden', thickness: 0.12, color: 0x5f8a3a,
    closed: [{ name: 'lattice', pieces: [
        { du: 0.05, dv: 0, su: 0.15, sv: 1 }, { du: 0.425, dv: 0, su: 0.15, sv: 1 }, { du: 0.8, dv: 0, su: 0.15, sv: 1 },
    ] }],
    open: [{ name: 'empty', pieces: [] }],
};

beforeAll(() => { registerStylePack(BRICK); registerStylePack(GARDEN); });
afterEach(() => setStyleOverride(null)); // never leak the global override across tests

const solidCell = (): SppCell => ({
    position: [0, 0, 0], level: 0,
    faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]], // 6 solid faces
});
const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a1);
const wallColor = (row: any[]) => row[1][7];
const wallThickness = (row: any[]) => Math.min(...row[1][0]);

describe('SPP StylePacks (Workstream B + data separation ②)', () => {
    it('the engine ships only basic + coaster built-in; visual packs are content', () => {
        // basic (default) + coaster (structural) are built in; brick/garden are
        // registered here as CONTENT, not shipped by the engine.
        expect(getSppTheme('basic')).toBeDefined();
        expect(getSppTheme('coaster')).toBeDefined();
        // With brick/garden registered inline, listing includes them.
        expect(listSppThemes()).toEqual(expect.arrayContaining(['basic', 'coaster', 'brick', 'garden']));
    });

    it('the SAME cells recolour by swapping the theme ref (asset-free)', () => {
        const cells = [solidCell()];
        const basic = walls(expandSpp([[0, 0, 0], cells, 'basic']));
        const brick = walls(expandSpp([[0, 0, 0], cells, 'brick']));
        expect(basic).toHaveLength(6);
        expect(brick).toHaveLength(6);
        expect(wallColor(basic[0])).toBeUndefined();
        expect(wallColor(brick[0])).toBe(0x9c5a3c);
    });

    it('brick is thicker than basic — same cells, different slab depth', () => {
        const cells = [solidCell()];
        expect(wallThickness(walls(expandSpp([[0, 0, 0], cells, 'basic']))[0])).toBeCloseTo(0.2);
        expect(wallThickness(walls(expandSpp([[0, 0, 0], cells, 'brick']))[0])).toBeCloseTo(0.35);
    });

    it('garden changes GEOMETRY, not just colour — a lattice screen per face', () => {
        const cells = [solidCell()];
        expect(walls(expandSpp([[0, 0, 0], cells, 'basic']))).toHaveLength(6);   // 1 slab × 6 faces
        const garden = walls(expandSpp([[0, 0, 0], cells, 'garden']));
        expect(garden).toHaveLength(18);                                          // 3 slats × 6 faces
        expect(wallColor(garden[0])).toBe(0x5f8a3a);
    });

    it('world style override restyles every VISUAL source wholesale', () => {
        setStyleOverride('brick');
        expect(getStyleOverride()).toBe('brick');
        expect(wallColor(walls(expandSpp([[0, 0, 0], [solidCell()], 'basic']))[0])).toBe(0x9c5a3c);
    });

    it('override leaves STRUCTURAL themes (coaster) alone', () => {
        const trackCell: SppCell = {
            position: [0, 0, 0], level: 0,
            faces: [[0, 0], [0, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
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

    it('an UNRESOLVED theme (unknown CID) falls back to basic, not empty', () => {
        setStyleOverride(null);
        const rows = walls(expandSpp([[0, 0, 0], [solidCell()], 'bafyspp-not-registered']));
        expect(rows, 'unknown theme renders as basic (6 solid faces), not nothing').toHaveLength(6);
        expect(wallColor(rows[0]), 'basic has no baked colour').toBeUndefined();
    });
});
