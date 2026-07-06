import { describe, it, expect } from 'vitest';
import { CollapseCodec, CollapseHeader } from '../../src/core/protocol/CollapseCodec';
import { encodeSppL2, decodeSppL2 } from '../../src/core/spp/SppL2';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';

// Workstream E — L2 binary. CollapseCodec.encodePayload completes the byte
// codec (raw + RLE); SppL2 bridges resolved SPP cells ↔ L2 so a collapsed
// chunk stores compactly (CID) and re-expands identically. Spec §3.E.

describe('CollapseCodec.encodePayload (byte round-trip)', () => {
    const header = (encoding: number): CollapseHeader => ({
        cid: new Uint8Array(32).map((_, i) => i), cellCount: 0, encoding, flags: 0,
        originX: 5, originY: 10, originZ: 0, baseLevel: 0, layerId: 1,
    });
    const cells = [
        { collapseIndices: [0, 0, 0, 0, 0, 0] as any, triggerId: 0 },
        { collapseIndices: [0, 0, 0, 0, 0, 0] as any, triggerId: 0 },
        { collapseIndices: [0, 0, 0, 0, 0, 0] as any, triggerId: 0 },
        { collapseIndices: [1, 1, 1, 1, 1, 1] as any, triggerId: 99 },
        { collapseIndices: [1, 1, 1, 1, 1, 1] as any, triggerId: 99 },
    ];

    it('raw encoding round-trips through decodePayload', () => {
        const buf = CollapseCodec.encodePayload(header(0), cells);
        const { header: h, cells: out } = CollapseCodec.decodePayload(buf);
        expect(h.cellCount).toBe(5);
        expect(out).toHaveLength(5);
        expect(out[0].collapseIndices).toEqual([0, 0, 0, 0, 0, 0]);
        expect(out[4]).toEqual({ collapseIndices: [1, 1, 1, 1, 1, 1], triggerId: 99 });
    });

    it('RLE encoding coalesces runs and round-trips to the same 5 cells', () => {
        const buf = CollapseCodec.encodePayload(header(1), cells);
        // 3+2 identical runs → 2 segments = 44 + 2*(1+4) = 54 bytes.
        expect(buf.length).toBe(54);
        const { cells: out } = CollapseCodec.decodePayload(buf);
        expect(out).toHaveLength(5);
        for (let i = 0; i < 3; i++) expect(out[i].triggerId).toBe(0);
        for (let i = 3; i < 5; i++) expect(out[i]).toEqual({ collapseIndices: [1, 1, 1, 1, 1, 1], triggerId: 99 });
    });

    it('RLE splits runs longer than 63', () => {
        const many = Array.from({ length: 70 }, () => ({ collapseIndices: [1, 0, 0, 0, 0, 0] as any, triggerId: 0 }));
        const buf = CollapseCodec.encodePayload(header(1), many);
        const { cells: out } = CollapseCodec.decodePayload(buf);
        expect(out).toHaveLength(70); // 63 + 7, two segments, decoded back to 70
    });
});

describe('SppL2 bridge (resolved chunk ↔ L2 → identical expansion)', () => {
    // A resolved basic-theme chunk: a solid cell + a doorway/window cell w/ trigger.
    const chunk: SppCell[] = [
        { position: [0, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 1], [1, 2], [0, 0], [1, 0]] },
        { position: [1, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
          trigger: [{ type: 'in', actions: [{ type: 'flag', method: '', target: 'x', params: [true] }] }] },
    ];

    it('encodes to L2 and decodes back to faces that expand identically', () => {
        const buf = encodeSppL2(chunk, { origin: [2, 3, 0], encoding: 1 });
        const positions = chunk.map(c => c.position);
        const triggers = chunk.map(c => c.trigger);
        const { cells } = decodeSppL2(buf, positions, i => triggers[i]);

        // Face codes survived: solid/doorway/window/open map back exactly.
        expect(cells[0].faces).toEqual([[1, 0], [1, 0], [1, 1], [1, 2], [0, 0], [1, 0]]);

        // The decoded chunk expands to the SAME geometry as the original.
        const a = expandSpp([[2, 3, 0], chunk, 'basic']);
        const b = expandSpp([[2, 3, 0], cells, 'basic']);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });

    it('trigger presence survives the L2 flag (re-attached by the caller)', () => {
        const buf = encodeSppL2(chunk, { origin: [0, 0, 0] });
        const { cells } = decodeSppL2(buf, chunk.map(c => c.position), i => chunk[i].trigger);
        expect(cells[0].trigger).toBeUndefined();     // cell 0 had none
        expect(cells[1].trigger).toBeDefined();       // cell 1's trigger flag set
    });
});
