import type { StylePack } from '@engine/core/spp/Variants';
import brick from './brick.stylepack.json';
import garden from './garden.stylepack.json';

/**
 * StylePack content store — a stand-in for IPFS/CAS. SPP StylePacks (the reusable
 * "弦粒子" option/variant library) live here as DATA (JSON), NOT as engine code.
 * A block's b6 `theme` references a pack by its human id OR a content id (CID);
 * both resolve to the same pack, same expansion. This is the data-separation
 * layer: the engine ships only `basic`/`coaster`; every visual pack is content
 * resolved through IDataSource.stylePack(). Spec: spp-protocol-full.md §3.B.
 */

const PACKS: StylePack[] = [brick as StylePack, garden as StylePack];

/** Deterministic content id over the canonical JSON — a CID stand-in so packs
 *  are addressable by CONTENT, not name (same bytes → same id). Real IPFS would
 *  hash the same canonical bytes; here FNV-1a → a short bafy-like string. */
function contentId(pack: StylePack): string {
    const s = JSON.stringify(pack); // authored key-ordered → stable bytes
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    return 'bafyspp' + (h >>> 0).toString(36);
}

const STORE = new Map<string, StylePack>();
const ID_TO_CID = new Map<string, string>();
for (const p of PACKS) {
    const cid = contentId(p);
    STORE.set(p.id, p);   // resolvable by human id …
    STORE.set(cid, p);    // … and by content id (CID)
    ID_TO_CID.set(p.id, cid);
}

/** IDataSource.stylePack resolver: refs (id or CID) → StylePack JSON. Unknown
 *  refs are simply omitted (the engine falls back to `basic`). */
export function resolveStylePacks(refs: string[]): Record<string, StylePack> {
    const out: Record<string, StylePack> = {};
    for (const r of refs) { const p = STORE.get(r); if (p) out[r] = p; }
    return out;
}

/** Every content pack id (human ids) — pre-registered at boot in local-first. */
export function allStylePackIds(): string[] { return PACKS.map(p => p.id); }

/** The full pack objects (for the SPP粒子 editor to load + edit). Deep-cloned so
 *  the editor never mutates the bundled originals. */
export function allStylePacks(): StylePack[] { return PACKS.map(p => JSON.parse(JSON.stringify(p))); }

/** The content id (CID) a block would point at for a given pack id. */
export function stylePackCid(id: string): string | undefined { return ID_TO_CID.get(id); }
