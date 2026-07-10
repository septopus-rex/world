# Septopus Texture Protocol

> Spec layer · protocol v0.1 · cn/en bilingual (edits here must sync `../cn/texture.md`).
> Defines how a 3D engine **references, scales, tiles, and anchors** surface textures.
> This is a **cross-engine normative contract**: another engine (UE / the Rust reference
> engine) must implement the same scale/density/anchor rules to match per-face appearance.
> Related: texture **byte storage & addressing** → [Resource Protocol](./resource.md); the
> **slot** a texture occupies in an adjunct → [Adjunct Types](./adjunct-types.md); the overall
> rendering-realization contract → [Adjunct Protocol §6](./adjunct.md).

## 1. Scope

- This protocol covers a surface's **diffuse / color texture** (albedo `.map`).
- **PBR maps** (normal / roughness / metalness / AO / emissive) are **not in v1** — see §8 roadmap.
- Three goals: **constant density** (a 16 m floor and a 1 m crate look equally crisp),
  **on-chain capable** (numeric id / CID), and **dedup-shared** (one GPU texture reused across
  faces/blocks, reproducible per-face across engines).

## 2. Reference & resolution

- An adjunct references a texture by a **string** in one of three forms: **numeric resource id** |
  **CIDv1** (`bafk…`) | **URL / data:**.
- Resolution: numeric id → `IDataSource.texture([id])` → a **texture record**; CID / URL resolve directly.
- **Texture record** = `{ raw, format, size?, repeat? }`:
  - `raw` — CID / URL / relative path, mapped to a loadable URL by `resolveUrl` (CID → content router or gateway).
  - `format` — `png` | `jpg` (**must be POT**, see §4).
  - `size` — **physical world size**, see §3.
  - `repeat` — optional fine multiplier, see §5.
- **Load-once, dedup by id, refcount-released** (all uses of an id share one `THREE.Texture`).

## 3. World size `size` — how much world one image covers (implemented as scale)

- Texture-record field **`size = [w_m, h_m]`, in metres, default `[1, 1]`**. Semantics: this image
  covers `w×h` metres of world space.
- The engine tiles by **`repeat = [1/size_w, 1/size_h]`** — **world size IS a scale**:
  `size = 1` → one image per metre; `size = 2` → the same image stretched over 2 m (sparser).
- `size` is a **per-texture property** (per-id), identical for every face using it → `1/size` is too →
  **single-shared-texture dedup is preserved**.
- The image itself is preferably **square**; but physical `size` **may be non-square** (plank `[1, 0.25]`, brick `[2, 1]`).

## 4. Texel density baseline — **512 px/m**

- **Baseline 512 px/m (≈ 5.12 px/cm).** A standard `1m×1m` texture = **512×512**.
- Density = `image pixels / size(metres)`. Non-square scales the image at the same density:
  `[1, 0.25]m → 512×128`; `[2, 1]m → 1024×512`.
- Three tiers (one density system, pick by viewing distance):

  | Tier | Density | 1m square | Use |
  |---|---|---|---|
  | Low | 256 px/m | 256² | Ground / far / large faces (always viewed at distance) |
  | **Default** | **512 px/m** | **512²** | Walls / ordinary surfaces (crisp in first-person at ~0.5 m) |
  | High | 1024 px/m | 1024² | Signs / close-read hero / detail props |

- **Must be POT** (256 / 512 / 1024): `RepeatWrapping` + mipmaps require powers of two; NPOT is
  silently degraded (wrap dropped, mipmaps disabled).
- **Rationale (real-time / low-poly WebGL PWA)**: the closest meaningful read is first-person at a
  wall, **~0.5 m**; 512 is only slightly soft at that range, with mipmaps + anisotropy handling
  distance and tiling multiplying effective resolution → 512 is ample for this style; 256 is blurry
  up close, 1024 is wasteful for flat-shaded surfaces (×4 size / VRAM).

## 5. UV tiling (constant density)

- **Geometry UVs are in "metres"** (1 UV unit = 1 metre); origin per §6. So sampled tiles =
  `metres × (1/size) = metres / size`.
- Density depends **only on `size`, not face size** → constant. **Cross-engine normative formula:**

  ```
  tiles_per_face_axis = faceSizeMeters / size_axis      // size_axis default 1 (metre)
  ```

- `material.repeat` (authored, default `[1, 1]`) is a **fine multiplier on top** for local tweaks; it
  does not change the default density.
- Guaranteed only on **box / wall axis-aligned faces**; sphere / cylinder / plane / wedge world-UV → §8 gap.

## 6. Anchoring `[bottom, left]`

- Default **face-local `[bottom, left]`**: each face tiles from its **bottom-left corner**, so the
  **bottom row is always a full tile** (bricks start at the ground, not clipped half a tile).
- Per-face "bottom / left" convention (frame-neutral, every engine must agree):
  - **Vertical faces** (the 4 sides with a horizontal normal): `v=0` sits on the **world-down**
    (−up / gravity) side; `u=0` on the **lesser** end of that face's horizontal tangent.
  - **Horizontal faces** (top / bottom, normal up/down): origin at the **(min East, min North)** corner.
- **World-aligned** (pattern lines up across adjacent adjuncts, seamless big walls) = **opt-in** via
  `material.offset = fract(worldCorner / size)` per face → **breaks dedup** (that face needs a
  clone-on-write material). Off by default.

## 7. Material & determinism

- Material `MeshStandardMaterial`; texture assigned to **`.map`** (sRGB albedo). Color index / hex →
  base tint (textured faces use white base so the image shows true).
- **Dedup**: one `THREE.Texture` shared per id; `repeat = 1/size` is per-id consistent, so sharing is
  safe. Only world-aligned / video / runtime recolour go clone-on-write.
- **Determinism**: `size` / density / UVs derive entirely from **data + face size**, no randomness →
  reproducible per-face across engines (same iNFT property).

## 8. Gaps & roadmap (beyond v1)

- **PBR maps**: add `normal / roughness / metalness / ao / emissive` slots to the record + material (v2).
- **`material.offset / rotation`**: currently declared but unwired; world-aligned anchoring and
  texture scrolling depend on it, implemented alongside.
- **Non-box geometry UVs**: world-space UVs for sphere / cylinder / plane / wedge (currently fall back
  to 0..1, density not normalized).
- **Wall a1 raw texture**: wall `raw[7]` is currently used as **color**, so a wall cannot be textured
  from data (see §9 errata); add a raw texture slot or amend the description.

## 9. Implementation status · migration · errata

- **Implemented**: size-derived UV (currently the global `TILE_METERS = 2`), albedo `.map`, id / CID
  resolution, dedup + refcount, POT warning, anisotropy, sRGB. Only 3 samples exist (`checker` id7 /
  `ground-forest` id1 / `ground-moon` id5).
- **This spec's changes**: global `TILE_METERS = 2` → per-texture **`size` (default 1 m)**; add the
  **512 px/m** texel-density baseline; `[bottom, left]` anchoring; wire `offset`; add wall textures.
- **Migration**: give existing `checker / ground-forest / ground-moon` a `size` to preserve their
  look; re-export at 512 px/m, POT.
- **Errata**: [Adjunct Protocol §5](./adjunct.md)'s resource table said "Image `raw[3]` = texture id" —
  **wrong**. `raw[3]` is the **color / palette index**; the **texture is a2 box's `raw[7]`** (optional).
  This protocol + [Adjunct Types](./adjunct-types.md) are authoritative.
