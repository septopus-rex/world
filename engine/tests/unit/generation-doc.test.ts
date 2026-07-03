import { describe, it, expect } from 'vitest';
import { validateGenerationDoc, compileGenerationDoc, GEN_LIMITS } from '../../src/core/protocol/GenerationDoc';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// GenerationDoc v0 — the AI-gateway ↔ client shared contract. Error codes are
// STABLE (the gateway feeds them to the LLM retry loop) — pin them here.

const village = () => ({
    version: 0 as const,
    target: { block: [2048, 2050] as [number, number] },
    seed: 99,
    summary: '两栋房子和一条路',
    pieces: [
        { kind: 'generator' as const, name: 'house', origin: [4, 10, 0] as [number, number, number], params: { door: 'S' } },
        { kind: 'generator' as const, name: 'house', origin: [12, 10, 0] as [number, number, number], params: { door: 'S' } },
        { kind: 'generator' as const, name: 'road', origin: [8, 8, 0] as [number, number, number], params: { points: [[-6, 0], [6, 0]] } },
        { kind: 'adjunct' as const, typeId: AdjunctType.Light, raw: [0, [8, 8, 5], [0, 0, 0], 0xffaa44, 2, 20, 0, 0] },
    ],
});

describe('GenerationDoc · validate', () => {
    it('a well-formed village doc validates clean', () => {
        expect(validateGenerationDoc(village())).toEqual([]);
    });

    it('rejects unknown generators, off-whitelist typeIds, bad origins', () => {
        const doc: any = village();
        doc.pieces.push({ kind: 'generator', name: 'castle', origin: [4, 4, 0] });
        doc.pieces.push({ kind: 'adjunct', typeId: AdjunctType.Module, raw: [[1, 1, 1], [8, 8, 1], [0, 0, 0], 27, 0, 0] });
        doc.pieces.push({ kind: 'generator', name: 'house', origin: [99, 4, 0] });
        const codes = validateGenerationDoc(doc).map((e) => e.code);
        expect(codes).toContain('gen.name');
        expect(codes).toContain('adj.typeId');
        expect(codes).toContain('gen.origin');
    });

    it('rejects piece floods and bad envelopes', () => {
        const doc: any = village();
        doc.pieces = Array.from({ length: GEN_LIMITS.maxPieces + 1 }, () => doc.pieces[0]);
        expect(validateGenerationDoc(doc).map((e) => e.code)).toContain('pieces.count');
        expect(validateGenerationDoc({ version: 1 }).map((e) => e.code)).toContain('version');
        expect(validateGenerationDoc({ version: 0, target: { block: [0, 5000] }, seed: 1, pieces: [] })
            .map((e) => e.code)).toEqual(expect.arrayContaining(['target', 'pieces.count']));
    });
});

describe('GenerationDoc · compile', () => {
    it('generators become c2 motif rows; groups sort by typeId; per-piece seeds derive from doc.seed', () => {
        const raw = compileGenerationDoc(village() as any);
        expect(raw[0]).toBe(0);
        expect(raw[1]).toBe(1);
        expect(raw[4]).toBe(0);
        const groups: any[] = raw[2];
        expect(groups.map((g) => g[0])).toEqual([AdjunctType.Light, AdjunctType.Motif]); // ascending
        const motifRows = groups.find((g) => g[0] === AdjunctType.Motif)![1];
        expect(motifRows).toHaveLength(3);
        expect(motifRows[0]).toEqual([[4, 10, 0], 'house', 99, { door: 'S' }]);   // seed + 0
        expect(motifRows[2][2]).toBe(101);                                          // seed + 2
    });
});
