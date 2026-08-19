import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { makeRng } from '../motif/Rng';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import {
    MahjongTileComponent, MahjongTableComponent, MahjongZone,
    TableMeld, ClaimOffer, MahjongResult,
} from '../components/MahjongComponents';
import {
    Kind, Meld, KINDS, COPIES, HAND_SIZE, tally, freshWallKinds,
    isWinningHand, canPon, canKan, canRon, chiOptions, concealedKans, addedKans,
    scoreHand, settle, chooseDiscard, decideClaim, BotView,
} from '../mahjong';

/**
 * MahjongSystem — a real, in-world 3D mahjong table (Plan B, the adversarial
 * second native case after the pool).
 *
 * Pool was the EASY native case: continuous physics is exactly what a per-frame
 * System does naturally. Mahjong is the opposite shape — DISCRETE, turn-based,
 * hidden information, no integration to run. If the same seam (entity = adjunct,
 * System = logic, interaction via the bus) carries this too, the pattern is
 * proven general rather than a physics engine in disguise.
 *
 * The System owns the wall, four hands, melds, discards and the turn order.
 * Tiles are a2 box adjunct entities physically on the felt; lifecycle is the
 * mechanism — a draw SPAWNS a tile, a discard DESTROYS the hand tile and SPAWNS
 * a face-up tile in the pool. Each frame it writes every live tile's
 * TransformComponent (Septopus→engine) so VisualSync moves the meshes — the same
 * kinematic-driver slot as CoasterSystem/PoolSystem.
 *
 * RULES LIVE IN `core/mahjong/`, not here. This file is the table: seating,
 * geometry, entity lifecycle, the turn/claim state machine, and the bot clock.
 * Whether a hand wins, what it is worth, whether a call is legal and which tile
 * a bot throws are all questions asked of the rule core, which the external-app
 * mahjong (Pattern A) shares — so the two can never drift apart.
 *
 * Determinism: a seeded shuffle (makeRng) + a deterministic bot policy +
 * dt-accumulated timers → the same seed reproduces the same game.
 */

/** Discards are laid out in rows of six, as on a real table. */
const DISCARD_COLS = 6;

export interface MahjongConfig {
    block: [number, number];
    origin: [number, number];   // table centre, block-local SPP
    surfaceZ: number;           // felt top altitude (tile centre = this + tileH/2)
    seed: number;               // shuffle seed (deterministic)
    humanSeat?: number;         // default 0 (the south side of the table)
    botDelay?: number;          // seconds a bot waits before acting (default 0.7)
    claimWindow?: number;       // seconds the human has to call (default 6)
    /** 起胡番数 — the smallest hand worth declaring (default 2, so the 1-番
     *  鸡和 never ends a table). Set 1 to allow anything. */
    minFan?: number;
    tileW?: number; tileD?: number; tileH?: number;
    spacing?: number; handDist?: number; discDist?: number; meldGap?: number;
    roundWind?: number;         // 27..30, default 東
    /** kind(0..33) → face-image locator (content-addressed CID / data: URL). When
     *  set, a face-up tile shows its kind on its faces (box slot 7) so the game
     *  is READABLE; concealed tiles stay blank. Optional. */
    faceCids?: string[];
    /** Image for a CONCEALED tile's back. Without it concealed tiles are a flat
     *  colour — fine for tests, but a rack of plain blocks on the felt. */
    backCid?: string;
}

/** Seat geometry: unit vectors for "away from centre" and "along the row". */
const SEAT_AXES: { nx: number; ny: number; rx: number; ry: number }[] = [
    { nx: 0, ny: -1, rx: 1, ry: 0 },   // 0 — south side, row runs east
    { nx: 1, ny: 0, rx: 0, ry: 1 },    // 1 — east side, row runs north
    { nx: 0, ny: 1, rx: -1, ry: 0 },   // 2 — north side, row runs west
    { nx: -1, ny: 0, rx: 0, ry: -1 },  // 3 — west side, row runs south
];

export class MahjongSystem implements ISystem {
    private config: MahjongConfig | null = null;   // armed declaration (block + params)
    private tableEid: EntityId | null = null;       // live session (null = no session)
    private faceCids: string[] | null = null;
    private backCid: string | null = null;
    private minFan = 2;
    private interactReader: import('../events/EventReader').EventReader<'interact.primary'> | null = null;

    // ── setup ────────────────────────────────────────────────────────────────

    /** Arm this block as a mahjong table. The deal/spawn happens when the player
     *  ENTERS Game mode in this block, and tears down on leaving (Game exit / step
     *  off the block → GameZoneSystem reverts to Normal) — the game is scoped to
     *  the zone, so walking away ends it cleanly with nothing left to evict.
     *  The armed config persists across eviction so re-entry deals a fresh game. */
    public configure(world: World, config: MahjongConfig): void {
        this.endSession(world);
        this.config = config;
        this.syncSession(world); // deal immediately if already in Game mode here
    }

    /** Reconcile the live game with "should there be one?" = armed + Game mode +
     *  our block IS the active session's block + that block is still loaded. */
    private syncSession(world: World): void {
        const c = this.config;
        const a = world.activeGameBlock;
        const want = c != null
            && world.mode === SystemMode.Game
            && a != null && a[0] === c.block[0] && a[1] === c.block[1]
            && this.findBlock(world, c.block) != null;
        if (want && this.tableEid == null) this.startSession(world);
        else if (!want && this.tableEid != null) this.endSession(world);
    }

    /** Build the table, shuffle + deal, spawn the hand tiles, and start the
     *  dealer's turn (draw to 14, then await a discard). */
    private startSession(world: World): void {
        const config = this.config;
        if (!config) return;
        const blockEid = this.findBlock(world, config.block);
        if (blockEid == null) return;
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;

        const humanSeat = config.humanSeat ?? 0;
        this.faceCids = config.faceCids ?? null;
        this.backCid = config.backCid ?? null;
        this.minFan = config.minFan ?? 2;
        const rng = makeRng(config.seed);

        // Fixed identity: tileId → kind (four of each), then a seeded draw order.
        const kinds = freshWallKinds();
        const order: number[] = kinds.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {            // Fisher–Yates
            const j = Math.floor(rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        const hands: number[][] = [[], [], [], []];
        for (let r = 0; r < HAND_SIZE; r++) for (let s = 0; s < 4; s++) hands[s].push(order.shift()!);

        const roundWind = config.roundWind ?? 27;
        const table: MahjongTableComponent = {
            block: config.block,
            cx: config.origin[0], cy: config.origin[1],
            seats: 4, humanSeat,
            kinds, wall: order, hands, melds: [[], [], [], []], discards: [[], [], [], []],
            turn: humanSeat, drawnTile: null, lastDiscard: null, lastDiscardSeat: -1,
            phase: 'turn',
            botTimer: 0, botDelay: config.botDelay ?? 0.7,
            humanOffers: [], botOffers: [],
            claimTimer: 0, claimWindow: config.claimWindow ?? 6,
            roundWind, seatWinds: [0, 1, 2, 3].map((s) => 27 + ((s + 4 - humanSeat) % 4)),
            scores: [0, 0, 0, 0], afterKan: false, result: null,
            surfaceZ: config.surfaceZ,
            tileW: config.tileW ?? 0.24, tileD: config.tileD ?? 0.34, tileH: config.tileH ?? 0.16,
            spacing: config.spacing ?? 0.26, handDist: config.handDist ?? 1.55,
            discDist: config.discDist ?? 0.55, meldGap: config.meldGap ?? 0.34,
        };
        this.tableEid = world.createEntity();
        world.addComponent(this.tableEid, 'MahjongTableComponent', table);

        for (let s = 0; s < 4; s++) for (const tid of hands[s]) this.spawnTile(world, blockEid, table, tid, 'hand', s);
        this.sortHand(table, humanSeat);
        this.recomputeSlots(world, table);
        this.beginTurn(world, table, humanSeat);
    }

    // ── the human's moves ─────────────────────────────────────────────────────

    /** Discard `tileId` from the human's hand. Refused unless it is their turn. */
    public discard(world: World, tileId: number): boolean {
        const table = this.findTable(world);
        if (!table || table.phase !== 'turn' || table.turn !== table.humanSeat) return false;
        if (!table.hands[table.humanSeat].includes(tileId)) return false;
        this.applyDiscard(world, table, table.humanSeat, tileId);
        return true;
    }

    /** Take one of the offers currently open to the human (碰/杠/吃/胡/自摸/暗杠). */
    public claim(world: World, action: ClaimOffer['action'], kinds?: number[]): boolean {
        const table = this.findTable(world);
        if (!table || table.phase === 'over') return false;
        const offer = table.humanOffers.find((o) => o.action === action
            && (kinds == null || (o.kinds ?? []).join() === kinds.join()));
        if (!offer) return false;
        table.humanOffers = [];
        this.execute(world, table, offer);
        return true;
    }

    /** Decline every open offer — the discard passes to the next seat. */
    public pass(world: World): boolean {
        const table = this.findTable(world);
        if (!table || table.humanOffers.length === 0) return false;
        table.humanOffers = [];
        if (table.phase === 'claim') this.resolveClaims(world, table);
        return true;
    }

    /** Diagnostics / tests / HUD. */
    public snapshot(world: World): MahjongTableComponent | null {
        return this.findTable(world);
    }

    // ── per-frame ──────────────────────────────────────────────────────────────

    public update(world: World, dt: number): void {
        this.syncSession(world); // start/stop the game on Game-mode / zone transitions
        const table = this.findTable(world);
        if (!table) return;

        // The human discards by clicking one of their hand tiles.
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
        }
        if (this.interactReader) {
            const blocked = world.mode === SystemMode.Edit || world.mode === SystemMode.Ghost;
            for (const ev of this.interactReader.read()) {
                if (blocked || table.phase !== 'turn' || table.turn !== table.humanSeat) continue;
                const tc = world.getComponent<MahjongTileComponent>((ev as any).target, 'MahjongTileComponent');
                if (tc && tc.zone === 'hand' && tc.seat === table.humanSeat) { this.discard(world, tc.tileId); break; }
            }
        }

        if (table.phase === 'claim') {
            // The human's window: bots have already decided, so the only thing the
            // clock is waiting for is the player. Timing out = passing.
            table.claimTimer -= dt;
            if (table.humanOffers.length === 0 || table.claimTimer <= 0) {
                table.humanOffers = [];
                this.resolveClaims(world, table);
            }
        } else if (table.phase === 'turn' && table.turn !== table.humanSeat) {
            table.botTimer -= dt;
            if (table.botTimer <= 0) this.doBotTurn(world, table);
        }

        // Drive the meshes: write every live tile's transform (only when it moved).
        const elevation = this.blockElevation(world, table.block);
        for (const eid of world.getEntitiesWith(['MahjongTileComponent', 'TransformComponent'])) {
            const tc = world.getComponent<MahjongTileComponent>(eid, 'MahjongTileComponent')!;
            const t = world.getComponent<TransformComponent>(eid, 'TransformComponent')!;
            const spp = this.layoutPos(table, tc);
            const e = world.metrics.septopusToEngine(spp, table.block);
            e[1] += elevation;
            if (Math.abs(e[0] - t.position[0]) > 1e-4 || Math.abs(e[1] - t.position[1]) > 1e-4 || Math.abs(e[2] - t.position[2]) > 1e-4) {
                t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2]; t.dirty = true;
            }
        }
    }

    // ── turn loop ────────────────────────────────────────────────────────────────

    /** Start `seat`'s turn by drawing from the wall. An empty wall ends the hand
     *  in a draw (流局). After the draw the seat may win, kan, or discard. */
    private beginTurn(world: World, table: MahjongTableComponent, seat: number): void {
        table.turn = seat;
        table.lastDiscard = null;
        if (table.wall.length === 0) { this.endInDraw(world, table); return; }
        const blockEid = this.findBlock(world, table.block);
        if (blockEid == null) return;

        const tid = table.wall.shift()!;
        table.hands[seat].push(tid);
        table.drawnTile = tid;
        table.phase = 'turn';
        this.spawnTile(world, blockEid, table, tid, 'hand', seat);
        if (seat !== table.humanSeat) this.sortHand(table, seat);
        this.recomputeSlots(world, table);

        const offers = this.drawOffers(table, seat);
        if (seat === table.humanSeat) {
            table.humanOffers = offers;                 // tsumo / ankan buttons light up
        } else if (offers.length > 0) {
            // Bots take a win immediately; a kan waits out the think timer with
            // everything else so the table keeps a human rhythm.
            const win = offers.find((o) => o.action === 'tsumo');
            if (win) { this.execute(world, table, win); return; }
            table.botOffers = offers;
        }
        if (seat !== table.humanSeat) table.botTimer = table.botDelay;
    }

    /** What the seat on turn may declare using the tile it just drew. */
    private drawOffers(table: MahjongTableComponent, seat: number): ClaimOffer[] {
        const offers: ClaimOffer[] = [];
        const counts = this.handCounts(table, seat);
        if (isWinningHand(counts, this.ruleMelds(table, seat))
            && this.winValue(table, seat, counts, table.drawnTile != null ? table.kinds[table.drawnTile] : -1, true) >= this.minFan) {
            offers.push({ seat, action: 'tsumo' });
        }
        for (const k of concealedKans(counts)) offers.push({ seat, action: 'ankan', kinds: [k] });
        for (const k of addedKans(counts, this.ruleMelds(table, seat))) offers.push({ seat, action: 'kan', kinds: [k] });
        return offers;
    }

    private doBotTurn(world: World, table: MahjongTableComponent): void {
        const seat = table.turn;
        const pending = table.botOffers.find((o) => o.seat === seat);
        table.botOffers = [];
        if (pending && (pending.action === 'ankan' || pending.action === 'kan')) {
            this.execute(world, table, pending);
            return;
        }
        const kind = chooseDiscard(this.botView(table, seat));
        const tid = this.pickTileOfKind(table, seat, kind);
        if (tid == null) { this.endInDraw(world, table); return; }
        this.applyDiscard(world, table, seat, tid);
    }

    /** Move a tile from a hand to the discard pool, then open the claim window. */
    private applyDiscard(world: World, table: MahjongTableComponent, seat: number, tileId: number): void {
        const hand = table.hands[seat];
        const idx = hand.indexOf(tileId);
        if (idx < 0) return;
        hand.splice(idx, 1);
        table.discards[seat].push(tileId);
        table.lastDiscard = tileId;
        table.lastDiscardSeat = seat;
        table.drawnTile = null;
        table.afterKan = false;
        table.humanOffers = [];
        table.botOffers = [];
        this.sortHand(table, seat);
        this.destroyTile(world, tileId);
        const blockEid = this.findBlock(world, table.block);
        if (blockEid != null) this.spawnTile(world, blockEid, table, tileId, 'discard', seat);
        this.recomputeSlots(world, table);
        this.openClaims(world, table, seat, table.kinds[tileId]);
    }

    /**
     * Ask every other seat what it wants to do with the discard. Bots answer now
     * (deterministically); the human gets a timed window if they have any option
     * at all. With nothing to decide, play moves on in the same frame.
     */
    private openClaims(world: World, table: MahjongTableComponent, from: number, kind: Kind): void {
        const human: ClaimOffer[] = [];
        const bots: ClaimOffer[] = [];
        for (let s = 0; s < table.seats; s++) {
            if (s === from) continue;
            const counts = this.handCounts(table, s);
            const melds = this.ruleMelds(table, s);
            const mayChi = s === (from + 1) % table.seats;   // only the seat to the right
            const opts: ClaimOffer[] = [];
            if (canRon(counts, melds, kind)) {
                const withTile = counts.slice(); withTile[kind]++;
                if (this.winValue(table, s, withTile, kind, false) >= this.minFan) opts.push({ seat: s, action: 'ron' });
            }
            if (canKan(counts, kind)) opts.push({ seat: s, action: 'kan', kinds: [kind] });
            if (canPon(counts, kind)) opts.push({ seat: s, action: 'pon', kinds: [kind] });
            if (mayChi) for (const pair of chiOptions(counts, kind)) opts.push({ seat: s, action: 'chi', kinds: pair });
            if (opts.length === 0) continue;

            if (s === table.humanSeat) {
                human.push(...opts);
            } else {
                const view = this.botView(table, s);
                if (opts.some((o) => o.action === 'ron')) { bots.push({ seat: s, action: 'ron' }); continue; }
                const d = decideClaim(view, kind, mayChi);
                if (d.type === 'pass') continue;
                bots.push(d.type === 'chi'
                    ? { seat: s, action: 'chi', kinds: d.with }
                    : { seat: s, action: d.type, kinds: [kind] });
            }
        }
        table.botOffers = bots;
        table.humanOffers = human;
        if (human.length > 0) {
            table.phase = 'claim';
            table.claimTimer = table.claimWindow;
        } else {
            this.resolveClaims(world, table);
        }
    }

    /**
     * Settle the claim window: a win beats a kan/pon, which beats a chi; ties
     * between equal calls go to the seat closest in turn order after the
     * discarder. With no calls, the next seat draws.
     */
    private resolveClaims(world: World, table: MahjongTableComponent): void {
        const rank: Record<string, number> = { ron: 3, kan: 2, pon: 2, chi: 1 };
        const from = table.lastDiscardSeat;
        const all = table.botOffers.slice();
        table.botOffers = [];
        let best: ClaimOffer | null = null;
        for (const o of all) {
            if (!best) { best = o; continue; }
            const dr = (rank[o.action] ?? 0) - (rank[best.action] ?? 0);
            if (dr > 0) { best = o; continue; }
            if (dr < 0) continue;
            const seatOrder = (s: number) => (s - from + table.seats) % table.seats;
            if (seatOrder(o.seat) < seatOrder(best.seat)) best = o;
        }
        if (best) { this.execute(world, table, best); return; }
        table.phase = 'turn';
        this.beginTurn(world, table, (from + 1) % table.seats);
    }

    /** Carry out a claim/declaration. */
    private execute(world: World, table: MahjongTableComponent, offer: ClaimOffer): void {
        switch (offer.action) {
            case 'tsumo': return this.declareWin(world, table, offer.seat, true);
            case 'ron': return this.declareWin(world, table, offer.seat, false);
            case 'ankan': return this.doConcealedKan(world, table, offer.seat, offer.kinds![0]);
            case 'kan':
                // On a draw this is an upgrade of an existing pon; on a discard it
                // is a fresh open kan.
                return table.lastDiscard != null && table.turn !== offer.seat
                    ? this.doOpenMeld(world, table, offer.seat, 'kan', offer.kinds!)
                    : this.doAddedKan(world, table, offer.seat, offer.kinds![0]);
            case 'pon': return this.doOpenMeld(world, table, offer.seat, 'pon', offer.kinds!);
            case 'chi': return this.doOpenMeld(world, table, offer.seat, 'chi', offer.kinds!);
            default: return;
        }
    }

    // ── melds ─────────────────────────────────────────────────────────────────

    /** Claim the last discard into an exposed set. `need` is the kinds taken from
     *  hand (for chi the two run partners; for pon/kan the same kind ×2 or ×3). */
    private doOpenMeld(world: World, table: MahjongTableComponent, seat: number,
        type: 'pon' | 'kan' | 'chi', kinds: Kind[]): void {
        const claimedTid = table.lastDiscard;
        if (claimedTid == null) return;
        const from = table.lastDiscardSeat;
        const claimedKind = table.kinds[claimedTid];

        // Take the partner tiles out of the hand.
        const fromHand: number[] = [];
        const needed: Kind[] = type === 'chi'
            ? kinds.slice()
            : new Array(type === 'pon' ? 2 : 3).fill(claimedKind);
        for (const k of needed) {
            const tid = this.pickTileOfKind(table, seat, k, fromHand);
            if (tid == null) return;                       // shouldn't happen — legality was checked
            fromHand.push(tid);
        }
        for (const tid of fromHand) {
            const i = table.hands[seat].indexOf(tid);
            if (i >= 0) table.hands[seat].splice(i, 1);
        }

        // The claimed tile leaves the discarder's pool and joins the meld.
        const dp = table.discards[from];
        const di = dp.indexOf(claimedTid);
        if (di >= 0) dp.splice(di, 1);

        const tileIds = [...fromHand, claimedTid].sort((a, b) => table.kinds[a] - table.kinds[b]);
        table.melds[seat].push({ type, tileIds, from, claimed: claimedTid });

        // Respawn every tile in the meld face-up and flat.
        const blockEid = this.findBlock(world, table.block);
        for (const tid of tileIds) {
            this.destroyTile(world, tid);
            if (blockEid != null) this.spawnTile(world, blockEid, table, tid, 'meld', seat);
        }
        table.lastDiscard = null;
        table.humanOffers = [];
        table.botOffers = [];
        this.recomputeSlots(world, table);

        if (type === 'kan') { this.drawReplacement(world, table, seat); return; }

        // A claimer discards next — no draw. The human is simply left on turn.
        table.turn = seat;
        table.phase = 'turn';
        table.drawnTile = null;
        if (seat !== table.humanSeat) table.botTimer = table.botDelay;
    }

    private doConcealedKan(world: World, table: MahjongTableComponent, seat: number, kind: Kind): void {
        const tileIds: number[] = [];
        for (let i = 0; i < COPIES; i++) {
            const tid = this.pickTileOfKind(table, seat, kind, tileIds);
            if (tid == null) return;
            tileIds.push(tid);
        }
        for (const tid of tileIds) {
            const i = table.hands[seat].indexOf(tid);
            if (i >= 0) table.hands[seat].splice(i, 1);
        }
        table.melds[seat].push({ type: 'ankan', tileIds, from: seat, claimed: tileIds[0] });
        const blockEid = this.findBlock(world, table.block);
        for (const tid of tileIds) {
            this.destroyTile(world, tid);
            if (blockEid != null) this.spawnTile(world, blockEid, table, tid, 'meld', seat);
        }
        table.humanOffers = [];
        this.recomputeSlots(world, table);
        this.drawReplacement(world, table, seat);
    }

    /** Upgrade an existing pon to a kan with the fourth tile from hand. */
    private doAddedKan(world: World, table: MahjongTableComponent, seat: number, kind: Kind): void {
        const meld = table.melds[seat].find((m) => m.type === 'pon' && table.kinds[m.tileIds[0]] === kind);
        if (!meld) return;
        const tid = this.pickTileOfKind(table, seat, kind);
        if (tid == null) return;
        const i = table.hands[seat].indexOf(tid);
        if (i >= 0) table.hands[seat].splice(i, 1);
        meld.type = 'kan';
        meld.tileIds.push(tid);
        this.destroyTile(world, tid);
        const blockEid = this.findBlock(world, table.block);
        if (blockEid != null) this.spawnTile(world, blockEid, table, tid, 'meld', seat);
        table.humanOffers = [];
        this.recomputeSlots(world, table);
        this.drawReplacement(world, table, seat);
    }

    /** After any kan the seat draws a replacement tile and plays on. */
    private drawReplacement(world: World, table: MahjongTableComponent, seat: number): void {
        table.afterKan = true;
        this.beginTurn(world, table, seat);
        table.afterKan = true;   // beginTurn cleared nothing, but keep it explicit
    }

    // ── endings ──────────────────────────────────────────────────────────────

    /** 番 the hand would be worth — used both to gate a declaration on 起胡番数
     *  and to settle it, so a win is never offered that then scores differently. */
    private winValue(table: MahjongTableComponent, seat: number, counts: number[],
        winKind: Kind, selfDraw: boolean): number {
        return scoreHand({
            concealed: counts,
            melds: this.ruleMelds(table, seat),
            winTile: winKind,
            selfDraw,
            seatWind: table.seatWinds[seat],
            roundWind: table.roundWind,
            afterKan: table.afterKan,
            lastTile: table.wall.length === 0,
        }).total;
    }

    private declareWin(world: World, table: MahjongTableComponent, seat: number, selfDraw: boolean): void {
        const counts = this.handCounts(table, seat);
        let winKind: Kind;
        if (selfDraw) {
            winKind = table.drawnTile != null ? table.kinds[table.drawnTile] : -1;
        } else {
            winKind = table.lastDiscard != null ? table.kinds[table.lastDiscard] : -1;
            counts[winKind]++;                       // the claimed tile joins the hand
        }
        const score = scoreHand({
            concealed: counts,
            melds: this.ruleMelds(table, seat),
            winTile: winKind,
            selfDraw,
            seatWind: table.seatWinds[seat],
            roundWind: table.roundWind,
            afterKan: table.afterKan,
            lastTile: table.wall.length === 0,
        });
        const from = selfDraw ? -1 : table.lastDiscardSeat;
        const delta = settle(score, seat, from, table.seats);
        for (let s = 0; s < table.seats; s++) table.scores[s] += delta[s];

        const hand: number[] = [];
        for (let k = 0; k < KINDS; k++) for (let i = 0; i < counts[k]; i++) hand.push(k);
        const result: MahjongResult = {
            kind: selfDraw ? 'tsumo' : 'ron',
            winner: seat, from: from < 0 ? null : from,
            fan: score.fan, total: score.total, delta,
            hand, melds: table.melds[seat].slice(), winTile: winKind,
        };
        this.finish(world, table, result);
    }

    private endInDraw(world: World, table: MahjongTableComponent): void {
        this.finish(world, table, {
            kind: 'draw', winner: null, from: null, fan: [], total: 0,
            delta: [0, 0, 0, 0], hand: [], melds: [], winTile: null,
        });
    }

    /** Freeze the table, reveal every hand, and announce the result. */
    private finish(world: World, table: MahjongTableComponent, result: MahjongResult): void {
        table.phase = 'over';
        table.result = result;
        table.humanOffers = [];
        table.botOffers = [];
        table.drawnTile = null;
        // Reveal: respawn every concealed hand tile face-up so the table reads.
        const blockEid = this.findBlock(world, table.block);
        for (let s = 0; s < table.seats; s++) {
            if (s === table.humanSeat) continue;
            for (const tid of table.hands[s]) {
                this.destroyTile(world, tid);
                if (blockEid != null) this.spawnTile(world, blockEid, table, tid, 'hand', s, true);
            }
        }
        this.recomputeSlots(world, table);
        (world as any).events?.emit?.('mahjong.result', { result });
    }

    // ── tiles (entity lifecycle) ──────────────────────────────────────────────

    private spawnTile(world: World, blockEid: EntityId, table: MahjongTableComponent,
        tileId: number, zone: MahjongZone, seat: number, forceFaceUp = false): void {
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;
        const upright = zone === 'hand';
        const faceUp = forceFaceUp || zone !== 'hand' || seat === table.humanSeat;
        const kind = table.kinds[tileId];

        // Upright hand tiles stand on their long edge facing their own seat; flat
        // tiles lie face-up on the felt. Both are the SAME box turned to the seat
        // by yaw alone — swapping the footprint per seat instead would stretch the
        // fitted face image across the wrong axis and lay every glyph on its side.
        const size: [number, number, number] = upright
            ? [table.tileW, table.tileH, table.tileD]     // face is the ±Y pair, 0.24×0.34
            : [table.tileW, table.tileD, table.tileH];    // face is the top, same ratio
        const rot: [number, number, number] = [0, 0, seat * Math.PI / 2];
        const z = table.surfaceZ + (upright ? table.tileD / 2 : table.tileH / 2);

        const resId = faceUp ? 10 : 22;                  // ivory face · jade-green back
        const raw: any[] = [size, [table.cx, table.cy, z], rot, resId, [1, 1], 0, 0];
        const face = faceUp ? this.faceCids?.[kind] : (this.backCid ?? undefined);
        if (face) raw.push(face);
        const eid = bs.spawnAdjunct(world, blockEid, AdjunctType.Box, raw);
        if (eid == null) return;
        // Transient game pieces — keep them out of block serialization.
        const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
        if (adj?.stdData) {
            (adj.stdData as any).derivedFrom = 'mahjong';
            // The face image is a label: fit it 0..1 onto the tile rather than
            // size-tiling it (a 0.24×0.34 m face would otherwise crop the glyph).
            if (face && adj.stdData.material) adj.stdData.material.fit = true;
        }
        world.addComponent<MahjongTileComponent>(eid, 'MahjongTileComponent', {
            tileId, kind, zone, seat, slot: 0, faceUp, upright,
        });
    }

    private destroyTile(world: World, tileId: number): void {
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        for (const eid of world.getEntitiesWith(['MahjongTileComponent'])) {
            if (world.getComponent<MahjongTileComponent>(eid, 'MahjongTileComponent')!.tileId === tileId) {
                if (bs?.destroyAdjunct) bs.destroyAdjunct(world, eid); else world.destroyEntity?.(eid);
                return;
            }
        }
    }

    /** Re-index every live tile's (zone, seat, slot) from the authoritative arrays
     *  so layout follows the current hands/melds/discards. */
    private recomputeSlots(world: World, table: MahjongTableComponent): void {
        const byTile = new Map<number, MahjongTileComponent>();
        for (const eid of world.getEntitiesWith(['MahjongTileComponent'])) {
            const tc = world.getComponent<MahjongTileComponent>(eid, 'MahjongTileComponent')!;
            byTile.set(tc.tileId, tc);
        }
        for (let s = 0; s < table.seats; s++) {
            table.hands[s].forEach((tid, i) => {
                const tc = byTile.get(tid);
                if (tc) { tc.zone = 'hand'; tc.seat = s; tc.slot = i; tc.drawn = tid === table.drawnTile; }
            });
            let slot = 0;
            for (const m of table.melds[s]) for (const tid of m.tileIds) {
                const tc = byTile.get(tid);
                if (tc) { tc.zone = 'meld'; tc.seat = s; tc.slot = slot; }
                slot++;
            }
            table.discards[s].forEach((tid, i) => {
                const tc = byTile.get(tid);
                if (tc) { tc.zone = 'discard'; tc.seat = s; tc.slot = i; }
            });
        }
    }

    // ── layout ────────────────────────────────────────────────────────────────

    /** Septopus block-local position for a tile, from its zone/seat/slot. */
    private layoutPos(table: MahjongTableComponent, tc: MahjongTileComponent): [number, number, number] {
        const ax = SEAT_AXES[tc.seat] ?? SEAT_AXES[0];
        const z = table.surfaceZ + (tc.upright ? table.tileD / 2 : table.tileH / 2);
        const at = (dist: number, along: number): [number, number, number] =>
            [table.cx + ax.nx * dist + ax.rx * along, table.cy + ax.ny * dist + ax.ry * along, z];

        if (tc.zone === 'hand') {
            const n = table.hands[tc.seat].length;
            const meldWidth = table.melds[tc.seat].reduce((a, m) => a + m.tileIds.length, 0) * table.spacing;
            // Hands sit centred on the seat, shifted left by whatever the melds
            // take up on the right so the whole rack stays symmetric.
            const centre = -meldWidth / 2;
            let along = centre + (tc.slot - (n - 1) / 2) * table.spacing;
            if (tc.drawn) along += table.spacing * 0.55;   // the fresh tile stands apart
            return at(table.handDist, along);
        }
        if (tc.zone === 'meld') {
            const n = table.hands[tc.seat].length;
            const handWidth = n * table.spacing;
            const meldWidth = table.melds[tc.seat].reduce((a, m) => a + m.tileIds.length, 0) * table.spacing;
            const start = -meldWidth / 2 + handWidth / 2 + table.meldGap;
            return at(table.handDist, start + tc.slot * table.spacing);
        }
        const col = tc.slot % DISCARD_COLS, row = Math.floor(tc.slot / DISCARD_COLS);
        const along = (col - (DISCARD_COLS - 1) / 2) * table.spacing;
        const dist = table.discDist + row * (table.tileD + 0.03);
        return at(dist, along);
    }

    // ── rule-core adapters ────────────────────────────────────────────────────

    /** 34-histogram of a seat's concealed tiles. */
    private handCounts(table: MahjongTableComponent, seat: number): number[] {
        return tally(table.hands[seat].map((tid) => table.kinds[tid]));
    }

    /** Table melds → rule-core melds (kinds instead of tile ids). */
    private ruleMelds(table: MahjongTableComponent, seat: number): Meld[] {
        return table.melds[seat].map((m) => ({
            type: m.type,
            kinds: m.tileIds.map((t) => table.kinds[t]).sort((a, b) => a - b),
            from: m.from,
            claimed: table.kinds[m.claimed],
        }));
    }

    /** Everything a seat can legitimately see: all discards plus every exposed meld. */
    private botView(table: MahjongTableComponent, seat: number): BotView {
        const seen = new Array(KINDS).fill(0);
        for (let s = 0; s < table.seats; s++) {
            for (const tid of table.discards[s]) seen[table.kinds[tid]]++;
            for (const m of table.melds[s]) {
                if (m.type === 'ankan' && s !== seat) continue;   // concealed kan stays hidden
                for (const tid of m.tileIds) seen[table.kinds[tid]]++;
            }
        }
        // What each other seat has SHOWN — the defensive read. Own seat gets an
        // empty entry so indices stay seat-aligned for callers that need it.
        const threats = [];
        for (let s = 0; s < table.seats; s++) {
            threats.push(s === seat
                ? { discards: [], melds: 0 }
                : {
                    discards: table.discards[s].map((tid) => table.kinds[tid]),
                    melds: table.melds[s].filter((m) => m.type !== 'ankan').length,
                });
        }
        return { hand: this.handCounts(table, seat), melds: this.ruleMelds(table, seat), seen, threats };
    }

    /** A tile id of `kind` held by `seat`, skipping any already spoken for. */
    private pickTileOfKind(table: MahjongTableComponent, seat: number, kind: Kind, exclude: number[] = []): number | null {
        for (const tid of table.hands[seat]) {
            if (table.kinds[tid] === kind && !exclude.includes(tid)) return tid;
        }
        return null;
    }

    /** Keep a hand sorted by kind so the rack reads like a real one. The drawn
     *  tile is appended last by the caller and only merges in after the discard. */
    private sortHand(table: MahjongTableComponent, seat: number): void {
        table.hands[seat].sort((a, b) => table.kinds[a] - table.kinds[b] || a - b);
    }

    // ── world helpers ─────────────────────────────────────────────────────────

    private findTable(world: World): MahjongTableComponent | null {
        const eid = world.getEntitiesWith(['MahjongTableComponent'])[0];
        return eid != null ? world.getComponent<MahjongTableComponent>(eid, 'MahjongTableComponent') ?? null : null;
    }

    private findBlock(world: World, [bx, by]: [number, number]): EntityId | null {
        for (const eid of world.getEntitiesWith(['BlockComponent'])) {
            const b = world.getComponent<BlockComponent>(eid, 'BlockComponent');
            if (b?.x === bx && b?.y === by) return eid;
        }
        return null;
    }

    private blockElevation(world: World, block: [number, number]): number {
        const eid = this.findBlock(world, block);
        const b = eid != null ? world.getComponent<BlockComponent>(eid, 'BlockComponent') : null;
        return b?.elevation || 0;
    }

    /** End the live game: free every tile mesh + destroy the table entity. The
     *  armed config is kept, so re-entering the zone deals a fresh game. */
    private endSession(world: World): void {
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        for (const eid of world.getEntitiesWith(['MahjongTileComponent'])) {
            if (bs?.destroyAdjunct) bs.destroyAdjunct(world, eid); else world.destroyEntity?.(eid);
        }
        if (this.tableEid != null) world.destroyEntity?.(this.tableEid);
        this.tableEid = null;
        this.interactReader = null;
    }
}
