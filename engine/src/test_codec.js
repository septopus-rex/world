"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var CollapseCodec_1 = require("./core/protocol/CollapseCodec");
console.log("=== Generating SPP Binary Mock Data ===");
// 1. Generate a mock 32-byte CID (e.g. SHA256 hash placeholder)
var mockCid = new Uint8Array(32);
for (var i = 0; i < 32; i++)
    mockCid[i] = i;
// 2. We want to mock a corridor: 3 cells of 'Solid Wall' (variant 0), then 2 cells of 'Archway' (variant 1) using RLE Compression
var cellCount = 5;
var encoding = 1; // RLE
var flags = 0;
// Place the corridor at local block offset [5, 10, 0] at base level 0
var originX = 5;
var originY = 10;
var originZ = 0;
var baseLevel = 0;
var layerId = 1; // Decorative layer
var header = {
    cid: mockCid,
    cellCount: cellCount,
    encoding: encoding,
    flags: flags,
    originX: originX,
    originY: originY,
    originZ: originZ,
    baseLevel: baseLevel,
    layerId: layerId
};
// 3. Allocate buffer: 44 bytes header + (1 byte RLE + 4 byte Cell) * 2 segments = 54 bytes
var buf = new Uint8Array(44 + 5 + 5);
// Encode Header
CollapseCodec_1.CollapseCodec.encodeHeader(header, buf, 0);
// Segment A: 3 Solid Walls (Face 0-5 all select variant 0), no trigger
// RLE Directive: Length 3 (0x03)
buf[44] = 0x03;
CollapseCodec_1.CollapseCodec.encodeCell([0, 0, 0, 0, 0, 0], 0, buf, 45);
// Segment B: 2 Archways (Face 0-5 all select variant 1), Trigger ID = 99
// RLE Directive: Length 2 (0x02)
buf[49] = 0x02;
CollapseCodec_1.CollapseCodec.encodeCell([1, 1, 1, 1, 1, 1], 99, buf, 50);
console.log("Mock Binary Generated. Total Size: ".concat(buf.length, " bytes (Compression: ").concat((5 * 4 + 44) / buf.length, "x)"));
console.log(buf);
console.log("\n=== Decoding SPP Binary Data ===");
var decoded = CollapseCodec_1.CollapseCodec.decodePayload(buf);
console.log("Parsed Header:");
console.log(JSON.stringify(__assign(__assign({}, decoded.header), { definitionRef: "Uint8Array(32) hidden" }), null, 2));
console.log("\nUnpacked Cells:");
decoded.cells.forEach(function (cell, idx) {
    console.log("Cell [".concat(idx, "]: Selects variants [").concat(cell.collapseIndices.join(', '), "], Trigger: ").concat(cell.triggerId));
});
