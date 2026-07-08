# Septopus Document Envelope & Content Addressing (Normative)

> **Normative.** Defines the **uniform document envelope**, **content addressing
> (CID)** and **versioning discipline** for Septopus world data — content-addressed
> storage has no file extensions, so bytes fetched by CID must **identify
> themselves** (what they are, which schema version, how to validate). Any
> implementation (engine / client / gateway / tool) that follows this document
> must derive the same CID for the same content and unwrap the same payload.
> Reference implementation: `engine/src/core/services/ipfs/Cid.ts`, the
> `client/core` ContentResolver, `services/ipfs` (dev gateway). Process doc:
> `docs/plan/specs/full-data-migration.md` §P4.6.

## 1. Content addressing: CID (normative)

A content id is a **real CIDv1**:

```
CID = 'b' + base32( 0x01 ‖ 0x55 ‖ 0x12 ‖ 0x20 ‖ sha256(bytes) )
       ▲multibase   ▲v1    ▲raw   ▲sha2-256 ▲digest len 32
```

- base32 = RFC4648, lowercase, no padding; the raw codec renders CIDs as `bafk…`.
- **Byte-identical** to a real IPFS node's `ipfs add --cid-version=1 --raw-leaves`
  (verified bit-for-bit against the `multiformats` reference implementation;
  public gateways resolve these CIDs directly).
- **A CID is a pure function of the bytes**: same content → same id on any
  provider (memory CAS / local gateway / public IPFS — interchangeable). Readers
  **must** re-hash fetched bytes and compare against the CID (integrity check);
  reject on mismatch.
- Single-blob addressing (no UnixFS chunking). Implementations may agree on a
  scheme for very large content separately; protocol content is single-blob.
- Compatibility note: the pre-2026-07-08 mock scheme (`bafy` + bare hash) may
  linger in old local drafts; implementations **may** read it, **must not**
  produce it.

## 2. The uniform document envelope (normative)

Every native Septopus **JSON document** is wrapped in a self-describing envelope
before entering the CAS:

```jsonc
{
  "envelope": 1,                     // required: version of the envelope STRUCTURE itself (§2's shape)
  "format": "septopus.<kind>",      // required: document type (registry, §3)
  "version": 1,                      // required: the kind's payload SCHEMA version (integer)
  "meta": {                          // optional: human metadata
    "name": "…",                     //   display name
    "semver": "1.0.0"                //   human version (see §4: never parsed)
  },
  /* payload: the kind's own fields (§3) */
}
```

- **Envelope self-version `envelope` (added 2026-07-08)**: the envelope shape
  itself evolves (e.g. a future signature slot). Parse order: **`envelope` first
  (can I parse this shell?) → then `format` + `version` (can I parse this
  payload?) → only then touch the payload**. Unknown/too-high `envelope` =
  reject. Repo documents authored before 2026-07-08 that lack the field are read
  as `envelope: 1` during migration; **content entering the CAS / the chain must
  carry it explicitly**.
- Unknown `format` = reject; `version` above the supported one = reject (or
  migrate explicitly).
- **The envelope belongs to the storage/exchange layer only** (CAS put/get,
  gateway transport, export/import). **The payload is the normative layer**: its
  shape is defined by the respective protocol document and is **not changed by
  one byte** because of the envelope — runtime, golden conformance hashes, L2
  encoding and on-chain forms all operate on the payload.
- **Single-seam unwrap**: implementations must perform "validate envelope →
  extract payload" at exactly **one** boundary seam (the content resolver /
  loader); the engine core never sees envelopes.

## 3. The format registry (normative)

| format | payload | payload spec |
|---|---|---|
| `septopus.world.level` | level document (start/blocks/include/fallback…) | reference `AuthoredLevel`; vocabulary in process doc P7 (folds into a normative doc once stable) |
| `septopus.block` | the **bare 5-slot block raw** `[elevation, status, adjuncts, animations, game]` | [block.md](block.md) §3 (payload untouched, byte for byte) |
| `septopus.world.config` | world configuration (block size / player defaults / baseline texture…) | [world.md](world.md) |
| `septopus.spp.stylepack` | style pack (thickness/closed/open…) | SPP protocol / spp-protocol-full |
| `septopus.adjunct.module` | dynamic adjunct module: `meta.typeId` + `code` (generator, optional) + `descriptor` (pre-evaluated product, optional; at least one; when both, evaluation must match) | this table + [adjunct-types.md](adjunct-types.md) §15 (dynamic segment) |
| `septopus.loader` | world loader: `code` (self-contained JS program, executed by the shim with page authority) + `world` (CID of the world.config) | [boot-chain.md](boot-chain.md) §3 |
| `septopus.text` | multilingual text table (`entries: {locale: string[]}`) | [resource.md](resource.md) §4 |
| `septopus.generation.doc` | AI generation document | GenerationDoc contract |

- Adding a kind = amending this table (cn/en in lockstep).
- **Foreign binary formats** (GLB/PNG/WAV/MP4…) are **not** enveloped: raw bytes
  into the CAS; typing rides on MIME and the name index (§5).

## 4. Versioning discipline: four tiers (normative)

| tier | carrier | semantics | parsed? |
|---|---|---|---|
| **envelope structure** | `envelope` (integer) | evolution of the shell's shape (new fields etc.) | ✅ the first gate: can I parse this shell |
| **content version** | **CID** | immutable identity; one changed byte = a new CID | ✅ the only resolution key |
| **schema version** | `version` (integer) | the kind's payload format evolution, drives migrators | ✅ validation/migration |
| **human version** | `meta.semver` | display, changelog communication | ❌ **never**. Resolving by semver reintroduces mutable naming and destroys content addressing |

Upgrading content = publish a new CID + repoint the composition root (world/level
document). There is no in-place upgrade.

## 5. The name index (convention, non-normative)

Gateways/tools **may** keep a `name → CID` index as a human entry point (e.g.
`level:default`, `block:demo`, `stylepack:garden`, `asset:soldier.glb`,
`adjunct:monolith`). Names are **not** protocol identity:
- prefixes align with `format` (with the envelope in hand, a name prefix is only
  a redundant cross-check);
- names are mutable and rebindable; all consistency rides on CIDs;
- across trust boundaries (on-chain) only CID references are allowed — names are
  a local/dev convenience;
- the on-chain **resource registry** ([resource.md](resource.md) §3) is an owned
  name index (mutable integer-id → CID pointers) and is bound by the same
  discipline: consistency rides on CIDs.

## 6. Conformance checklist

0. Missing/unknown/too-high `envelope` → reject (migration exception: pre-existing
   repo documents read as 1).
1. Same payload bytes → every implementation derives the same CID (§1; verified
   against `multiformats`).
2. Fetched bytes whose re-hash ≠ CID → must be rejected (integrity).
3. Unknown `format` / too-high `version` → must reject or migrate explicitly;
   never guess silently.
4. A block document's unwrapped payload is **byte-identical** to a directly-held
   5-slot raw (zero envelope contamination).
5. Changing `meta.semver` with an unchanged payload → the CID changes (the
   envelope is hashed) but payload semantics do not; no implementation may vary
   behavior on semver.

---

*Protocol v0.1 (amended 2026-07-08). Changes must land in `cn/` and `en/`
together and be recorded in the root CHANGELOG.*
