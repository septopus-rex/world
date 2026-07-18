import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { registerDemoItems } from '../helpers/demo-items';
import { registerStylePack, type StylePack } from '../../src/core/spp/Variants';
import terranPack from '../../../client/core/src/stylepacks/terran.stylepack.json';
import level from '../../../client/core/src/levels/palace.level.json';

registerDemoItems();
// The client registers its stylepacks at boot; the NW guest house is themed
// 'terran' (a client pack, not an engine built-in) — headless must mirror that.
registerStylePack(terranPack as unknown as StylePack);

// Palace stress (docs/plan/specs/palace-stress-level.md) — the 6×6 contiguous
// palace exercised headlessly through the REAL systems. The client's resident
// window (5×5, evict-outside-immediately) lives in WorldContent; here a mini
// streamer replicates that exact algorithm (required set → evict → inject,
// draft overlay first) so the ENGINE-side invariants are what's under test:
// inject/evict leaves no residue, b6 expansion is deterministic across
// re-entry, doors/walls are walkable, and the cross-room quest recipe works.

const X0 = 2100, Y0 = 1100;
const byKey = new Map<string, any[]>(
    (level as any).blocks.map((b: any) => [`${b.x}_${b.y}`, b.raw]),
);

function makeStreamer(engine: any, world: any) {
    const loaded = new Set<string>();
    const everLoaded = new Set<string>();
    const sync = (cx: number, cy: number, extend = 2) => {
        const required = new Set<string>();
        for (let dx = -extend; dx <= extend; dx++)
            for (let dy = -extend; dy <= extend; dy++) required.add(`${cx + dx}_${cy + dy}`);
        for (const k of [...loaded]) {
            if (required.has(k)) continue;
            const [x, y] = k.split('_').map(Number);
            engine.removeBlock(x, y);
            loaded.delete(k);
        }
        for (const k of required) {
            if (loaded.has(k)) continue;
            // Draft overlay wins (the LocalDataSource rule) — this is how a
            // picked-up b5 stays gone across evict/re-inject.
            const draft = world.draftStore.load(0, ...(k.split('_').map(Number) as [number, number]));
            const raw = draft?.raw ?? byKey.get(k);
            if (!raw) continue;                       // outside the palace: no ground needed
            const [x, y] = k.split('_').map(Number);
            engine.injectBlock({ x, y, world: 'main', elevation: raw[0], adjuncts: raw });
            loaded.add(k); everLoaded.add(k);
        }
    };
    return { loaded, everLoaded, sync };
}

async function bootPalace(start?: { block: [number, number]; position: [number, number, number] }) {
    const engine = await makeHeadlessEngine({
        block: start?.block ?? [X0 + 2, Y0],
        position: start?.position ?? [8, 6, 1.5],
        rotation: [0, 0, 0],
    });
    const world: any = engine.getWorld()!;
    const stream = makeStreamer(engine, world);
    const pid = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = world.getComponent(pid, 'TransformComponent');
    // Septopus block+local → engine transform (blocks are 1-indexed; see
    // xianjian-quest.test.ts for the same helper).
    const spp = (bx: number, by: number, e: number, n: number, alt: number) => {
        t.position[0] = (bx - 1) * 16 + e;
        t.position[1] = alt;
        t.position[2] = -((by - 1) * 16 + n);
        t.dirty = true;
    };
    const N = (by: number) => -t.position[2] - (by - 1) * 16;
    const walkUntil = (ix: number, iy: number, cond: () => boolean, maxFrames = 1500) => {
        (engine as any).setMoveIntent(ix, iy);
        let i = 0;
        for (; i < maxFrames && !cond(); i++) engine.step(1 / 60);
        (engine as any).setMoveIntent(0, 0);
        stepN(engine, 10);
        return i < maxFrames;
    };
    const adjunctOf = (pred: (std: any) => boolean) =>
        world.getEntitiesWith(['AdjunctComponent']).find((e: number) => {
            const std = world.getComponent(e, 'AdjunctComponent')?.stdData;
            return std && pred(std);
        });
    const click = (eid: number, distance = 1.2) => {
        world.events.emit('interact.primary', { metadata: null, distance, point: [0, 0, 0] },
            { target: eid, actor: pid });
    };
    return { engine, world, stream, pid, t, spp, N, walkUntil, adjunctOf, click };
}

describe('宫殿 — 6×6 连片流式压力 (palace-stress-level.md)', () => {
    it('circling the corridor ring keeps the resident window ≤25 and leaves zero off-window residue', async () => {
        const q = await bootPalace();
        const { world, stream } = q;

        // Ring circuit in grid coords (south arm → east → north → west → back).
        const ring: Array<[number, number]> = [
            [X0 + 2, Y0], [X0 + 2, Y0 + 1], [X0 + 3, Y0 + 1], [X0 + 4, Y0 + 1],
            [X0 + 4, Y0 + 2], [X0 + 4, Y0 + 3], [X0 + 4, Y0 + 4], [X0 + 3, Y0 + 4],
            [X0 + 2, Y0 + 4], [X0 + 1, Y0 + 4], [X0 + 1, Y0 + 3], [X0 + 1, Y0 + 2],
            [X0 + 1, Y0 + 1], [X0 + 2, Y0 + 1],
        ];
        for (const [bx, by] of ring) {
            q.spp(bx, by, 8, 8, 1.2);
            stream.sync(bx, by);
            stepN(q.engine, 12);
            expect(stream.loaded.size, `resident window at [${bx},${by}]`).toBeLessThanOrEqual(25);

            // EVERY adjunct entity belongs to a currently-resident block — an
            // entity surviving its block's eviction would show up here.
            for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
                const id = String(world.getComponent(eid, 'AdjunctComponent')?.adjunctId ?? '');
                const m = id.match(/^adj_(\d+)_(\d+)_/);
                if (!m) continue;
                expect(stream.loaded.has(`${m[1]}_${m[2]}`), `entity ${id} outlived its block`).toBe(true);
            }
        }
        // The 5×5 window sliding along the ring must have streamed the WHOLE palace.
        for (let c = 0; c <= 5; c++) for (let r = 0; r <= 5; r++) {
            expect(stream.everLoaded.has(`${X0 + c}_${Y0 + r}`), `block [${X0 + c},${Y0 + r}] never streamed in`).toBe(true);
        }
    }, 120_000);

    it('the gate and corridor doors are walkable: spawn → gate axis → corridor → west arm', async () => {
        const q = await bootPalace();
        q.stream.sync(X0 + 2, Y0);
        stepN(q.engine, 30);

        // North through the gate hall's wide door into the south corridor arm.
        expect(q.walkUntil(0, 1, () => q.N(Y0 + 1) >= 3), 'walk through the gate axis door').toBe(true);
        q.stream.sync(X0 + 2, Y0 + 1);
        stepN(q.engine, 10);
        // West along the (doorless, colonnaded) corridor arm — crossing a
        // block seam on foot, walls owned per the N+W rule must leave no gap trap.
        expect(q.walkUntil(-1, 0, () => q.t.position[0] <= (X0 + 1 - 1) * 16 + 8), 'walk the south arm westwards').toBe(true);
        // Still standing at a sane altitude (no fall-through, no embed pop).
        expect(q.t.position[1]).toBeGreaterThan(0.2);
        expect(q.t.position[1]).toBeLessThan(2.5);
    }, 60_000);

    it('b6 terran house expansion is identical across evict → re-inject (collapse determinism)', async () => {
        const q = await bootPalace({ block: [X0, Y0 + 5], position: [8, 2, 1.2] });
        const KX = X0, KY = Y0 + 5;
        const snapshot = () => q.world.getEntitiesWith(['AdjunctComponent'])
            .map((e: number) => q.world.getComponent(e, 'AdjunctComponent'))
            .filter((a: any) => a?.stdData?.derivedFrom && String(a.adjunctId).startsWith(`adj_${KX}_${KY}_`))
            .map((a: any) => {
                const s = a.stdData;
                return [s.typeId, s.x, s.y, s.z, s.ox, s.oy, s.oz, s.rz ?? 0];
            })
            .sort((p: any[], w: any[]) => JSON.stringify(p) < JSON.stringify(w) ? -1 : 1);

        q.engine.injectBlock({ x: KX, y: KY, world: 'main', elevation: 0, adjuncts: byKey.get(`${KX}_${KY}`)! });
        stepN(q.engine, 10);
        const first = snapshot();
        expect(first.length, 'the terran house expanded into derived adjuncts').toBeGreaterThan(10);

        q.engine.removeBlock(KX, KY);
        stepN(q.engine, 5);
        expect(snapshot().length, 'derived entities evicted with their block').toBe(0);

        q.engine.injectBlock({ x: KX, y: KY, world: 'main', elevation: 0, adjuncts: byKey.get(`${KX}_${KY}`)! });
        stepN(q.engine, 10);
        expect(snapshot(), 're-expansion is bit-identical').toEqual(first);
    }, 60_000);

    it('cross-room quest: the king grants the seal, the vault door slides open (in) and shut (out)', async () => {
        const q = await bootPalace({ block: [X0 + 5, Y0 + 3], position: [6, 8, 1.2] });
        const { world } = q;
        q.engine.injectBlock({ x: X0 + 5, y: Y0 + 3, world: 'main', elevation: 0, adjuncts: byKey.get(`${X0 + 5}_${Y0 + 3}`)! });
        q.engine.injectBlock({ x: X0 + 5, y: Y0 + 1, world: 'main', elevation: 0, adjuncts: byKey.get(`${X0 + 5}_${Y0 + 1}`)! });
        stepN(q.engine, 10);

        const king = q.adjunctOf((s) => s.typeId === 0x00ba && s.visual?.module === 34);
        expect(king, 'the king materialized').toBeDefined();
        q.click(king);
        stepN(q.engine, 2);
        expect(world.activeDialogue, 'audience opened').toBeTruthy();
        // Without the seal only "request" + "leave" are visible.
        const node = world.activeDialogue.doc.nodes[world.activeDialogue.nodeId];
        const labels = world.activeDialogue.visible.map((i: number) => String(node.options[i].label));
        expect(labels).toEqual(['请赐宝库之印。', '告退。']);
        q.engine.chooseDialogue(0);
        stepN(q.engine, 2);
        expect(world.globalFlags.palace_seal, 'seal granted').toBe(true);
        q.engine.endDialogue();
        stepN(q.engine, 2);

        // The vault door (a2 index 0 of the vault block) sits closed at oz 1.6.
        const doorEid = world.getEntitiesWith(['AdjunctComponent']).find((e: number) =>
            world.getComponent(e, 'AdjunctComponent')?.adjunctId === `adj_${X0 + 5}_${Y0 + 1}_162_0`);
        expect(doorEid, 'vault door entity found by adjunct id').toBeDefined();
        const doorStd = () => world.getComponent(doorEid, 'AdjunctComponent').stdData;
        expect(doorStd().oz).toBeCloseTo(1.6, 3);

        // Step into the door zone → 'in' node passes its flag condition → +3.2.
        // (x=1.8: inside the zone but CLEAR of the closed panel's solid — a
        // teleport into the panel itself would popOut onto its top, above the zone.)
        q.spp(X0 + 5, Y0 + 1, 1.8, 8, 1.2);
        stepN(q.engine, 10);
        expect(doorStd().oz, 'door slid open').toBeCloseTo(4.8, 3);

        // Leave the zone → symmetric 'out' → back down (no unbounded stacking).
        q.spp(X0 + 5, Y0 + 1, 8, 13, 1.2);
        stepN(q.engine, 10);
        expect(doorStd().oz, 'door slid shut').toBeCloseTo(1.6, 3);
    }, 60_000);

    it('a picked-up kitchen potion stays gone across evict → re-inject (draft overlay)', async () => {
        const q = await bootPalace({ block: [X0 + 5, Y0 + 5], position: [8, 8, 1.2] });
        const { world, stream } = q;
        stream.sync(X0 + 5, Y0 + 5);
        stepN(q.engine, 10);

        // The two AUTHORED potions (seeds 901/902) — spawner-derived ones carry derivedFrom.
        const authoredPotions = () => world.getEntitiesWith(['ItemComponent']).filter((e: number) => {
            const a = world.getComponent(e, 'AdjunctComponent');
            return a && !a.stdData?.derivedFrom && String(a.adjunctId).startsWith(`adj_${X0 + 5}_${Y0 + 5}_`);
        });
        const before = authoredPotions();
        expect(before.length).toBe(2);

        q.click(before[0], 1.5);
        stepN(q.engine, 3);
        expect(authoredPotions().length, 'one potion picked up').toBe(1);
        const inv = world.getComponent(q.pid, 'InventoryComponent');
        expect((inv?.items ?? []).some((it: any) => it.id === 'tpl_3')).toBe(true);

        // Walk far away (window slides off), then come back: the draft overlay
        // must serve the REWRITTEN raw — the potion may not resurrect.
        q.spp(X0, Y0, 8, 8, 1.2);
        stream.sync(X0, Y0);
        stepN(q.engine, 10);
        expect(stream.loaded.has(`${X0 + 5}_${Y0 + 5}`), 'kitchen evicted').toBe(false);

        q.spp(X0 + 5, Y0 + 5, 8, 8, 1.2);
        stream.sync(X0 + 5, Y0 + 5);
        stepN(q.engine, 10);
        expect(authoredPotions().length, 'the picked potion stayed gone').toBe(1);
    }, 60_000);
});
