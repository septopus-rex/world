# Septopus Land Registry (Normative)

> **Normative.** Defines the **hybrid-chain** contract for block ownership and
> on-chain content pointers: **world releases ride the Bitcoin anchor
> ([boot-chain.md](boot-chain.md)); block ownership and the marketplace live in
> the land registry declared by the world config (v1 = Solana `septopus_land`
> program)**. The two layers have disjoint responsibilities.

## 1. Hybrid Architecture: Why Two Layers

| Layer | Carrier | Cadence | Question Answered |
|---|---|---|---|
| **World root** | Bitcoin anchor + IPFS ([boot-chain.md](boot-chain.md)) | Low (per release) | What is this world called, what client code and world config does it run, which chain drives its calendar clock |
| **Land registry** | Registry contract (this spec, v1 = Solana) | High (sub-second, sub-cent) | Who owns block `[x, y]`, is it listed for sale, and what content CID has its owner published there |

**Boundary rules (normative)**:

1. **The land contract does not define the world.** World geometry (`world.range`/`block`/`diff`), spawn, module whitelist, and client code come exclusively from the Bitcoin-anchored `septopus.world.config`; the contract's `range` is a mint-bounds mirror and never overrides the world config.
2. **Trust flows one way (Bitcoin anchor → land contract).** A client connects to a land contract only when `septopus.world.config` declares a `land` section pointing at it; the contract cannot appoint itself authority over a world or mutate world code/config.
3. **Only the 32-byte content digest goes on chain, never block JSON.** Full block bytes live in content-addressed storage (IPFS); the chain stores only the 32-byte sha2-256 payload of `CIDv1(raw, sha2-256)`.
4. **The pure build has zero chain dependencies.** When built without the land plugin (or when a world config has no `land` section), the client runs in standalone local mode where every block is freely editable.

## 2. The `land` Section in `world.config` (Normative)

`septopus.world.config` (and local `*.world.json` files) may declare an optional top-level `land` object:

```json
{
  "land": {
    "chain": "solana",
    "cluster": "localnet",
    "program": "BchyjzrcoUdsuLH8fdbx1GSDj95cf3nvcAKeKsmC9ye5",
    "world": "septopus"
  }
}
```

| Field | Type | Semantics |
|---|---|---|
| `chain` | `"solana"` | Registry chain identifier |
| `cluster` | `"localnet"` \| `"devnet"` \| `"mainnet-beta"` | Network cluster; RPC URL may be overridden by environment |
| `rpc` | `string` (optional) | Explicit RPC endpoint |
| `program` | `string` | Program address (Solana Base58 pubkey) |
| `world` | `string` (1..32 bytes) | World key inside the program; must match the Bitcoin anchor `name` |

## 3. Content CID ↔ 32-Byte Digest (Normative)

Septopus content CIDs are **CIDv1 · raw (`0x55`) · sha2-256 (`0x12`, length `0x20`)**, lowercase unpadded base32 (`bafk…`). Because the 4-byte prefix `[0x01, 0x55, 0x12, 0x20]` is fixed by protocol, on-chain accounts store only the 32-byte sha2-256 digest `content: [u8; 32]`:

- **Encode to chain**: verify the `[0x01, 0x55, 0x12, 0x20]` prefix and write the trailing 32 bytes;
- **Decode from chain**: all-zero `[0u8; 32]` means "no on-chain content published"; any non-zero digest is prefixed with `[0x01, 0x55, 0x12, 0x20]` and base32-encoded to recover the exact `bafk…` CID;
- **Verification**: `IpfsRouter.get(cid)` re-hashes fetched bytes against the CID, so gateways remain untrusted.

## 4. Block Status and Content Resolution Order (Normative)

Each coordinate `[x, y]` (`1 ≤ x ≤ range[0]`, `1 ≤ y ≤ range[1]`) is in one of four states:

| Status | Meaning | Who May Enter Edit Mode |
|---|---|---|
| `unminted` (no PDA) | Unclaimed block | Nobody (must mint first; pure chain-free builds exempted) |
| `owned` (`status = 0`) | Owned by `owner` | Only the connected wallet matching `owner` |
| `listed` (`status = 1`) | Listed for sale at `price` | Nobody (`set_content` is frozen while listed to prevent bait-and-switch; delist to edit) |
| `banned` (`status = 2`) | Moderated by world authority | Nobody |

**Content resolution order for block `[x, y]`**:

1. **Local draft (`DraftStore`)**: the owner's unpublished working copy;
2. **On-chain published content**: when status is `owned` or `listed` and `cid != null`, fetch the canonical `BlockRaw` for `cid` via CAS/IPFS;
3. **Ban fallback**: when `banned`, ignore on-chain `cid` and fall back to the seed/default ground;
4. **Level seed / fallback**: when `unminted` or `cid == null`, serve the world's authored level / `fallback` ground.

## 5. Solana Reference Program (`septopus_land`)

### 5.1 PDA Derivation

- **World account**: `seeds = ["world", world.as_bytes()]`
- **Block account**: `seeds = ["block", world_pda.as_ref(), x.to_le_bytes(), y.to_le_bytes()]`

Each world owns an isolated PDA namespace, so multiple worlds operate concurrently without freezing earlier ones.

### 5.2 Account Layouts

- `World`: `authority: Pubkey` · `treasury: Pubkey` · `name: String(≤32)` · `range_x: u32` · `range_y: u32` · `mint_price: u64` · `minted: u64` · `frozen: bool` · `bump: u8`
- `Block`: `world: Pubkey` · `x: u32` · `y: u32` · `owner: Pubkey` · `content: [u8; 32]` · `price: u64` · `status: u8` · `revision: u32` · `minted_slot: u64` · `updated_slot: u64` · `bump: u8`

### 5.3 Instructions

| Instruction | Signer | Semantics |
|---|---|---|
| `init_world(name, range_x, range_y, mint_price)` | `authority` | Create a world's land registry |
| `update_world(mint_price?, frozen?, treasury?)` | `authority` | Update mint price, freeze flag, or treasury |
| `mint_block(x, y)` | `payer` | Check `1..=range`, transfer `mint_price` to `treasury`, init `Block` PDA owned by `payer` |
| `set_content(x, y, content: [u8; 32])` | `owner` | Require not `listed` and not `banned`; store 32-byte digest and increment `revision` |
| `list_block(x, y, price)` | `owner` | Require `price > 0` and not `banned`; set status to `listed` |
| `delist_block(x, y)` | `owner` | Require currently `listed`; restore `owned` and `price = 0` |
| `buy_block(x, y, expected_price)` | `buyer` | Require `listed`, `price == expected_price` (front-running guard), `buyer != owner`, `seller == owner`; transfer SOL, transfer ownership, delist |
| `transfer_block(x, y, new_owner)` | `owner` | Gift block and clear any listing |
| `moderate_block(x, y, banned)` | `authority` | World authority ban/unban |

---

*Protocol version: v0.1 (added 2026-10). Changes must stay synced across cn/en and be recorded in root CHANGELOG.*
