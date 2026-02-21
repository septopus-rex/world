const fs = require('fs');

const CollapseCodec = {
    HEADER_SIZE: 44,
    CELL_SIZE: 4,

    decodeHeader(buf, offset) {
        return {
            cid: buf.slice(offset, offset + 32),
            cellCount: (buf[offset + 32] << 8) | buf[offset + 33],
            encoding: buf[offset + 34],
            flags: buf[offset + 35],
            originX: buf[offset + 36],
            originY: buf[offset + 37],
            originZ: buf[offset + 38],
            baseLevel: buf[offset + 39],
            layerId: buf[offset + 40],
        };
    },

    encodeHeader(h, buf, offset) {
        buf.set(h.cid, offset);
        buf[offset + 32] = (h.cellCount >> 8) & 0xFF;
        buf[offset + 33] = h.cellCount & 0xFF;
        buf[offset + 34] = h.encoding;
        buf[offset + 35] = h.flags;
        buf[offset + 36] = h.originX;
        buf[offset + 37] = h.originY;
        buf[offset + 38] = h.originZ;
        buf[offset + 39] = h.baseLevel;
        buf[offset + 40] = h.layerId;
        buf[offset + 41] = 0; // reserved
        buf[offset + 42] = 0; // reserved
        buf[offset + 43] = 0; // reserved
    },

    decodeCell(buf, offset) {
        return {
            collapseIndices: [
                (buf[offset + 0] >> 4) & 0x0F, buf[offset + 0] & 0x0F,
                (buf[offset + 1] >> 4) & 0x0F, buf[offset + 1] & 0x0F,
                (buf[offset + 2] >> 4) & 0x0F, buf[offset + 2] & 0x0F,
            ],
            triggerId: buf[offset + 3],
        };
    },

    encodeCell(collapseIndices, triggerId, buf, offset) {
        buf[offset + 0] = (collapseIndices[0] << 4) | (collapseIndices[1] & 0x0F);
        buf[offset + 1] = (collapseIndices[2] << 4) | (collapseIndices[3] & 0x0F);
        buf[offset + 2] = (collapseIndices[4] << 4) | (collapseIndices[5] & 0x0F);
        buf[offset + 3] = triggerId;
    },

    decodePayload(buf) {
        const header = this.decodeHeader(buf, 0);
        let offset = this.HEADER_SIZE;
        const cells = [];

        // Raw encoding (0)
        if (header.encoding === 0) {
            for (let i = 0; i < header.cellCount; i++) {
                cells.push(this.decodeCell(buf, offset));
                offset += this.CELL_SIZE;
            }
        }
        // RLE encoding (1)
        else if (header.encoding === 1) {
            let processed = 0;
            while (processed < header.cellCount && offset < buf.length) {
                const rleHeader = buf[offset];
                const length = rleHeader & 0x3F; // 1-63
                offset += 1; 

                const cellData = this.decodeCell(buf, offset);
                offset += this.CELL_SIZE;

                for (let i = 0; i < length; i++) {
                    cells.push(cellData);
                }

                processed += length;
            }
        } else {
            throw new Error(`Unsupported encoding: ${header.encoding}`);
        }

        return { header, cells };
    }
};

console.log("=== Generating SPP Binary Mock Data ===");

const mockCid = new Uint8Array(32);
for (let i=0; i<32; i++) mockCid[i] = i;

const cellCount = 5;
const encoding = 1; // RLE
const flags = 0;
const originX = 5, originY = 10, originZ = 0;
const baseLevel = 0, layerId = 1;

const header = {
    cid: mockCid,
    cellCount, encoding, flags,
    originX, originY, originZ,
    baseLevel, layerId
};

const buf = new Uint8Array(44 + 5 + 5);

CollapseCodec.encodeHeader(header, buf, 0);

// Segment A: 3 Solid Walls (Face 0-5 all select variant 0), no trigger
// RLE Directive: Length 3 (0x03)
buf[44] = 0x03; 
CollapseCodec.encodeCell([0,0,0,0,0,0], 0, buf, 45);

// Segment B: 2 Archways (Face 0-5 all select variant 1), Trigger ID = 99
// RLE Directive: Length 2 (0x02)
buf[49] = 0x02;
CollapseCodec.encodeCell([1,1,1,1,1,1], 99, buf, 50);

console.log(`Mock Binary Generated. Total Size: ${buf.length} bytes (Compression: ${(5*4+44) / buf.length}x)`);

console.log("\n=== Decoding SPP Binary Data ===");
const decoded = CollapseCodec.decodePayload(buf);

console.log("Parsed Header:");
console.log(JSON.stringify({...decoded.header, cid: "Uint8Array(32) hidden"}, null, 2));

console.log("\nUnpacked Cells:");
decoded.cells.forEach((cell, idx) => {
    console.log(`Cell [${idx}]: Selects variants [${cell.collapseIndices.join(', ')}], Trigger: ${cell.triggerId}`);
});

fs.writeFileSync('mock_spp_chunk.bin', Buffer.from(buf));
console.log("\nSaved raw binary to engine/src/mock_spp_chunk.bin");
