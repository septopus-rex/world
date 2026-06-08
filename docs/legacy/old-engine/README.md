# Old-engine content seed (rescued before retirement)

These two files are **rescued copies** of the only non-recoverable content in the
old JS engine (`engine/backup/septopus`, gitignored and slated for deletion). They
are kept here, tracked in git, so the curated demo content survives once the old
engine tree is removed.

- **`design.js`** (~77 KB) — the old engine's hand-authored showcase library:
  curated blocks, textures, models, and per-world `common` config (time/sky/weather
  ranges). The single largest piece of authored content in the old engine.
- **`mock.js`** (~22 KB) — the old mock data source, including the **adjunct
  definition catalog** (per-type chain slot layouts + sample rows) and the
  `env.world.common` time/sky/weather config the old `time.js`/`weather.js` read.

## What these are NOT

Reference content only — old JS, old (callback) data shapes, mm-unit geometry,
chain-coupled fields. They are **not imported** by the new engine. Treat them as a
seed to mine when authoring a richer demo world for the new `client/desktop`
(re-expressed via `engine/src/core/mocks/BlockMocks.ts` + `WorldConfigs.ts` and the
TS `AdjunctDefinition` slot maps).

## Provenance

Copied verbatim from `engine/backup/septopus/io/{design,mock}.js` during the
old-engine migration closeout (see `docs/plan/STANDALONE_ENGINE_ROADMAP.md`). The
migration audit flagged `design.js` as the only content that would be permanently
lost on deletion; everything else unmigrated is chain-coupled or app/host-level.
