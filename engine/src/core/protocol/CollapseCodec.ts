import { ParticleCell, SubdivisionLevel } from "../types/ParticleCell.js";

/**
 * 44-byte Header structure defined by SPP Protocol v1.1.
 */
export interface CollapseHeader {
    cid: Uint8Array;
    cellCount: number;
    encoding: number;
    flags: number;
    originX: number;
    originY: number;
    originZ: number;
    baseLevel: SubdivisionLevel;
    layerId: number;
}

/**
 * Decoder for the SPP Binary Protocol layer 2 (Collapsed State).
 * Includes raw and Run-Length Encoding (RLE) parsing.
 */
export class CollapseCodec {
    public static readonly HEADER_SIZE = 44;
    public static readonly CELL_SIZE = 4;

    /**
     * Decodes the standard 44-byte Header
     */
    public static decodeHeader(buf: Uint8Array, offset: number): CollapseHeader {
        return {
            cid: buf.slice(offset, offset + 32),
            cellCount: (buf[offset + 32] << 8) | buf[offset + 33],
            encoding: buf[offset + 34],
            flags: buf[offset + 35],
            originX: buf[offset + 36],
            originY: buf[offset + 37],
            originZ: buf[offset + 38],
            baseLevel: buf[offset + 39] as SubdivisionLevel,
            layerId: buf[offset + 40],
        };
    }

    /**
     * Encodes the standard 44-byte Header
     */
    public static encodeHeader(h: CollapseHeader, buf: Uint8Array, offset: number): void {
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
    }

    /**
     * Decodes a single 4-byte cell
     * Returns the selected collapse indices for all 6 faces and the trigger ID.
     */
    public static decodeCell(buf: Uint8Array, offset: number): {
        collapseIndices: [number, number, number, number, number, number];
        triggerId: number;
    } {
        return {
            collapseIndices: [
                (buf[offset + 0] >> 4) & 0x0F, buf[offset + 0] & 0x0F,
                (buf[offset + 1] >> 4) & 0x0F, buf[offset + 1] & 0x0F,
                (buf[offset + 2] >> 4) & 0x0F, buf[offset + 2] & 0x0F,
            ],
            triggerId: buf[offset + 3],
        };
    }

    /**
     * Encodes a single 4-byte cell
     */
    public static encodeCell(collapseIndices: [number, number, number, number, number, number], triggerId: number, buf: Uint8Array, offset: number): void {
        buf[offset + 0] = (collapseIndices[0] << 4) | (collapseIndices[1] & 0x0F);
        buf[offset + 1] = (collapseIndices[2] << 4) | (collapseIndices[3] & 0x0F);
        buf[offset + 2] = (collapseIndices[4] << 4) | (collapseIndices[5] & 0x0F);
        buf[offset + 3] = triggerId;
    }

    /**
     * Decode the complete binary payload into a list of cell configurations.
     */
    public static decodePayload(buf: Uint8Array): {
        header: CollapseHeader;
        cells: Array<{ collapseIndices: number[]; triggerId: number }>;
    } {
        const header = this.decodeHeader(buf, 0);
        let offset = this.HEADER_SIZE;
        const cells: Array<{ collapseIndices: number[]; triggerId: number }> = [];

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
                // RLE Header: bit7-6 (direction), bit5-0 (length)
                const rleHeader = buf[offset];
                const length = rleHeader & 0x3F; // 1-63
                offset += 1; // move past RLE header

                const cellData = this.decodeCell(buf, offset);
                offset += this.CELL_SIZE;

                for (let i = 0; i < length; i++) {
                    cells.push(cellData);
                }

                processed += length;
            }
        } else {
            throw new Error(`Unsupported SPP Protocol encoding flag: ${header.encoding}`);
        }

        return { header, cells };
    }
}
