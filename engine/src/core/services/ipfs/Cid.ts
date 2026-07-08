/**
 * CID — the content address, a REAL CIDv1 (2026-07-08, upgraded from the
 * `bafy`+bare-hash mock): `b` + base32( 0x01 ‖ 0x55 ‖ 0x12 ‖ 0x20 ‖ sha256 )
 * = version 1 · raw multicodec · sha2-256 multihash. Byte-identical to what a
 * real IPFS node computes for `ipfs add --cid-version=1 --raw-leaves`, so the
 * SAME content resolves on any real gateway (ipfs.io/dweb.link) when pinned
 * there — "swap the gateway base URL for real IPFS" is literally true.
 * Verified against the `multiformats` reference implementation. Raw-codec
 * CIDs render with the `bafk…` prefix.
 *
 * Still a pure function of the bytes — the load-bearing invariant ("cid =
 * hash of content, one scheme everywhere") is unchanged; single-blob only
 * (no UnixFS chunking: fine for our content sizes, and matches --raw-leaves).
 */

import { ResourceError } from '../../errors';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567'; // RFC4648 base32, lowercased

/** RFC4648 base32, lowercase, no padding. */
function base32(bytes: Uint8Array): string {
    let bits = 0, value = 0, out = '';
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

/** Content id for a byte buffer: real CIDv1(raw, sha2-256), `bafk…`. */
export async function cidForBytes(bytes: Uint8Array): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new ResourceError('[ipfs] crypto.subtle unavailable — cannot compute CID', { code: 'RESOURCE_LOAD' });
    const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as unknown as BufferSource));
    const cid = new Uint8Array(4 + digest.length);
    cid[0] = 0x01; // CID version 1
    cid[1] = 0x55; // multicodec: raw
    cid[2] = 0x12; // multihash: sha2-256
    cid[3] = 0x20; // digest length: 32 bytes
    cid.set(digest, 4);
    return 'b' + base32(cid);
}

/** Does a string look like a CID we resolve? CIDv1 base32 (`b…` — our raw
 *  `bafk…`, plus the legacy mock `bafy…` still parked in old drafts) or v0 `Qm…`. */
export function isCid(s: string): boolean {
    return /^(b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/.test(s);
}
