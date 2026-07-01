/**
 * CID — the content address. A CID is `bafy` + base32(sha256(bytes)): a pure
 * function of the bytes, so the SAME content always yields the SAME id on any
 * provider (the property that makes mock CAS / local gateway / real IPFS
 * interchangeable). The `bafy` prefix mirrors a real CIDv1 base32 and reuses
 * ResourceManager.resolveUrl's existing CID branch.
 *
 * This is a MOCK scheme: a single sha256 multihash, not full multicodec/UnixFS.
 * It is deliberately minimal — the load-bearing invariant is only "cid = hash of
 * content, one scheme everywhere", which this satisfies.
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

/** Content id for a byte buffer: `bafy` + base32(sha256(bytes)). */
export async function cidForBytes(bytes: Uint8Array): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new ResourceError('[ipfs] crypto.subtle unavailable — cannot compute CID', { code: 'RESOURCE_LOAD' });
    const digest = await subtle.digest('SHA-256', bytes as unknown as BufferSource);
    return 'bafy' + base32(new Uint8Array(digest));
}

/** Does a string look like a CID we resolve (our `bafy…` mock or a v0 `Qm…`)? */
export function isCid(s: string): boolean {
    return /^(bafy[a-z2-7]+|Qm[1-9A-HJ-NP-Za-km-z]{44})$/.test(s);
}
