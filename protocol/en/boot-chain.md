# Septopus Boot Chain (Normative)

> **Normative.** Defines the full boot chain from a **Bitcoin anchor record** to
> a playable 3D world: anchor (an on-chain micro-format) → ROOT_CID loader
> (`septopus.loader`) → world config → adjunct modules / levels / blocks /
> resources — the chain holds exactly one tiny record; everything else is an
> [envelope](envelope.md) document on IPFS, resolved recursively by CID.
> Design principle: **one anchor + one envelope protocol + a CID chain**; the
> chain's responsibility is minimized to "proof of existence + ordering +
> publication history"; no smart contracts.

## 1. The chain at a glance

```
Bitcoin (anchor, micro-format, §2)   {p,name,version,cid}  ← authority = signing key, not the name string
        │
        ▼ ROOT_CID
IPFS    septopus.loader (§3)      = { code, world }
        │        │
        │        ▼ world (CID)
        │   septopus.world.config = spawn · adjunctModules[CID…] · governance
        │              │
        │              ▼ fetched by CID (all envelope documents)
        │   septopus.adjunct.module (code/descriptor)
        │   septopus.world.level / septopus.block (content)
        │   binary resources (raw bytes; CID = media hash)
        ▼
boot shim (§4) = the only off-chain trust root (BIOS role: tiny, pinned, auditable)
```

Every hop is the same move: **fetch CID → re-hash integrity (envelope §1) →
validate envelope (`envelope` → `format` → `version`) → consume the payload
(which may contain further CIDs)**.

## 2. The anchor record (on-chain micro-format) (normative)

The anchor is the **only thing not on IPFS**; it lives on Bitcoin
(inscription / OP_RETURN-class carrier). On-chain bytes are expensive, so the
anchor does **not** use the envelope — it is a pinned micro-format (compact
JSON, UTF-8):

```json
{"p":"septopus","name":"world","version":"0.1.0","cid":"bafk…"}
```

| field | semantics | parsed? |
|---|---|---|
| `p` | protocol tag, always `"septopus"` (for chain indexing) | ✅ filter |
| `name` | world name (one key may publish several worlds) | ✅ selection |
| `version` | human version | ❌ display only (same discipline as envelope §4 semver) |
| `cid` | ROOT_CID → the `septopus.loader` document | ✅ boot entry |

**Authority & resolution rules** (the core; defeats squatting / fake roots):

1. **Authority = the signing key, not the name string.** Anyone can publish
   `p=septopus` records; the shim only accepts records signed by the **genesis
   key** (a public key/address pinned into the shim at build time, §4).
2. **Latest = that key's confirmed, valid record at the greatest block height**;
   several in one block → first in block order. `version` plays no part in
   selection.
3. An unparseable record (bad JSON / missing fields / invalid cid) → skip and
   walk back to the previous valid record (a bad record must not brick the world).
4. Key rotation: unsupported in v1 (a lost key freezes the world at its last
   valid anchor). A rotation record format is reserved for a later version.

## 3. `septopus.loader` (the ROOT document) (normative)

ROOT_CID points at a standard envelope document:

```jsonc
{
  "envelope": 1,
  "format": "septopus.loader",
  "version": 1,
  "meta": { "name": "septopus-world", "semver": "0.1.0" },
  "code": "…self-contained JS program…",  // executed by the shim with page authority
  "world": "bafk…"                         // CID of the septopus.world.config
}
```

- `code`: a **self-contained** JS program (no imports / no external script
  tags) — the 3D world client itself (or its bootstrapper). The shim runs it
  with **full page authority**: the loader's trust is established by the
  "anchor key signature → CID integrity" chain, **not** by the adjunct sandbox
  (that is for third-party in-world content; see
  [adjunct-types.md](adjunct-types.md) §15).
- `world`: the CID of the world configuration. **Every root upgrade (config
  change / module swap / content root change) flows through "publish new docs →
  publish a new loader doc → publish a new anchor"** — every root change leaves
  an on-chain audit trail.
- After it runs, the loader must fetch the `septopus.world.config` by `world`,
  then continue the CID recursion through its `adjunctModules` / content
  references, applying envelope §1 integrity checks throughout.

## 4. The boot shim (the off-chain trust root) (normative)

The shim is the **only component that must be distributed off-chain in
advance** (a static page / native shell / extension). Its role = BIOS: tiny,
rarely changed, auditable as a whole. **What is pinned in the shim IS the
entire trust root**:

| pinned at build | purpose |
|---|---|
| chain network + genesis key (or genesis txid) | the authority test of §2 |
| IPFS gateway list | fetch channels (several; degrade one by one) |
| the supported `envelope`/`format`/`version` ceilings | never parse an unknown shell |

**Normative algorithm** (implementations must not add or drop semantic steps):

```
1. read chain: filter records with p="septopus" ∧ name=<target> ∧ signed by the genesis key
2. select: the valid record at the greatest block height (§2 rules 2/3) → ROOT_CID
3. fetch: ROOT_CID bytes via the gateway list; re-hash against the CID per
   gateway, mismatch → next gateway
4. validate shell: envelope=1 ∧ format="septopus.loader" ∧ version ≤ ceiling;
   else halt with an explicit error
5. execute: run payload.code with page authority, passing {anchor, rootCid, world}
   as boot parameters
```

- The shim interprets **no content** — after step 5 everything belongs to the
  loader.
- Upgrading the shim = redistributing the shim (it is not on-chain). This is
  deliberate: changes to the trust root must go through explicit off-chain
  distribution and can never be bootstrapped away by on-chain content.

## 5. The dev stand-in (convention, non-normative)

A chainless (dev) environment rehearses **the same bytes and the same
algorithm**:

- anchor record → the gateway name index entry `anchor:<name>` (content = the
  §2 micro-format bytes; the signature/height checks degrade to skipped, every
  other step unchanged);
- gateway = `services/ipfs` (7789); the shim may accept `?anchor=<url>` as a
  dev-only override of the anchor source.
- Dev rehearsal and mainnet boot therefore differ only in steps 1–2 (how the
  anchor is obtained) — the anti-drift property.

## 6. Trust model & failure surface

| threat | defence |
|---|---|
| fake anchor / name squatting | authority = genesis key (§2.1); the name string carries no authority |
| gateway serves forged bytes | CID re-hash (envelope §1); retry next gateway |
| content unpinned (availability) | multiple gateways + local cache tier; publishers pin (an operational convention, not protocol) |
| bad record / bad document bricking boot | §2.3 skip-and-walk-back; §4.4 halt with explicit error |
| stolen anchor key | unsolved in v1 (rotation reserved); impact = fake roots can be published — key custody is an operational red line |
| malicious loader code | undefended by design (loader = full authority) — trust equals "the anchor key's publisher"; only third-party content goes through sandbox/descriptor |

## 7. The upgrade flow (how an on-chain world "releases")

```
edit content/config → publish new docs to IPFS (new CIDs) → pin
→ assemble a new loader doc (world → the new config) → pin → new ROOT_CID
→ publish a new anchor {p,name,version,cid} with the genesis key
→ every client uses the new root on its next boot; old roots remain fetchable
  forever (chain history + immutable CIDs) = version rollback for free
```

---

*Protocol v0.1 (added 2026-07-08). Changes must land in `cn/` and `en/` together
and be recorded in the root CHANGELOG.*
