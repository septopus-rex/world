import { describe, it, expect } from 'vitest';
import { LocalDataSource, SceneProvider } from '../../src/core/services/LocalDataSource';
import { DraftStore, InMemoryDraftBackend } from '../../src/core/services/DraftStore';

/**
 * LocalDataSource unifies the scene seed with the local draft overlay and serves
 * the streaming window. These cover the seam's contract: seed passthrough, draft
 * override, the (2*ext+1)^2 window shape, and worldIndex scoping.
 */

// A trivial seed: each block's raw encodes its own coords in the adjuncts slot,
// so a test can tell seed-from-(x,y) apart from an overlaid draft.
const seedScene: SceneProvider = {
    block: (x, y) => [0, 1, [['seed', x, y]], []],
};

function makeDrafts(): DraftStore {
    return new DraftStore(new InMemoryDraftBackend());
}

describe('LocalDataSource', () => {
    it('returns the scene seed when no draft exists', () => {
        const lds = new LocalDataSource(seedScene, makeDrafts(), 0);
        const b = lds.blockAt(2048, 2049);
        expect(b).toEqual({ x: 2048, y: 2049, raw: [0, 1, [['seed', 2048, 2049]], []], isDraft: false });
    });

    it('overlays a local draft over the seed (draft wins, isDraft flagged)', () => {
        const drafts = makeDrafts();
        drafts.save(0, 2048, 2048, [9, 1, [['DRAFT']], []]);
        const lds = new LocalDataSource(seedScene, drafts, 0);

        const edited = lds.blockAt(2048, 2048);
        expect(edited.isDraft).toBe(true);
        expect(edited.raw).toEqual([9, 1, [['DRAFT']], []]);

        // A neighbour without a draft still comes from the seed.
        expect(lds.blockAt(2049, 2048).isDraft).toBe(false);
    });

    it('scopes drafts by worldIndex', () => {
        const drafts = makeDrafts();
        drafts.save(1, 2048, 2048, [9, 1, [['OTHER_WORLD']], []]);
        // This source reads world 0 — the world-1 draft must NOT leak in.
        const lds = new LocalDataSource(seedScene, drafts, 0);
        expect(lds.blockAt(2048, 2048).isDraft).toBe(false);
    });

    it('view() returns the full (2*ext+1)^2 neighbourhood window', () => {
        const lds = new LocalDataSource(seedScene, makeDrafts(), 0);
        const win = lds.view(2048, 2048, 2);
        expect(win).toHaveLength(25); // 5x5
        // Corners present, centred on the request.
        const keys = new Set(win.map(b => `${b.x}_${b.y}`));
        expect(keys.has('2046_2046')).toBe(true);
        expect(keys.has('2050_2050')).toBe(true);
        expect(keys.has('2048_2048')).toBe(true);
    });

    it('view() applies the draft overlay per-cell', () => {
        const drafts = makeDrafts();
        drafts.save(0, 2048, 2048, [0, 1, [['EDITED']], []]);
        const lds = new LocalDataSource(seedScene, drafts, 0);

        const win = lds.view(2048, 2048, 1);
        const centre = win.find(b => b.x === 2048 && b.y === 2048)!;
        expect(centre.isDraft).toBe(true);
        expect(win.filter(b => b.isDraft)).toHaveLength(1); // only the edited cell
    });
});
