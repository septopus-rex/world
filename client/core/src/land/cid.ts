/**
 * CIDv1(raw, sha2-256) ↔ 32-byte digest — the on-chain content encoding
 * (land.md §3). The registry stores ONLY the sha2-256 digest; the codec
 * (raw 0x55) and hash (sha2-256 0x12/0x20) are fixed by the protocol, so the
 * full `bafk…` id is reconstructible bit-for-bit (same layout as engine Cid.ts).
 */

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const PREFIX = [0x01, 0x55, 0x12, 0x20];

function base32(bytes: Uint8Array): string {
    let bits = 0, value = 0, out = '';
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

function unbase32(s: string): Uint8Array {
    const out: number[] = [];
    let bits = 0, value = 0;
    for (const ch of s) {
        const v = B32.indexOf(ch);
        if (v < 0) throw new Error(`invalid base32 char "${ch}"`);
        value = (value << 5) | v;
        bits += 5;
        if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return new Uint8Array(out);
}

/** `bafk…` → 32-byte digest. Throws for anything that is not CIDv1(raw, sha2-256). */
export function cidToDigest(cid: string): Uint8Array {
    if (!cid.startsWith('b')) throw new Error(`not a base32 CIDv1: ${cid}`);
    const bytes = unbase32(cid.slice(1));
    if (bytes.length !== 36 || PREFIX.some((b, i) => bytes[i] !== b)) {
        throw new Error(`land content must be CIDv1(raw, sha2-256): ${cid}`);
    }
    return bytes.slice(4);
}

/** 32-byte digest → `bafk…`; all-zero digest = no content → null. */
export function digestToCid(digest: Uint8Array): string | null {
    if (digest.length !== 32) throw new Error('digest must be 32 bytes');
    if (digest.every((b) => b === 0)) return null;
    const bytes = new Uint8Array(36);
    bytes.set(PREFIX, 0);
    bytes.set(digest, 4);
    return 'b' + base32(bytes);
}
