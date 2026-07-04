import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { Coords } from '../utils/Coords';
import { makeRng } from '../motif/Rng';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { MahjongTileComponent, MahjongTableComponent, MahjongZone } from '../components/MahjongComponents';

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
 * The System owns the wall, four concealed hands, discards and the turn order.
 * Tiles are a2 box adjunct entities physically on the felt; lifecycle is the
 * mechanism — a draw SPAWNS a tile, a discard DESTROYS the hand tile and SPAWNS
 * a face-up tile in the pool (no runtime recolour needed). Each frame it writes
 * every live tile's TransformComponent (Septopus→engine) so VisualSync moves the
 * meshes — the same kinematic-driver slot as CoasterSystem/PoolSystem.
 *
 * Determinism: a seeded shuffle (makeRng) + a fixed bot policy (摸打 — discard the
 * tile just drawn) + dt-accumulated bot timer → same seed reproduces the game.
 * Scope is the SEAM, not legal mahjong: no win detection / scoring; play runs the
 * draw→discard loop until the wall is exhausted (流局).
 */
const KINDS = 34;            // 9×3 suits + 4 winds + 3 dragons
const COPIES = 4;            // four of each kind → 136 tiles
const HAND = 13;             // tiles dealt to each seat
const DISCARD_COLS = 6;      // discards laid out in rows of six

export interface MahjongConfig {
    block: [number, number];
    origin: [number, number];   // table centre, block-local SPP
    surfaceZ: number;           // felt top altitude (tile centre = this + tileH/2)
    seed: number;               // shuffle seed (deterministic)
    humanSeat?: number;         // default 0 (South)
    botDelay?: number;          // seconds a bot waits before discarding (default 0.6)
    tileW?: number; tileD?: number; tileH?: number;
    spacing?: number; handDist?: number; discDist?: number;
    /** kind(0..33) → face-image locator (content-addressed CID / data: URL). When
     *  set, a face-up tile shows its kind on the top face (box slot 7) so the game
     *  is READABLE; concealed tiles stay blank. Optional — without it tiles are
     *  plain cream boxes (the pre-readable behaviour). */
    faceCids?: string[];
}

export class MahjongSystem implements ISystem {
    private config: MahjongConfig | null = null;   // armed declaration (block + params)
    private tableEid: EntityId | null = null;       // live session (null = no session)
    private faceCids: string[] | null = null;
    private interactReader: import('../events/EventReader').EventReader<'interact.primary'> | null = null;

    // ── setup ────────────────────────────────────────────────────────────────

    /** Arm this block as a mahjong table. The deal/spawn happens when the player
     *  ENTERS Game mode in this block, and tears down on leaving (Game exit / step
     *  off the block → GameZoneSystem reverts to Normal) — the game is scoped to
     *  the zone, so walking away ends it cleanly with nothing left to evict (#3).
     *  The armed config persists across eviction so re-entry deals a fresh game. */
    public configure(world: World, config: MahjongConfig): void {
        this.endSession(world);
        this.config = config;
        this.syncSession(world); // deal immediately if already in Game mode here
    }

    /** Reconcile the live game with "should there be one?" = armed + Game mode +
     *  our block IS the active session's block + that block is still loaded (keyed
     *  on world.activeGameBlock, not the player's live position, so a 'confirm'
     *  round survives stepping off; the load guard cleans up on evict). Called
     *  every frame + on (re)arm. */
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

    /** Build the table, shuffle + deal, spawn the hand tiles, and start the human's
     *  turn (draw to 14, then await a discard). */
    private startSession(world: World): void {
        const config = this.config;
        if (!config) return;
        const blockEid = this.findBlock(world, config.block);
        if (blockEid == null) return;
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;

        const humanSeat = config.humanSeat ?? 0;
        this.faceCids = config.faceCids ?? null;
        const rng = makeRng(config.seed);

        // Fixed identity: tileId → kind (four of each), then a seeded draw order.
        const kinds: number[] = [];
        for (let k = 0; k < KINDS; k++) for (let c = 0; c < COPIES; c++) kinds.push(k);
        const order: number[] = kinds.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {            // Fisher–Yates
            const j = Math.floor(rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        const hands: number[][] = [[], [], [], []];
        for (let r = 0; r < HAND; r++) for (let s = 0; s < 4; s++) hands[s].push(order.shift()!);

        const table: MahjongTableComponent = {
            block: config.block,
            cx: config.origin[0], cy: config.origin[1],
            seats: 4, humanSeat,
            kinds, wall: order, hands, discards: [[], [], [], []],
            turn: humanSeat, lastDiscard: null, phase: 'playing',
            botTimer: 0, botDelay: config.botDelay ?? 0.6,
            surfaceZ: config.surfaceZ,
            tileW: config.tileW ?? 0.24, tileD: config.tileD ?? 0.36, tileH: config.tileH ?? 0.14,
            spacing: config.spacing ?? 0.28, handDist: config.handDist ?? 1.7, discDist: config.discDist ?? 0.5,
        };
        this.tableEid = world.createEntity();
        world.addComponent(this.tableEid, 'MahjongTableComponent', table);

        // Spawn the dealt hands, then start the human's turn (draws the 14th tile).
        for (let s = 0; s < 4; s++) for (const tid of hands[s]) this.spawnTile(world, blockEid, table, tid, 'hand', s);
        this.recomputeSlots(world, table);
        this.beginTurn(world, table, humanSeat);
    }

    /** Human discard (the only externally-driven action). Refused unless it's the
     *  human's turn, the game is live, and the tile is actually in their hand. */
    public discard(world: World, tileId: number): boolean {
        const table = this.findTable(world);
        if (!table || table.phase !== 'playing' || table.turn !== table.humanSeat) return false;
        if (!table.hands[table.humanSeat].includes(tileId)) return false;
        this.applyDiscard(world, table, table.humanSeat, tileId);
        this.advanceTurn(world, table);
        return true;
    }

    /** Diagnostics / tests. */
    public snapshot(world: World): MahjongTableComponent | null {
        return this.findTable(world);
    }

    // ── per-frame ──────────────────────────────────────────────────────────────

    public update(world: World, dt: number): void {
        this.syncSession(world); // start/stop the game on Game-mode / zone transitions
        const table = this.findTable(world);
        if (!table) return;

        // Human discards by clicking one of their hand tiles (interact.primary).
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
        }
        if (this.interactReader) {
            const blocked = world.mode === SystemMode.Edit || world.mode === SystemMode.Ghost;
            for (const ev of this.interactReader.read()) {
                if (blocked || table.phase !== 'playing' || table.turn !== table.humanSeat) continue;
                const tc = world.getComponent<MahjongTileComponent>((ev as any).target, 'MahjongTileComponent');
                if (tc && tc.zone === 'hand' && tc.seat === table.humanSeat) { this.discard(world, tc.tileId); break; }
            }
        }

        // Bot turns: think for botDelay, then play 摸打 (discard the drawn tile).
        if (table.phase === 'playing' && table.turn !== table.humanSeat) {
            table.botTimer -= dt;
            if (table.botTimer <= 0) this.doBotTurn(world, table);
        }

        // Drive the meshes: write every live tile's transform (only when it moved).
        const elevation = this.blockElevation(world, table.block);
        for (const eid of world.getEntitiesWith(['MahjongTileComponent', 'TransformComponent'])) {
            const tc = world.getComponent<MahjongTileComponent>(eid, 'MahjongTileComponent')!;
            const t = world.getComponent<TransformComponent>(eid, 'TransformComponent')!;
            const spp = this.layoutPos(table, tc);
            const e = Coords.septopusToEngine(spp, table.block);
            e[1] += elevation;
            if (Math.abs(e[0] - t.position[0]) > 1e-4 || Math.abs(e[1] - t.position[1]) > 1e-4 || Math.abs(e[2] - t.position[2]) > 1e-4) {
                t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2]; t.dirty = true;
            }
        }
    }

    // ── turn loop ────────────────────────────────────────────────────────────────

    /** Start `seat`'s turn: draw one from the wall (spawns its tile). A bot then
     *  arms its think timer; the human is left holding 14 to await a discard. */
    private beginTurn(world: World, table: MahjongTableComponent, seat: number): void {
        table.turn = seat;
        if (table.wall.length === 0) { table.phase = 'over'; return; }
        const blockEid = this.findBlock(world, table.block);
        if (blockEid == null) return;
        const tid = table.wall.shift()!;
        table.hands[seat].push(tid);
        this.spawnTile(world, blockEid, table, tid, 'hand', seat);
        this.recomputeSlots(world, table);
        if (seat !== table.humanSeat) table.botTimer = table.botDelay;
    }

    private doBotTurn(world: World, table: MahjongTableComponent): void {
        const seat = table.turn;
        const hand = table.hands[seat];
        if (hand.length > 0) this.applyDiscard(world, table, seat, hand[hand.length - 1]); // 摸打
        this.advanceTurn(world, table);
    }

    private advanceTurn(world: World, table: MahjongTableComponent): void {
        if (table.phase !== 'playing') return;
        this.beginTurn(world, table, (table.turn + 1) % table.seats);
    }

    /** Move a tile from a hand to the discard pool: destroy the (maybe face-down)
     *  hand entity and spawn a face-up tile in the pool. */
    private applyDiscard(world: World, table: MahjongTableComponent, seat: number, tileId: number): void {
        const hand = table.hands[seat];
        const idx = hand.indexOf(tileId);
        if (idx < 0) return;
        hand.splice(idx, 1);
        table.discards[seat].push(tileId);
        table.lastDiscard = tileId;
        this.destroyTile(world, tileId);
        const blockEid = this.findBlock(world, table.block);
        if (blockEid != null) this.spawnTile(world, blockEid, table, tileId, 'discard', seat);
        this.recomputeSlots(world, table);
    }

    // ── tiles (entity lifecycle) ──────────────────────────────────────────────

    private spawnTile(world: World, blockEid: EntityId, table: MahjongTableComponent, tileId: number, zone: MahjongZone, seat: number): void {
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;
        const faceUp = zone === 'discard' ? true : seat === table.humanSeat;
        const rz = seat === 1 || seat === 3 ? Math.PI / 2 : 0;          // E/W seats turn 90°
        const resId = faceUp ? 10 : 1;                                  // 10 cream face · 1 dark back (vs blue felt)
        const raw: any[] = [[table.tileW, table.tileD, table.tileH], [table.cx, table.cy, table.surfaceZ + table.tileH / 2], [0, 0, rz], resId, [1, 1], 0, 0];
        // Readable face: a face-up tile (your hand + every discard) carries its
        // kind's image in box slot 7 (content-addressed). Concealed tiles get none.
        const kind = table.kinds[tileId];
        const face = faceUp ? this.faceCids?.[kind] : undefined;
        if (face) raw.push(face);
        const eid = bs.spawnAdjunct(world, blockEid, AdjunctType.Box, raw);
        if (eid == null) return;
        // Transient game pieces — keep them out of block serialization.
        const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
        if (adj?.stdData) {
            (adj.stdData as any).derivedFrom = 'mahjong';
            // The face image is a label: fit it 0..1 onto the tile face rather than
            // size-tiling it (a 0.24×0.36 m face would otherwise crop the glyph).
            if (face && adj.stdData.material) adj.stdData.material.fit = true;
        }
        world.addComponent<MahjongTileComponent>(eid, 'MahjongTileComponent', {
            tileId, kind: table.kinds[tileId], zone, seat, slot: 0, faceUp,
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
     *  so layout follows the current hands/discards. */
    private recomputeSlots(world: World, table: MahjongTableComponent): void {
        const byTile = new Map<number, MahjongTileComponent>();
        for (const eid of world.getEntitiesWith(['MahjongTileComponent'])) {
            const tc = world.getComponent<MahjongTileComponent>(eid, 'MahjongTileComponent')!;
            byTile.set(tc.tileId, tc);
        }
        for (let s = 0; s < table.seats; s++) {
            table.hands[s].forEach((tid, i) => { const tc = byTile.get(tid); if (tc) { tc.zone = 'hand'; tc.seat = s; tc.slot = i; } });
            table.discards[s].forEach((tid, i) => { const tc = byTile.get(tid); if (tc) { tc.zone = 'discard'; tc.seat = s; tc.slot = i; } });
        }
    }

    // ── layout / helpers ──────────────────────────────────────────────────────

    /** Septopus block-local position for a tile, from its zone/seat/slot. */
    private layoutPos(table: MahjongTableComponent, tc: MahjongTileComponent): [number, number, number] {
        const z = table.surfaceZ + table.tileH / 2;
        const sp = table.spacing;
        if (tc.zone === 'hand') {
            const n = table.hands[tc.seat].length;
            const off = (tc.slot - (n - 1) / 2) * sp;
            switch (tc.seat) {
                case 0: return [table.cx + off, table.cy - table.handDist, z];
                case 2: return [table.cx - off, table.cy + table.handDist, z];
                case 1: return [table.cx + table.handDist, table.cy + off, z];
                default: return [table.cx - table.handDist, table.cy - off, z];
            }
        }
        const col = tc.slot % DISCARD_COLS, row = Math.floor(tc.slot / DISCARD_COLS);
        const c = (col - (DISCARD_COLS - 1) / 2) * sp;
        const r = table.discDist + row * (table.tileD + 0.04);
        switch (tc.seat) {
            case 0: return [table.cx + c, table.cy - r, z];
            case 2: return [table.cx - c, table.cy + r, z];
            case 1: return [table.cx + r, table.cy + c, z];
            default: return [table.cx - r, table.cy - c, z];
        }
    }

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
