import { describe, it, expect } from 'vitest';
import { CollapseCodec, CollapseHeader } from '../../src/core/protocol/CollapseCodec';

// L1 — pure unit. The SPP binary codec is the highest regression value: a wrong
// nibble shift / endian / RLE length silently corrupts every block.

// Canonical 54-byte SPP "corridor" fixture (ported from the old test_codec.ts demo):
// 3 solid-wall cells (variant 0, no trigger) + 2 archway cells (variant 1, trigger 99), RLE-encoded.
function buildCorridorFixture(): Uint8Array {
  const cid = new Uint8Array(32);
  for (let i = 0; i < 32; i++) cid[i] = i;
  const header: CollapseHeader = {
    cid, cellCount: 5, encoding: 1, flags: 0,
    originX: 5, originY: 10, originZ: 0, baseLevel: 0, layerId: 1,
  };
  const buf = new Uint8Array(44 + 5 + 5); // 44 header + two RLE segments (1 RLE byte + 4 cell bytes)
  CollapseCodec.encodeHeader(header, buf, 0);
  buf[44] = 0x03; // RLE run length 3
  CollapseCodec.encodeCell([0, 0, 0, 0, 0, 0], 0, buf, 45);
  buf[49] = 0x02; // RLE run length 2
  CollapseCodec.encodeCell([1, 1, 1, 1, 1, 1], 99, buf, 50);
  return buf;
}

describe('CollapseCodec', () => {
  describe('decodePayload — RLE corridor fixture', () => {
    const { header, cells } = CollapseCodec.decodePayload(buildCorridorFixture());

    it('decodes the 44-byte header', () => {
      expect(header.cellCount).toBe(5);
      expect(header.encoding).toBe(1);
      expect(header.flags).toBe(0);
      expect([header.originX, header.originY, header.originZ]).toEqual([5, 10, 0]);
      expect(header.baseLevel).toBe(0);
      expect(header.layerId).toBe(1);
      expect(header.cid.length).toBe(32);
      expect(Array.from(header.cid.slice(0, 4))).toEqual([0, 1, 2, 3]);
    });

    it('expands RLE into 5 cells (3 + 2)', () => {
      expect(cells).toHaveLength(5);
    });

    it('first 3 cells are solid walls (variant 0, no trigger)', () => {
      for (let i = 0; i < 3; i++) {
        expect(cells[i].collapseIndices).toEqual([0, 0, 0, 0, 0, 0]);
        expect(cells[i].triggerId).toBe(0);
      }
    });

    it('last 2 cells are archways (variant 1, trigger 99)', () => {
      for (let i = 3; i < 5; i++) {
        expect(cells[i].collapseIndices).toEqual([1, 1, 1, 1, 1, 1]);
        expect(cells[i].triggerId).toBe(99);
      }
    });
  });

  describe('round-trip', () => {
    it('header survives encode -> decode (incl. 16-bit big-endian cellCount)', () => {
      const cid = new Uint8Array(32).map((_, i) => (i * 7) & 0xff);
      const h: CollapseHeader = {
        cid, cellCount: 1234, encoding: 0, flags: 3,
        originX: 11, originY: 12, originZ: 13, baseLevel: 2, layerId: 4,
      };
      const buf = new Uint8Array(CollapseCodec.HEADER_SIZE);
      CollapseCodec.encodeHeader(h, buf, 0);
      const out = CollapseCodec.decodeHeader(buf, 0);
      expect(out.cellCount).toBe(1234);
      expect(out.encoding).toBe(0);
      expect(out.flags).toBe(3);
      expect([out.originX, out.originY, out.originZ]).toEqual([11, 12, 13]);
      expect(out.baseLevel).toBe(2);
      expect(out.layerId).toBe(4);
      expect(Array.from(out.cid)).toEqual(Array.from(cid));
    });

    it('cell survives encode -> decode (max valid index 15)', () => {
      const buf = new Uint8Array(CollapseCodec.CELL_SIZE);
      CollapseCodec.encodeCell([15, 0, 7, 8, 1, 15], 200, buf, 0);
      const out = CollapseCodec.decodeCell(buf, 0);
      expect(out.collapseIndices).toEqual([15, 0, 7, 8, 1, 15]);
      expect(out.triggerId).toBe(200);
    });
  });

  describe('contract / edge behavior (codec has no input validation by design)', () => {
    it('throws on an unsupported encoding flag', () => {
      const buf = new Uint8Array(CollapseCodec.HEADER_SIZE + 4);
      CollapseCodec.encodeHeader(
        { cid: new Uint8Array(32), cellCount: 1, encoding: 2, flags: 0, originX: 0, originY: 0, originZ: 0, baseLevel: 0, layerId: 0 },
        buf, 0,
      );
      expect(() => CollapseCodec.decodePayload(buf)).toThrow(/Unsupported SPP Protocol encoding flag: 2/);
    });

    it('collapse index > 15 overflows the nibble (pin: indices MUST be 0-15)', () => {
      const buf = new Uint8Array(CollapseCodec.CELL_SIZE);
      CollapseCodec.encodeCell([16, 0, 0, 0, 0, 0], 0, buf, 0); // 16<<4 = 0x100 -> truncated to 8 bits
      expect(CollapseCodec.decodeCell(buf, 0).collapseIndices[0]).toBe(0);
    });
  });
});
