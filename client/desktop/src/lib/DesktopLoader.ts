/**
 * DesktopLoader — chain-free engine loader for the desktop 3D client.
 *
 * This is the pure-3D counterpart of app/src/SandboxLoader.ts: it boots the
 * Septopus ECS engine and feeds it block data, but has NO dependency on the
 * chain (no @solana/*, no SeptopusContract) and NO IPFS. Block data comes from
 * the engine's local mocks.
 *
 * Roadmap (see docs/plan/STANDALONE_ENGINE_ROADMAP.md):
 *   - `fetchBlock` is the single data seam. Today it returns local mocks;
 *     Phase 1 swaps in a LocalDataSource backed by DraftStorage so locally
 *     edited blocks persist and reload.
 *   - "Publish selected block on-chain" stays out of this client; it belongs
 *     to an optional chain plugin (IChainPublisher) that the editor build adds.
 */
import { Engine } from '@engine/Engine';
import { TransformComponent } from '@engine/core/components/PlayerComponents';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';
import { fetchMockBlock } from '@engine/core/mocks/BlockMocks';
import { IDataSource } from '@engine/core/services/DataSource';
import { buildParkourBlock, PARKOUR_START } from '@engine/core/levels/parkour';
import { buildCoasterBlock, COASTER_START } from '@engine/core/levels/coaster';
import { Coords } from '@engine/core/utils/Coords';

import { DEFAULT_PLAYER_STATE } from '../Constants';

// Demo fixtures (client/desktop/public/assets) wired through the model/texture
// pipeline so `npm run dev` shows real network-loaded models + textures. Each
// model file is loaded ONCE and instanced per placement; textures are shared.
const DEMO_BLOCK: [number, number] = [2048, 2048];
const DEMO_TEXTURE_ID = 7;  // → /assets/checker.png

// Resource id → model record. Real Khronos sample assets (helmet = complex PBR
// with baked textures; fox = rigged + animated, exercises SkeletonUtils.clone).
const DEMO_AVATAR_ID = 30;  // → /assets/avatar.glb (rigged human)
const DEMO_MODELS: Record<number, { type: string; format: string; raw: string }> = {
    27: { type: 'module', format: 'gltf', raw: '/assets/pyramid.gltf' },
    28: { type: 'module', format: 'glb', raw: '/assets/helmet.glb' },
    29: { type: 'module', format: 'glb', raw: '/assets/fox.glb' },
    30: { type: 'avatar', format: 'glb', raw: '/assets/avatar.glb' },
    31: { type: 'audio', format: 'wav', raw: '/assets/ding.wav' },
};

export interface SPPPlayerState {
    block: [number, number];
    world: string | number;
    position: [number, number, number]; // [X, Y, Z] (X=East, Y=North, Z=Alt)
    rotation: [number, number, number]; // [X, Y, Z] (Euler Z-Up)
    stop: { on: boolean; adjunct: string; index: number };
    extend: number;
    posture: number;
}

export class DesktopLoader implements IDataSource {
    public engine: Engine | null = null;

    /** `?level=<name>` selects an authored level instead of the demo court. */
    private level = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('level') : null;
    private isParkour = this.level === 'parkour';
    private isCoaster = this.level === 'coaster';

    /** True while the player stands in a playable (game-enabled) block — the
     *  precondition the UI gates Game-mode entry on (set by game.zone_enter/exit). */
    private _gameZone = false;
    public get gameZoneActive(): boolean { return this._gameZone; }
    private _onZone: ((active: boolean) => void) | null = null;
    /** Subscribe to game-zone enter/exit (one consumer: useEngine). */
    public onZoneChange(cb: (active: boolean) => void): void { this._onZone = cb; }

    /** Active world mode, mirrored from the engine's system.mode event (the engine
     *  is the source of truth — it can refuse/auto-revert a requested switch). */
    private _mode: 'normal' | 'edit' | 'game' | 'ghost' | 'observe' = 'normal';
    public get currentMode() { return this._mode; }
    private _onMode: ((m: string) => void) | null = null;
    /** Subscribe to engine-confirmed mode changes (one consumer: useEngine). */
    public onModeChange(cb: (m: string) => void): void { this._onMode = cb; }

    /** Is the coaster level active? (ride it in Game mode). */
    public get coasterActive(): boolean { return this.isCoaster; }
    /** True once the coaster ride reaches the end. */
    public get coasterComplete(): boolean {
        return this.engine?.getWorld()?.globalFlags?.coaster_complete === true;
    }

    /** Is the parkour level active? (drives the parkour HUD). */
    public get parkourActive(): boolean { return this.isParkour; }

    /** True once the player reaches the finish (the level-complete flag). */
    public get levelComplete(): boolean {
        return this.engine?.getWorld()?.globalFlags?.level_complete === true;
    }

    /** Best parkour completion time (seconds), persisted in DraftStore meta;
     *  loaded at boot, null until a run is finished. */
    private parkourBestTime: number | null = null;
    public get parkourBest(): number | null { return this.parkourBestTime; }

    /** Record a finishing time; persists + returns true if it's a new best. */
    public recordParkourTime(seconds: number): boolean {
        const isRecord = this.parkourBestTime === null || seconds < this.parkourBestTime;
        if (isRecord) {
            this.parkourBestTime = seconds;
            this.engine?.getWorld()?.draftStore.saveMeta(0, 'parkour_best', seconds);
        }
        return isRecord;
    }

    private loadedBlockKeys: Set<string> = new Set();
    private fetchingBlockKeys: Set<string> = new Set();
    private blockLastSeen: Map<string, number> = new Map();
    /** Evict blocks that have been outside the view window longer than this (ms). */
    private static readonly EVICT_TTL_MS = 10_000;

    public playerState: SPPPlayerState = { ...DEFAULT_PLAYER_STATE };

    // ── IDataSource ───────────────────────────────────────────────────────────

    public async world(_index: number): Promise<any> {
        // Local Genesis world config + a demo avatar resource so the player has a
        // real (network-loaded) body instead of the placeholder box.
        const cfg = JSON.parse(JSON.stringify(MockWorldNormal));
        if (cfg.player?.avatar) cfg.player.avatar.resource = DEMO_AVATAR_ID;
        return cfg;
    }

    public async view(_x: number, _y: number, _ext: number, _worldIndex: number): Promise<any> {
        // Neighborhood fetching is driven by handleGridRequest below.
        return null;
    }

    public async module(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            if (DEMO_MODELS[id]) out[id] = DEMO_MODELS[id];
        }
        return out;
    }

    public async texture(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            if (id === DEMO_TEXTURE_ID) out[id] = { type: 'texture', format: 'png', raw: '/assets/checker.png', repeat: [1, 1] };
        }
        return out;
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    public async init(containerId: string, ui?: any) {
        if (this.engine) return;

        this.engine = new Engine(containerId, { api: this, ui });

        this.engine.on('block.need', (payload) => {
            this.handleGridRequest(payload.center);
        });
        this.engine.on('player.state', (state) => {
            this._saveState(state);
        });

        // Game-zone gating: the engine derives "player is in a playable block"
        // from the block.game flag and announces it here. The UI uses this to
        // offer Game-mode entry only inside a playable zone (no free toggle).
        this.engine.on('game.zone_enter', () => { this._gameZone = true; this._onZone?.(true); });
        this.engine.on('game.zone_exit', () => { this._gameZone = false; this._onZone?.(false); });

        // Engine is the source of truth for the active mode (it can refuse a
        // requested switch — e.g. Game outside a zone, or an auto zone-exit).
        this.engine.on('system.mode', (p: any) => {
            this._mode = p?.mode ?? this._mode;
            this._onMode?.(this._mode);
        });

        // Link/QR adjunct (e1): clicking one fires interact.primary with the hit
        // entity; open its URL. The engine carries the data + interaction, the
        // client performs the DOM action (window.open stays out of the engine).
        this.engine.on('interact.primary', (_payload: any, ev: any) => {
            const target = ev?.target;
            if (target === undefined || !this.engine) return;
            const adj = this.engine.getWorld()?.getComponent(target, 'AdjunctComponent') as any;
            const url = adj?.stdData?.url;
            if (typeof url === 'string' && /^https?:\/\//.test(url)) {
                window.open(url, '_blank', 'noopener');
            }
        });

        // Parkour starts on the course's start platform (not the demo/saved spawn).
        if (this.isParkour) {
            this.playerState = {
                ...this.playerState,
                block: PARKOUR_START.block, position: PARKOUR_START.position, rotation: PARKOUR_START.rotation,
            };
        } else if (this.isCoaster) {
            this.playerState = {
                ...this.playerState,
                block: COASTER_START.block, position: COASTER_START.position, rotation: COASTER_START.rotation,
            };
        }

        // Boot at the demo spawn as the FALLBACK; durable persistence (player
        // location, inventory, session) lives in the engine and is restored by
        // hydrateDrafts below, overriding this when a saved location exists.
        await this.engine.bootWorld(0, this.playerState);

        // P1 persistence: pull every saved draft into the sync cache BEFORE the
        // first block materializes (BlockSystem swaps drafts in synchronously),
        // and restore the player's persisted location/inventory/session.
        await this.engine.hydrateDrafts(0);

        // Parkour: load the persisted best time for the HUD.
        if (this.isParkour) {
            const best = await this.engine.getWorld()?.draftStore.loadMeta(0, 'parkour_best');
            if (typeof best === 'number') this.parkourBestTime = best;
        }

        // Offer the demo 3D models to the editor palette's module picker.
        this.engine.setModuleCatalog(
            Object.entries(DEMO_MODELS)
                .filter(([, m]) => m.type === 'module')
                .map(([id, m]) => ({
                    id: Number(id),
                    label: (m.raw.split('/').pop() || `model ${id}`).replace(/\.[^.]+$/, ''),
                })),
        );

        // The engine now holds the authoritative player location (restored, or
        // the fallback spawn). Mirror it locally and preload the neighborhood
        // around the block the player will actually appear in.
        const authored = this.isParkour ? PARKOUR_START : this.isCoaster ? COASTER_START : null;
        const restored = this.engine.getPlayerSppLocation();
        if (restored && !authored) {
            this.playerState = {
                ...this.playerState,
                block: restored.block, position: restored.position, rotation: restored.rotation,
            };
        } else if (authored) {
            // Authored levels restart at their start on every load — force it,
            // ignoring any saved position hydrateDrafts may have restored.
            const w = this.engine.getWorld() as any;
            const pid = w?.queryEntities('TransformComponent', 'InputStateComponent')[0];
            const t = pid !== undefined ? w.getComponent(pid, 'TransformComponent') : null;
            if (t) {
                const e = Coords.sppToEngine(authored.position, authored.block);
                t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2]; t.dirty = true;
            }
        }

        const initialBKey = `${this.playerState.block[0]}_${this.playerState.block[1]}`;
        const blockReadyPromise = new Promise<void>((resolve) => {
            // block.loaded fires ONCE per block (when its last adjunct mesh is
            // built); the typed queue routes it by the stable block key.
            this.engine?.on('block.loaded', () => resolve(), { key: `blk:${initialBKey}`, once: true });
            // Failsafe: proceed after 3s even if the ready signal never fires.
            setTimeout(resolve, 3000);
        });

        // Inject the initial neighborhood BEFORE starting physics (prevents falling).
        console.log(`[Loader] Pre-loading initial neighborhood for ${initialBKey}...`);
        await this.handleGridRequest(this.playerState.block);

        this.engine.start();

        await blockReadyPromise;
        console.log('[Loader] World Ready.');

        this.startEnvironmentClock();
    }

    /**
     * Mock chain-height clock (the engine is chain-decoupled, so there is no real
     * slot feed). The old engine derived time+weather from each new block height +
     * hash; here a ticker bumps a synthetic height every few seconds and feeds it
     * to EnvironmentSystem, so the sun arcs across a ~2-minute day/night cycle and
     * weather cycles. Replace with a real chain-height subscription when the chain
     * plugin ships.
     */
    private envHeight = 0;
    private envTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly ENV_TICK_MS = 2000;
    private static readonly ENV_INTERVAL = 1440; // game-seconds per tick (24 game-min) → ~120s/day

    private startEnvironmentClock() {
        if (this.envTimer) return;
        const tick = () => {
            this.envHeight += 1;
            this.engine?.feedChainState(this.envHeight, this.mockHash(this.envHeight), DesktopLoader.ENV_INTERVAL);
        };
        tick(); // kick once so time starts advancing from boot, not after the first delay
        this.envTimer = setInterval(tick, DesktopLoader.ENV_TICK_MS);
    }

    /**
     * Synthetic block hash whose weather slices (chars 12–15, per
     * EnvironmentSystem.simulateWeatherHash) cycle clear → cloud → rain → snow
     * every 10 ticks, so weather visibly changes in the no-chain client.
     */
    private mockHash(height: number): string {
        const catIdx = Math.floor(height / 10) % 4;          // 0 clear · 1 cloud · 2 rain · 3 snow
        const catHex = catIdx.toString(16).padStart(2, '0'); // occupies hash chars [12,13]
        return '0x' + 'a'.repeat(10) + catHex + '02' + 'a'.repeat(48);
    }

    private async handleGridRequest(center: [number, number]) {
        if (!this.engine) return;
        const extend = this.playerState.extend;
        const requiredKeys: string[] = [];

        for (let dx = -extend; dx <= extend; dx++) {
            for (let dy = -extend; dy <= extend; dy++) {
                requiredKeys.push(`${center[0] + dx}_${center[1] + dy}`);
            }
        }

        (this.engine.getWorld() as any)?.blocks.syncVisibility(requiredKeys);

        // Hide-then-timestamp-then-evict: in-window blocks are kept fresh; blocks
        // that have been OUT of the window past the TTL are destroyed to bound memory
        // (recently-left blocks stay loaded+hidden for instant re-entry).
        const now = Date.now();
        const required = new Set(requiredKeys);
        for (const k of requiredKeys) this.blockLastSeen.set(k, now);
        for (const k of [...this.loadedBlockKeys]) {
            if (required.has(k)) continue;
            if (now - (this.blockLastSeen.get(k) ?? now) > DesktopLoader.EVICT_TTL_MS) {
                const [ex, ey] = k.split('_').map(Number);
                this.engine.removeBlock(ex, ey);
                this.loadedBlockKeys.delete(k);
                this.blockLastSeen.delete(k);
            }
        }

        const missing = requiredKeys.filter(k => !this.loadedBlockKeys.has(k) && !this.fetchingBlockKeys.has(k));
        if (missing.length === 0) return;

        missing.forEach(k => this.fetchingBlockKeys.add(k));

        const results = await Promise.all(missing.map(k => {
            const [cx, cy] = k.split('_').map(Number);
            return this.fetchBlock(cx, cy);
        }));

        results.forEach(data => {
            this.engine?.injectBlock({ ...data, adjuncts: data.raw });
            const key = `${data.x}_${data.y}`;
            this.loadedBlockKeys.add(key);
            this.fetchingBlockKeys.delete(key);
        });
    }

    // The single data seam. Chain-free: always local mock.
    // (Phase 1 of the decoupling plan replaces this with a DraftStorage-backed
    // LocalDataSource so edited blocks persist.)
    private async fetchBlock(x: number, y: number): Promise<any> {
        // Parkour mode: serve the course segment for course blocks (and an empty
        // block elsewhere). Match the mock's { x, y, raw } shape.
        if (this.isParkour) {
            return { x, y, raw: buildParkourBlock(x, y) };
        }
        // Coaster mode: the spawn block holds the b6 coaster source; elsewhere empty.
        if (this.isCoaster) {
            const raw = (x === COASTER_START.block[0] && y === COASTER_START.block[1])
                ? buildCoasterBlock() : [0, 1, [], []];
            return { x, y, raw };
        }
        const data = await fetchMockBlock(x, y);
        if (x === DEMO_BLOCK[0] && y === DEMO_BLOCK[1]) this.injectDemoAssets(data);
        return data;
    }

    /**
     * Demo only: splice a few model instances + textured boxes into the spawn
     * block so the model/texture pipeline is visible in `npm run dev`. The 3
     * pyramids share ONE model file (load-once, instance-many); the wall + floor
     * slab share ONE texture (shared by reference, tiled by size-derived UVs).
     */
    private injectDemoAssets(data: any) {
        // [size, offset, rot, RESOURCE_ID, animate, stop]. oz lifts the base just
        // above ground (avoids coplanar z-fighting). Box size is matched to each
        // model's natural aspect so the per-axis scale-to-fit stays ~uniform (no
        // stretching) — pyramids are symmetric; helmet ≈ cubic; fox is elongated.
        // rot = [pitch(x), YAW(y, around vertical), roll(z)] — distinct yaw per
        // instance so you can see rotation correctly applied to loaded models and
        // view each from a different side. Applied AFTER scale-to-fit, so an
        // aspect-matched (≈uniform) model rotates cleanly with no shear.
        const Y = Math.PI;
        const modules = [
            // 3 pyramids share one .gltf (load-once, instance-many) — south row,
            // keeping the north half of the block clear for the trigger court.
            [[2, 2, 3], [3, 1.2, 1.55], [0, 0.4, 0], 27, 0, 0],
            [[2, 2, 3], [8, 1.2, 1.55], [0, Y / 4, 0], 27, 0, 0],
            [[2, 2, 3], [13, 1.2, 1.55], [0, -0.6, 0], 27, 0, 0],
            // 2 damaged helmets (complex PBR) share one .glb — aspect ≈ cubic
            [[3.15, 3.33, 3.0], [6, 3, 1.55], [0, 0.6, 0], 28, 0, 0],
            [[3.15, 3.33, 3.0], [10, 3, 1.55], [0, -Y / 3, 0], 28, 0, 0],
            // 2 foxes (rigged) share one .glb — aspect ~1 : 6 : 3 (W:N:Alt)
            [[0.64, 3.92, 2.0], [2, 6, 1.05], [0, Y / 2, 0], 29, 0, 0],
            [[0.64, 3.92, 2.0], [14, 8, 1.05], [0, Y, 0], 29, 0, 0],
        ];
        const texturedBoxes = [
            // [size, pos, rot, colorIdx, repeat, animate, stop, TEXTURE_ID]
            [[6, 0.3, 4], [12, 5, 2], [0, 0, 0], 0, [1, 1], 0, 0, DEMO_TEXTURE_ID],     // wall
            [[6, 6, 0.3], [3, 4, 0.15], [0, 0, 0], 0, [1, 1], 0, 0, DEMO_TEXTURE_ID],   // floor slab
        ];
        // Stop adjuncts (colliders). Format: [size, offset, rot, mode, animate]
        // SPP coords: X=East Y=North Z=Alt. This wall sits at N=5, E=1..15,
        // south of the spawn pillar — the southern showcase stays fenced off.
        const stops = [
            [[14, 0.4, 2.5], [8, 5, 1.25], [0, 0, 0], 1, 0],
        ];
        data.raw[2].push([0x00a4, modules]);
        data.raw[2].push([0x00a2, texturedBoxes]);
        data.raw[2].push([0x00b4, stops]);

        // ── Trigger court (north half of the spawn block) ────────────────────
        // Interactive trigger test scene; everything gives VISIBLE feedback via
        // adjunct actions and writes a flag the e2e suite can assert.
        // gameOnly=0 everywhere so it runs in Normal (browse) mode.
        //
        // adjunct action targets use the stable id adj_{x}_{y}_{typeIdDec}_{idx}:
        // a1 wall=161, a6 cone=166, a7 ball=167.

        // Reactors (visible objects the triggers manipulate):
        const walls = [
            // #0 auto door (adj_2048_2048_161_0): slides up when the player stands
            //    on the blue pad, slides back when they leave (airlock feel).
            [[4, 0.4, 3], [8, 13, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
            // #1 conditional door (adj_2048_2048_161_1): only opens if the cone
            //    button was touched first (flags.demo_touch) — opens once.
            [[3, 0.4, 3], [14, 14, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
            // #2 key door (adj_2048_2048_161_2): opens once when the player walks
            //    up CARRYING the key item (inventory.tpl_2 — pick it up first).
            [[3, 0.4, 3], [2, 14, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
        ];
        // Pickable items (b5): [pos, templateId, seed, count, rot]. Click to pick
        // up (Normal/Game mode); the bag panel lists them; drop puts them back.
        const items = [
            [[5, 8, 0.6], 1, 9347, 1, [0, 0, 0]],     // gem (unique, seed-derived rarity)
            [[6.5, 8, 0.6], 1, 777, 1, [0, 0, 0]],    // another gem, different roll
            [[12, 8, 0.5], 2, 0, 1, [0, 0, 0]],       // the KEY for door #2
            [[13.5, 8, 0.5], 3, 41, 2, [0, 0, 0]],    // 2 potions (stackable)
        ];
        const cones = [
            // touch button (adj_2048_2048_166_0): each click spins it visibly.
            [[1.2, 1.2, 1.6], [12, 10.5, 0.8], [0, 0, 0], 0, [1, 1], 0, 0],
        ];
        const balls = [
            // hold-lift ball (adj_2048_2048_167_0): rises while you camp the pad.
            // stop=1: standable — jump on and ride it up (moving-platform carry).
            [[1, 1, 1], [3, 12, 3], [0, 0, 0], 0, [1, 1], 0, 1],
        ];
        // Floor pads marking each invisible volume (colors from basic_box palette:
        // 1 dark-gray, 2 blue, 3 red).
        const markers = [
            [[4, 4.5, 0.05], [8, 11.25, 0.1], [0, 0, 0], 2, [1, 1], 0, 0],   // blue: auto door
            [[3, 3, 0.05], [3, 10.5, 0.1], [0, 0, 0], 3, [1, 1], 0, 0],      // red: hold lift
            [[2.2, 2, 0.05], [14.2, 12, 0.1], [0, 0, 0], 1, [1, 1], 0, 0],   // gray: conditional door
        ];
        data.raw[2].push([0x00a1, walls]);
        data.raw[2].push([0x00b5, items]);

        // String-particle hut (b6): two 4m cells expanded by the engine into
        // standard walls + a cell trigger. Faces are [state, variant] in
        // ParticleFace order [Top, Bottom, Front(S), Back(N), Left(W), Right(E)];
        // state 1=Closed 0=Open; closed variants: 0 solid · 1 doorway · 2 window.
        // Cell A: window south, sealed elsewhere, open passage east to B.
        // Cell B: doorway north (player side), interior trigger sets spp_hut.
        const particles = [
            [[1, 2.5, 0], [
                {
                    position: [0, 0, 0], level: 0,
                    faces: [[1, 0], [0, 0], [1, 2], [1, 0], [1, 0], [0, 0]],
                },
                {
                    position: [1, 0, 0], level: 0,
                    faces: [[1, 0], [0, 0], [1, 0], [1, 1], [0, 0], [1, 0]],
                    trigger: [
                        { type: 'in', actions: [{ type: 'flag', method: '', target: 'spp_hut', params: [true] }] },
                    ],
                },
            ], 'basic'],
        ];
        data.raw[2].push([0x00b6, particles]);
        data.raw[2].push([0x00a6, cones]);
        data.raw[2].push([0x00a7, balls]);
        data.raw[2].push([0x00a2, markers]);

        // Trigger volumes (b8). Row format: [size, offset, rot, shape, gameOnly, events].
        const triggers = [
            // ① auto door pad (blue): in→open+demo_gate, out→close, hold 800ms→demo_hold.
            //    Tall (alt 0..6): the player descends from the 6m spawn pillar while
            //    walking north, so the volume must catch a falling crossing too.
            //    Deep (N 9..13.5): reaches past the door line so it stays open
            //    while you walk through.
            [[4, 4.5, 6], [8, 11.25, 3], [0, 0, 0], 1, 0, [
                {
                    type: 'in', actions: [
                        { type: 'adjunct', target: 'adj_2048_2048_161_0', method: 'moveZ', params: [3.2] },
                        { type: 'flag', method: '', target: 'demo_gate', params: [true] },
                    ]
                },
                {
                    type: 'out', actions: [
                        { type: 'adjunct', target: 'adj_2048_2048_161_0', method: 'moveZ', params: [-3.2] },
                        { type: 'flag', method: '', target: 'demo_gate', params: [false] },
                    ]
                },
                {
                    type: 'hold', holdDuration: 800, actions: [
                        { type: 'flag', method: '', target: 'demo_hold', params: [true] },
                    ]
                },
            ]],
            // ② touch button: clicking the (invisible) volume around the cone spins
            //    it and sets demo_touch — which also arms the conditional door.
            //    Top at alt 3.2: the first-person eye ray sits at ~2.6 (player
            //    0.9 + 1.7), so the volume must reach above it to catch a level
            //    center-screen click.
            [[2, 2, 3.2], [12, 10.5, 1.6], [0, 0, 0], 1, 0, [
                {
                    type: 'touch', actions: [
                        { type: 'adjunct', target: 'adj_2048_2048_166_0', method: 'rotateY', params: [0.8] },
                        { type: 'flag', method: '', target: 'demo_touch', params: [true] },
                        { type: 'sound', target: 31, method: 'play', params: [0.8] },
                    ]
                },
            ]],
            // ③ hold-lift pad (red): camp 1.5s and the ball rises one notch;
            //    leave + re-enter to lift again (hold re-arms per stay).
            [[3, 3, 4], [3, 10.5, 2], [0, 0, 0], 1, 0, [
                {
                    type: 'hold', holdDuration: 1500, actions: [
                        { type: 'adjunct', target: 'adj_2048_2048_167_0', method: 'moveZ', params: [0.8] },
                        { type: 'flag', method: '', target: 'demo_lift', params: [true] },
                    ]
                },
            ]],
            // ④ conditional door pad (gray): JSONLogic gate on demo_touch; opens the
            //    far door ONCE (oneTime) — fallback just logs until the button is hit.
            [[2.2, 2, 4], [14.2, 12, 2], [0, 0, 0], 1, 0, [
                {
                    type: 'in', oneTime: true,
                    conditions: { '==': [{ var: 'flags.demo_touch' }, true] },
                    actions: [
                        { type: 'adjunct', target: 'adj_2048_2048_161_1', method: 'moveZ', params: [3.2] },
                        { type: 'flag', method: '', target: 'demo_chain', params: [true] },
                    ],
                    fallbackActions: [
                        { type: 'system', method: 'log', target: '', params: ['conditional door: touch the cone button first (demo_touch)'] },
                    ]
                },
            ]],
            // ⑤ key door pad: opens door #2 ONCE if the player carries the key
            //    item (inventory.tpl_2 ≥ 1 — pick it up at [12, 8] first).
            [[3, 2.5, 4], [2, 12.5, 2], [0, 0, 0], 1, 0, [
                {
                    type: 'in', oneTime: true,
                    conditions: { '>=': [{ var: 'inventory.tpl_2' }, 1] },
                    actions: [
                        { type: 'adjunct', target: 'adj_2048_2048_161_2', method: 'moveZ', params: [3.2] },
                        { type: 'flag', method: '', target: 'demo_key_door', params: [true] },
                    ],
                    fallbackActions: [
                        { type: 'system', method: 'log', target: '', params: ['key door: pick up the key first (inventory.tpl_2)'] },
                    ]
                },
            ]],
        ];
        data.raw[2].push([0x00b8, triggers]);
    }

    /** Drop one of an inventory item at the player's feet (atomic, see ItemSystem). */
    public dropItem(itemId: string, count = 1): boolean {
        return this.engine?.dropItem(itemId, count) ?? false;
    }

    // ── World export / import (P1) ─────────────────────────────────────────────

    /** All local drafts of the world as a versioned JSON string. */
    public exportWorldJson(worldId = 0): Promise<string> {
        if (!this.engine) return Promise.reject(new Error('engine not booted'));
        return this.engine.exportWorldJson(worldId);
    }

    /** Import a previously exported JSON string; reload to see restored blocks. */
    public importWorldJson(json: string): Promise<{ worldId: number; imported: number }> {
        if (!this.engine) return Promise.reject(new Error('engine not booted'));
        return this.engine.importWorldJson(json);
    }

    /** Convenience: trigger a browser download of the current world export. */
    public async downloadWorldExport(worldId = 0): Promise<void> {
        const json = await this.exportWorldJson(worldId);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `septopus-world-${worldId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Player / view controls ─────────────────────────────────────────────────

    public setPlayerMoveIntent(x: number, y: number) {
        this.engine?.setMoveIntent(x, y);
    }

    public toggleEditMode(active: boolean) {
        this.engine?.setEditMode(active);
    }

    /** Request a world-mode switch: normal / edit / game / ghost / observe.
     *  Returns whether the engine accepted it (Game is refused outside a zone).
     *  The actual UI state follows the engine's system.mode event, not this call. */
    public setMode(mode: 'normal' | 'edit' | 'game' | 'ghost' | 'observe'): boolean {
        return this.engine?.setMode(mode as any) ?? false;
    }

    public setCameraView(mode: 'first' | 'third') {
        this.engine?.setCameraView(mode);
    }

    /** Toggle first/third-person; returns the new mode. */
    public toggleCameraView(): 'first' | 'third' | undefined {
        return this.engine?.toggleCameraView();
    }

    public triggerPlayerJump() {
        this.engine?.jump();
    }

    public getPlayerRotationY(): number {
        if (!this.engine) return 0;
        const world = this.engine.getWorld();
        if (!world) return 0;
        const players = world.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        if (players.length === 0) return 0;
        const t = world.getComponent<TransformComponent>(players[0], 'TransformComponent');
        return t ? t.rotation[1] : 0;
    }

    public getLoadedBlockCount(): number {
        return this.loadedBlockKeys.size;
    }

    // ── Minimap ─────────────────────────────────────────────────────────────────

    public toggleMinimap(active: boolean) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        (world as any).pipeline.isMinimapActive = active;
        if (active) (world as any).minimap.setFollow(true);
    }

    public applyMinimapZoom(delta: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const currentZone = (world as any).minimap.zoom;
        (world as any).minimap.zoom = Math.max(0.2, Math.min(10, currentZone + delta));
    }

    public panMinimap(dx: number, dy: number) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        if (!world) return;
        const scale = (120 / 600) / (world as any).minimap.zoom;
        (world as any).minimap.applyPan(dx * scale, dy * scale);
        (world as any).minimap.setFollow(false);
    }

    public pickMinimapBlock(ndcX: number, ndcY: number) {
        if (!this.engine) return null;
        return (this.engine.getWorld() as any)?.minimap.pickBlockFromMinimap(ndcX, ndcY);
    }

    public resetMinimapFollow() {
        if (this.engine) (this.engine.getWorld() as any)?.minimap.setFollow(true);
    }

    // ── Persistence ──────────────────────────────────────────────────────────────

    // Live mirror of the player's location for the minimap/HUD/extend bookkeeping.
    // Durable persistence is engine-owned now (DraftStore meta 'player', restored
    // by Engine.hydrateDrafts) — this no longer writes to localStorage.
    private _saveState(partial: Partial<SPPPlayerState>) {
        this.playerState = { ...this.playerState, ...partial };
        if (!this.playerState.extend || this.playerState.extend < 2) {
            this.playerState.extend = 2;
        }
    }
}
