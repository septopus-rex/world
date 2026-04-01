"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollapseCodec = void 0;
/**
 * Decoder for the SPP Binary Protocol layer 2 (Collapsed State).
 * Includes raw and Run-Length Encoding (RLE) parsing.
 */
var CollapseCodec = /** @class */ (function () {
    function CollapseCodec() {
    }
    /**
     * Decodes the standard 44-byte Header
     */
    CollapseCodec.decodeHeader = function (buf, offset) {
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
    };
    /**
     * Encodes the standard 44-byte Header
     */
    CollapseCodec.encodeHeader = function (h, buf, offset) {
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
    };
    /**
     * Decodes a single 4-byte cell
     * Returns the selected collapse indices for all 6 faces and the trigger ID.
     */
    CollapseCodec.decodeCell = function (buf, offset) {
        return {
            collapseIndices: [
                (buf[offset + 0] >> 4) & 0x0F, buf[offset + 0] & 0x0F,
                (buf[offset + 1] >> 4) & 0x0F, buf[offset + 1] & 0x0F,
                (buf[offset + 2] >> 4) & 0x0F, buf[offset + 2] & 0x0F,
            ],
            triggerId: buf[offset + 3],
        };
    };
    /**
     * Encodes a single 4-byte cell
     */
    CollapseCodec.encodeCell = function (collapseIndices, triggerId, buf, offset) {
        buf[offset + 0] = (collapseIndices[0] << 4) | (collapseIndices[1] & 0x0F);
        buf[offset + 1] = (collapseIndices[2] << 4) | (collapseIndices[3] & 0x0F);
        buf[offset + 2] = (collapseIndices[4] << 4) | (collapseIndices[5] & 0x0F);
        buf[offset + 3] = triggerId;
    };
    /**
     * Decode the complete binary payload into a list of cell configurations.
     */
    CollapseCodec.decodePayload = function (buf) {
        var header = this.decodeHeader(buf, 0);
        var offset = this.HEADER_SIZE;
        var cells = [];
        // Raw encoding (0)
        if (header.encoding === 0) {
            for (var i = 0; i < header.cellCount; i++) {
                cells.push(this.decodeCell(buf, offset));
                offset += this.CELL_SIZE;
            }
        }
        // RLE encoding (1)
        else if (header.encoding === 1) {
            var processed = 0;
            while (processed < header.cellCount && offset < buf.length) {
                // RLE Header: bit7-6 (direction), bit5-0 (length)
                var rleHeader = buf[offset];
                var length_1 = rleHeader & 0x3F; // 1-63
                offset += 1; // move past RLE header
                var cellData = this.decodeCell(buf, offset);
                offset += this.CELL_SIZE;
                for (var i = 0; i < length_1; i++) {
                    cells.push(cellData);
                }
                processed += length_1;
            }
        }
        else {
            throw new Error("Unsupported SPP Protocol encoding flag: ".concat(header.encoding));
        }
        return { header: header, cells: cells };
    };
    CollapseCodec.HEADER_SIZE = 44;
    CollapseCodec.CELL_SIZE = 4;
    return CollapseCodec;
}());
exports.CollapseCodec = CollapseCodec;
