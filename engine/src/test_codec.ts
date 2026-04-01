import { CollapseCodec, CollapseHeader } from './core/protocol/CollapseCodec';

console.log("=== Generating SPP Binary Mock Data ===");

// 1. Generate a mock 32-byte CID (e.g. SHA256 hash placeholder)
const mockCid = new Uint8Array(32);
for (let i = 0; i < 32; i++) mockCid[i] = i;

// 2. We want to mock a corridor: 3 cells of 'Solid Wall' (variant 0), then 2 cells of 'Archway' (variant 1) using RLE Compression
const cellCount = 5;
const encoding = 1; // RLE
const flags = 0;
// Place the corridor at local block offset [5, 10, 0] at base level 0
const originX = 5;
const originY = 10;
const originZ = 0;
const baseLevel = 0;
const layerId = 1; // Decorative layer

const header: CollapseHeader = {
    cid: mockCid,
    cellCount,
    encoding,
    flags,
    originX, originY, originZ,
    baseLevel, layerId
};

// 3. Allocate buffer: 44 bytes header + (1 byte RLE + 4 byte Cell) * 2 segments = 54 bytes
const buf = new Uint8Array(44 + 5 + 5);

// Encode Header
CollapseCodec.encodeHeader(header, buf, 0);

// Segment A: 3 Solid Walls (Face 0-5 all select variant 0), no trigger
// RLE Directive: Length 3 (0x03)
buf[44] = 0x03;
CollapseCodec.encodeCell([0, 0, 0, 0, 0, 0], 0, buf, 45);

// Segment B: 2 Archways (Face 0-5 all select variant 1), Trigger ID = 99
// RLE Directive: Length 2 (0x02)
buf[49] = 0x02;
CollapseCodec.encodeCell([1, 1, 1, 1, 1, 1], 99, buf, 50);

console.log(`Mock Binary Generated. Total Size: ${buf.length} bytes (Compression: ${(5 * 4 + 44) / buf.length}x)`);
console.log(buf);

console.log("\n=== Decoding SPP Binary Data ===");
const decoded = CollapseCodec.decodePayload(buf);

console.log("Parsed Header:");
console.log(JSON.stringify({ ...decoded.header, definitionRef: "Uint8Array(32) hidden" }, null, 2));

console.log("\nUnpacked Cells:");
decoded.cells.forEach((cell, idx) => {
    console.log(`Cell [${idx}]: Selects variants [${cell.collapseIndices.join(', ')}], Trigger: ${cell.triggerId}`);
});
