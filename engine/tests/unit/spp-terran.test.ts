import { describe, it, expect, beforeAll } from 'vitest';
import { expandSpp } from '../../src/core/spp/Expander';
import { registerStylePack, getSppTheme, type StylePack } from '../../src/core/spp/Variants';
import terranPack from '../../../client/core/src/stylepacks/terran.stylepack.json';
import galleryLevel from '../../../client/core/src/levels/gallery.level.json';

// The terran StylePack (client content, SC1 human-residence style) — the first
// pack to exercise the `parts` composition path for TEXTURED walls: every face
// variant emits a2 boxes whose raw slot 7 carries a texture id (36 armored wall
// / 37 deck-plating roof+floor / 38 hazard stripe), because a1 walls have no
// texture slot (texture.md §8). This pins the data-level contract the gallery
// residence and the e2e depend on: right rows, right textures, door stays
// passable, deterministic.

const A2 = 0x00a2;
const TEX_WALL = 36, TEX_ROOF = 37, TEX_ACCENT = 38;

const boxes = (rows: any[]) => rows.filter((r) => r[0] === A2).map((r) => r[1]);
const tex = (raw: any[]) => raw[7];

/** AABB of an emitted row (pos = center) vs a probe box, all SPP meters. */
function intersects(raw: any[], min: number[], max: number[]): boolean {
    const [size, pos] = raw;
    for (let a = 0; a < 3; a++) {
        if (pos[a] + size[a] / 2 <= min[a] || pos[a] - size[a] / 2 >= max[a]) return false;
    }
    return true;
}

const cell = (faces: any[]) => ({ position: [0, 0, 0], level: 0, faces });
const S = [1, 'solid'] as any;

beforeAll(() => {
    expect(registerStylePack(terranPack as unknown as StylePack)).toBe('terran');
});

describe('terran StylePack:parts 路径产出贴图 a2 墙体', () => {
    it('全实心格 → 六面 a2 装甲板(贴图36,stop=1,厚0.3)', () => {
        const rows = expandSpp([[0, 0, 0], [cell([S, S, S, S, S, S])], 'terran']);
        const b = boxes(rows);
        expect(b.length).toBe(6);
        for (const raw of b) {
            expect(tex(raw)).toBe(TEX_WALL);
            expect(raw[6], 'stop=1: derived walls collide').toBe(1);
            expect(Math.min(...raw[0])).toBeCloseTo(0.3);
        }
        expect(rows.some((r) => r[0] !== A2)).toBe(false);
    });

    it('roof/deck 变体 → 顶/底换甲板贴图(37),墙面仍是 36', () => {
        const rows = expandSpp([[0, 0, 0],
            [cell([[1, 'roof'], [1, 'deck'], S, S, S, S])], 'terran']);
        const b = boxes(rows);
        expect(b.length).toBe(6);
        const roof = b.find((r) => r[1][2] > 3.5)!;   // top slab center z ≈ 3.85
        const deck = b.find((r) => r[1][2] < 0.5)!;   // floor slab center z ≈ 0.15
        expect(tex(roof)).toBe(TEX_ROOF);
        expect(tex(deck)).toBe(TEX_ROOF);
        expect(b.filter((r) => tex(r) === TEX_WALL).length).toBe(4);
    });

    it('doorway → 门楣警示条(38) + 门洞中段无几何(可走进)', () => {
        const rows = expandSpp([[0, 0, 0],
            [cell([[0, 0], [0, 0], [1, 'doorway'], [0, 0], [0, 0], [0, 0]])], 'terran']);
        const b = boxes(rows);
        expect(b.length, '两侧门柱 + 门楣 + 警示条').toBe(4);
        expect(b.filter((r) => tex(r) === TEX_ACCENT).length).toBe(1);
        // Door opening: face-u 0.3..0.7 of the 4m south face → x 1.2..2.8,
        // clear up to v=0.68 → z 0..2.72. Probe the walk-through volume.
        const probeMin = [1.4, -0.1, 0.2], probeMax = [2.6, 0.4, 2.5];
        expect(b.some((r) => intersects(r, probeMin, probeMax)),
            'nothing blocks the doorway volume').toBe(false);
    });

    it('画廊⑫人族住宅:南门可进、双贴图屋顶、确定性', () => {
        const block = (galleryLevel as any).blocks.find((b: any) => b.y === 1011);
        const sppRows = block.raw[2].find((g: any) => g[0] === 0x00b6)[1];
        const residence = sppRows.find((r: any) => r[2] === 'terran');
        expect(residence, 'terran residence row authored in block 1011').toBeTruthy();

        const rows = expandSpp(residence, { blockX: 2000, blockY: 1011 });
        const b = boxes(rows);
        expect(b.length).toBeGreaterThan(20);
        expect(b.every((r) => [TEX_WALL, TEX_ROOF, TEX_ACCENT].includes(tex(r)))).toBe(true);
        expect(b.filter((r) => tex(r) === TEX_ROOF).length, 'roof + deck plates').toBeGreaterThanOrEqual(4);
        expect(b.filter((r) => tex(r) === TEX_ACCENT).length, 'hazard headers').toBeGreaterThanOrEqual(1);

        // South door of room A: origin [1.2,11.5,0], opening x 2.4..4.0 z 0..2.72.
        // Probe above the 0.3m deck, below the header — must be walk-through clear.
        const probeMin = [2.6, 11.3, 0.45], probeMax = [3.8, 12.0, 2.4];
        expect(b.some((r) => intersects(r, probeMin, probeMax)),
            'the residence door is enterable').toBe(false);

        const again = expandSpp(residence, { blockX: 2000, blockY: 1011 });
        expect(JSON.stringify(again)).toBe(JSON.stringify(rows));
    });

    it('注册后主题可查,变体含 roof/deck 扩展键', () => {
        const theme = getSppTheme('terran')!;
        expect(theme.thickness).toBeCloseTo(0.3);
        const keys = theme.closed.map((v: any) => v.key ?? v.name);
        expect(keys).toEqual(['solid', 'doorway', 'window', 'roof', 'deck']);
    });
});
