import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    WorldMetrics, DEFAULT_METRICS,
    PROTOCOL_DEFAULT_RANGE, PROTOCOL_DEFAULT_BLOCK, PROTOCOL_DEFAULT_DIFF,
} from '../../src/core/utils/WorldMetrics';
import { addSink } from '../../src/core/errors';

/**
 * L1 — the world-geometry seam (world-schema-through, 2026-07-27).
 *
 * These pin the two properties the old `Coords.BLOCK_SIZE` static could not
 * have: geometry comes from the world DOCUMENT, and two worlds can hold
 * DIFFERENT geometry at the same time without touching each other.
 */

describe('WorldMetrics · defaults', () => {
    it('an empty document inherits the protocol defaults', () => {
        const m = new WorldMetrics();
        expect(m.range).toEqual(PROTOCOL_DEFAULT_RANGE);
        expect(m.block).toEqual(PROTOCOL_DEFAULT_BLOCK);
        expect(m.diff).toBe(PROTOCOL_DEFAULT_DIFF);
        expect(m.blockWidth).toBe(16);
        expect(m.blockLength).toBe(16);
        expect(m.blockHeight).toBe(16);
    });

    it('DEFAULT_METRICS is the protocol-default geometry (tooling with no world)', () => {
        expect(DEFAULT_METRICS.range).toEqual(PROTOCOL_DEFAULT_RANGE);
        expect(DEFAULT_METRICS.block).toEqual(PROTOCOL_DEFAULT_BLOCK);
    });
});

describe('WorldMetrics · conversions at the default geometry', () => {
    const m = DEFAULT_METRICS;

    it('septopusToEngine maps Alt(Z)->EngineY and North(+Y)->Engine -Z', () => {
        const [ex, ey, ez] = m.septopusToEngine([8, 8, 1], [1, 1]); // block [1,1] => zero offset
        expect(ex).toBe(8);  // East
        expect(ey).toBe(1);  // Alt -> Engine Y
        expect(ez).toBe(-8); // North -> -Z
    });

    it('septopusToEngine -> engineToSeptopus round-trips for in-block positions', () => {
        const block: [number, number] = [2048, 2048];
        const pos: [number, number, number] = [8, 8, 1];
        const back = m.engineToSeptopus(m.septopusToEngine(pos, block));
        expect(back.block).toEqual(block);
        expect(back.pos[0]).toBeCloseTo(pos[0]);
        expect(back.pos[1]).toBeCloseTo(pos[1]);
        expect(back.pos[2]).toBeCloseTo(pos[2]);
    });

    it('blockOrigin is the south-west corner; blockCentre is half a block in', () => {
        expect(m.blockOrigin(1, 1)).toEqual([0, 0, -0]);
        expect(m.blockCentre(1, 1)).toEqual([8, 0, -8]);
    });

    it('centreBlock is the grid centre', () => {
        expect(m.centreBlock()).toEqual([2048, 2048]);
    });

    it('containsBlock bounds the 1-based grid', () => {
        expect(m.containsBlock(1, 1)).toBe(true);
        expect(m.containsBlock(4096, 4096)).toBe(true);
        expect(m.containsBlock(0, 1)).toBe(false);
        expect(m.containsBlock(4097, 1)).toBe(false);
        expect(m.containsBlock(1.5, 1)).toBe(false);
    });
});

describe('WorldMetrics · a world with its OWN geometry', () => {
    // A 512×256 grid of 32m×8m×20m blocks — the case the old hardcoded
    // constants could not express at all.
    const m = new WorldMetrics({ range: [512, 256], block: [32, 8, 20], diff: 0.5 });

    it('each horizontal axis uses ITS OWN block extent', () => {
        // Block [3, 5]: east offset = 2×32 = 64, north offset = 4×8 = 32.
        const [ex, ey, ez] = m.septopusToEngine([1, 2, 3], [3, 5]);
        expect(ex).toBe(64 + 1);
        expect(ey).toBe(3);
        expect(ez).toBe(-(32 + 2));
    });

    it('round-trips through the non-square grid', () => {
        const block: [number, number] = [7, 11];
        const pos: [number, number, number] = [30.5, 7.25, 2];
        const back = m.engineToSeptopus(m.septopusToEngine(pos, block));
        expect(back.block).toEqual(block);
        expect(back.pos[0]).toBeCloseTo(pos[0]);
        expect(back.pos[1]).toBeCloseTo(pos[1]);
        expect(back.pos[2]).toBeCloseTo(pos[2]);
    });

    it('centre + bounds follow the declared range', () => {
        expect(m.centreBlock()).toEqual([256, 128]);
        expect(m.containsBlock(512, 256)).toBe(true);
        expect(m.containsBlock(513, 256)).toBe(false);
        expect(m.containsBlock(512, 257)).toBe(false);
    });

    it('does NOT disturb another metrics instance (the Coords.BLOCK_SIZE bug)', () => {
        // The whole point of dropping the class static: two live worlds, two
        // geometries, zero crosstalk — whichever was constructed last used to win.
        const other = new WorldMetrics({ block: [16, 16, 16] });
        expect(other.septopusToEngine([0, 0, 0], [3, 5])).toEqual([32, 0, -64]);
        expect(m.septopusToEngine([0, 0, 0], [3, 5])).toEqual([64, 0, -32]);
        expect(DEFAULT_METRICS.blockWidth).toBe(16);
    });
});

describe('WorldMetrics · hostile / corrupt documents fall back and report', () => {
    // Chain-served configuration is untrusted input: bad values must not
    // produce NaN coordinates or an allocation-sized grid.
    // The fallbacks are REPORTED (severity warn) — silence the console sink so
    // the expected warnings don't look like test failures in the output.
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { spy = vi.spyOn(console, 'warn').mockImplementation(() => { }); });
    afterEach(() => { spy.mockRestore(); });

    it.each([
        ['range not a pair', { range: [4096] as any }],
        ['range non-integer', { range: [4096.5, 4096] as any }],
        ['range zero', { range: [0, 4096] as any }],
        ['range absurd', { range: [1e9, 4096] as any }],
    ])('%s → protocol default range', (_label, init) => {
        expect(new WorldMetrics(init).range).toEqual(PROTOCOL_DEFAULT_RANGE);
    });

    it.each([
        ['block wrong arity', { block: [16, 16] as any }],
        ['block zero', { block: [0, 16, 16] as any }],
        ['block NaN', { block: [NaN, 16, 16] as any }],
        ['block absurd', { block: [1e6, 16, 16] as any }],
    ])('%s → protocol default block', (_label, init) => {
        expect(new WorldMetrics(init).block).toEqual(PROTOCOL_DEFAULT_BLOCK);
    });

    it('diff must be positive and no taller than the block', () => {
        expect(new WorldMetrics({ diff: 0 }).diff).toBe(PROTOCOL_DEFAULT_DIFF);
        expect(new WorldMetrics({ diff: -1 }).diff).toBe(PROTOCOL_DEFAULT_DIFF);
        expect(new WorldMetrics({ block: [16, 16, 16], diff: 20 }).diff).toBe(PROTOCOL_DEFAULT_DIFF);
        expect(new WorldMetrics({ diff: 0.25 }).diff).toBe(0.25);
    });

    it('a rejected value is REPORTED, not silently swallowed', () => {
        const seen: { tag: string; severity?: string; message: string }[] = [];
        const off = addSink({ report: (err, ctx) => seen.push({ tag: ctx.tag, severity: ctx.severity, message: err.message }) });
        try {
            new WorldMetrics({ range: [-1, -1] as any, block: [0, 0, 0] as any });
        } finally { off(); }
        expect(seen.map((s) => s.tag)).toEqual(['[WorldMetrics]', '[WorldMetrics]']);
        expect(seen.every((s) => s.severity === 'warn')).toBe(true);
        expect(seen[0].message).toMatch(/world\.range is invalid/);
        expect(seen[1].message).toMatch(/world\.block is invalid/);
    });
});

describe('no second source of truth for world geometry', () => {
    // The whole point of this change is that grid extent and block size are
    // read from the world document. A literal re-introduced anywhere else in
    // the engine quietly re-forks that answer, which is exactly the state this
    // replaced — so pin it: the grid extent appears in the DEFAULTS and
    // nowhere else in engine code.
    const SRC = path.resolve(__dirname, '../../src');
    const ALLOWED = new Set(['core/utils/WorldMetrics.ts', 'core/GlobalConfig.ts']);

    /** Source lines with comments stripped — prose may cite the numbers freely. */
    function codeLines(file: string): string[] {
        return fs.readFileSync(file, 'utf8').split('\n')
            .map((l) => l.replace(/\/\/.*$/, ''))
            .filter((l) => !/^\s*(\/\*|\*)/.test(l));
    }

    function walk(dir: string, out: string[] = []): string[] {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p, out);
            else if (e.name.endsWith('.ts')) out.push(p);
        }
        return out;
    }

    it('the 4096 grid extent is not hardcoded outside the protocol defaults', () => {
        const offenders: string[] = [];
        for (const file of walk(SRC)) {
            const rel = path.relative(SRC, file);
            if (ALLOWED.has(rel)) continue;
            codeLines(file).forEach((line, i) => {
                if (/\b4096\b/.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('Coords carries no block-size state (it is stateless axis maths)', () => {
        const coords = fs.readFileSync(path.join(SRC, 'core/utils/Coords.ts'), 'utf8');
        const code = coords.split('\n').map((l) => l.replace(/\/\/.*$/, ''))
            .filter((l) => !/^\s*(\/\*|\*)/.test(l)).join('\n');
        expect(code).not.toMatch(/BLOCK_SIZE/);
        // The block-offset conversions belong to WorldMetrics, not here.
        expect(code).not.toMatch(/septopusBlock/);
    });
});

describe('WorldMetrics.from', () => {
    it('reads the world document section and ignores unrelated fields', () => {
        const m = WorldMetrics.from({
            nickname: 'Genesis', index: 0, containerId: 'x',
            range: [64, 64], block: [8, 8, 8], diff: 0.05,
        });
        expect(m.range).toEqual([64, 64]);
        expect(m.block).toEqual([8, 8, 8]);
        expect(m.diff).toBe(0.05);
    });

    it('a document declaring no geometry gets the protocol defaults', () => {
        const m = WorldMetrics.from({ nickname: 'Bare' });
        expect(m.range).toEqual(PROTOCOL_DEFAULT_RANGE);
        expect(m.block).toEqual(PROTOCOL_DEFAULT_BLOCK);
    });
});
