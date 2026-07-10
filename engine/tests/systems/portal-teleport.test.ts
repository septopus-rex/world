import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// Teleport & portals (specs/teleport-portal.md): the anchor-gated relocation
// action. Legality is two-sided — the SOURCE trigger's conditions (has the
// key?) and the DESTINATION anchor's `when` (does the place accept you?) —
// and the action refuses bare coordinates by design: no anchor, no entry.

const HOME: [number, number] = [2048, 2048];
const SHRINE: [number, number] = [2048, 2050];
const FAR: [number, number] = [2060, 2060];

const TELEPORT_TO_SHRINE = { type: 'player', method: 'teleport', target: 'shrine', params: [SHRINE] };

/** Portal recipe on the home block: key-gated 'in' trigger + denial feedback. */
const PORTAL_ROW = [
    [3, 3, 3], [8, 12, 1.5], [0, 0, 0], 1, 0,
    [{
        type: 'in', oneTime: false,
        conditions: { '>=': [{ var: 'inventory.tpl_2' }, 1] },
        actions: [TELEPORT_TO_SHRINE],
        fallbackActions: [{ type: 'flag', target: 'portal_denied', params: [true] }],
    }],
];

/** Destination anchors: an open shrine pad + a permission-gated inner sanctum. */
const SHRINE_ROWS = [
    [[2, 2, 2], [8, 8, 1], [0, 0, 0], 1, 0, [], { name: 'shrine' }],
    [[2, 2, 2], [12, 12, 1], [0, 0, 0], 1, 0, [], { name: 'inner-sanctum', when: { var: 'flags.attuned' } }],
];

async function boot() {
    const engine = await makeHeadlessEngine();
    const world: any = engine.getWorld()!;
    engine.injectBlock({ x: HOME[0], y: HOME[1], world: 'main', elevation: 0, adjuncts: [0, 1, [[AdjunctType.Trigger, [PORTAL_ROW]]], [], 0] });
    engine.injectBlock({ x: SHRINE[0], y: SHRINE[1], world: 'main', elevation: 0, adjuncts: [0, 1, [[AdjunctType.Trigger, SHRINE_ROWS]], [], 0] });
    stepN(engine, 10);
    const pid = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = world.getComponent(pid, 'TransformComponent');
    const events: any[] = [];
    engine.on('teleport.done', (p: any) => events.push({ kind: 'done', ...p }));
    engine.on('teleport.denied', (p: any) => events.push({ kind: 'denied', ...p }));
    const spp = (b: [number, number], e: number, n: number, alt: number) => {
        t.position[0] = (b[0] - 1) * 16 + e;
        t.position[1] = alt;
        t.position[2] = -((b[1] - 1) * 16 + n);
        t.dirty = true;
    };
    const at = (b: [number, number]) => ({
        e: t.position[0] - (b[0] - 1) * 16,
        n: -t.position[2] - (b[1] - 1) * 16,
        alt: t.position[1],
    });
    const giveKey = () => {
        const inv = world.getComponent(pid, 'InventoryComponent');
        inv.items.push({ id: 'tpl_2', quantity: 1, metadata: { templateId: 2, seed: 0 } });
    };
    const act = (action: any) =>
        world.actuator.execute(action, { world, playerId: pid, mode: world.mode, sourceEntity: null });
    return { engine, world, pid, t, spp, at, giveKey, act, events };
}

const flush = async () => new Promise((r) => setTimeout(r, 0)); // let the async anchor fetch settle

describe('portal recipe — source-side gating (the door checks your key)', () => {
    it('no key: fallback feedback fires, the player stays put', async () => {
        const q = await boot();
        q.spp(HOME, 8, 12, 0.95);          // step into the portal volume
        stepN(q.engine, 10);
        await flush();
        stepN(q.engine, 5);
        expect(q.world.globalFlags.portal_denied, 'denial feedback ran').toBe(true);
        expect(q.at(HOME).n, 'still standing at the portal').toBeCloseTo(12, 0);
        expect(q.events.filter(e => e.kind === 'done')).toHaveLength(0);
    });

    it('with the key: walked-into portal lands the player on the shrine anchor', async () => {
        const q = await boot();
        q.giveKey();
        q.spp(HOME, 8, 12, 0.95);
        stepN(q.engine, 10);
        await flush();
        stepN(q.engine, 30);   // step THROUGH the teleport transition (dolly-out → swap)
        const p = q.at(SHRINE);
        expect(p.e, 'landed on the shrine pad (E)').toBeCloseTo(8, 0);
        expect(p.n, 'landed on the shrine pad (N)').toBeCloseTo(8, 0);
        expect(q.events.some(e => e.kind === 'done' && e.anchor === 'shrine')).toBe(true);
    });
});

describe('teleport action — destination-side gating', () => {
    it("anchor `when` refuses the unattuned (reason 'refused')", async () => {
        const q = await boot();
        q.spp(HOME, 4, 4, 0.95);
        stepN(q.engine, 5);
        q.act({ type: 'player', method: 'teleport', target: 'inner-sanctum', params: [SHRINE] });
        await flush();
        stepN(q.engine, 5);
        expect(q.events.some(e => e.kind === 'denied' && e.reason === 'refused')).toBe(true);
        expect(q.at(HOME).e, 'not moved').toBeCloseTo(4, 0);

        // Attuned → the same door opens.
        q.world.globalFlags.attuned = true;
        q.act({ type: 'player', method: 'teleport', target: 'inner-sanctum', params: [SHRINE] });
        await flush();
        stepN(q.engine, 30);   // step THROUGH the transition
        expect(q.at(SHRINE).e).toBeCloseTo(12, 0);
        expect(q.events.some(e => e.kind === 'done' && e.anchor === 'inner-sanctum')).toBe(true);
    });

    it("bare coordinates are useless: no anchor in the hinted block → 'no-anchor'", async () => {
        const q = await boot();
        q.spp(HOME, 4, 4, 0.95);
        stepN(q.engine, 5);
        q.act({ type: 'player', method: 'teleport', target: 'nowhere', params: [[2049, 2048]] });
        await flush();
        stepN(q.engine, 5);
        expect(q.events.some(e => e.kind === 'denied' && e.reason === 'no-anchor')).toBe(true);
        expect(q.at(HOME).e).toBeCloseTo(4, 0);
    });
});

describe('teleport to an UNLOADED far block — raw resolution + hover safety net', () => {
    it('anchor found through the data source; player hovers awaiting ground', async () => {
        const q = await boot();
        // A far block the engine never injected — served only by the data source.
        (q.world as any).dataSource = {
            view: async (x: number, y: number) => [{
                x, y, isDraft: false,
                raw: [0, 1, [[AdjunctType.Trigger, [[[2, 2, 2], [6, 10, 0.5], [0, 0, 0], 1, 0, [], { name: 'far-shrine' }]]]], [], 0],
            }],
        };
        q.spp(HOME, 4, 4, 0.95);
        stepN(q.engine, 5);
        q.act({ type: 'player', method: 'teleport', target: 'far-shrine', params: [FAR] });
        await flush();
        stepN(q.engine, 30);   // step THROUGH the transition (unloaded-anchor resolve → swap)
        const p = q.at(FAR);
        expect(p.e).toBeCloseTo(6, 0);
        expect(p.n).toBeCloseTo(10, 0);
        // No block materialized there (headless: nobody serves block.need) —
        // the hover net holds the player instead of dropping them into the void.
        const before = q.at(FAR).alt;
        stepN(q.engine, 60);
        expect(Math.abs(q.at(FAR).alt - before), 'hovering, not free-falling').toBeLessThan(0.05);
    });
});
