/**
 * DesktopLoader — chain-free engine loader for the desktop 3D client.
 *
 * This is the pure-3D counterpart of app/src/SandboxLoader.ts: it boots the
 * Septopus ECS engine and feeds it block data, but has NO dependency on the
 * chain (no @solana/*, no SeptopusContract) and NO IPFS. Block data comes from
 * the engine's local mocks.
 *
 * Roadmap (see docs/plan/STANDALONE_ENGINE_ROADMAP.md):
 *   - `LocalDataSource` is the single block-data seam: a mode-dispatched scene
 *     seed (mock/parkour/coaster + demo via sceneBlock) overlaid with the local
 *     draft store, so locally edited blocks persist and reload. Streaming and the
 *     2D map both read through it.
 *   - "Publish selected block on-chain" stays out of this client; it belongs
 *     to an optional chain plugin (IChainPublisher) that the editor build adds.
 */
import { Engine } from '@engine/Engine';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import { TransformComponent } from '@engine/core/components/PlayerComponents';
import { MockWorldNormal } from '@engine/core/mocks/WorldConfigs';
import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { IDataSource } from '@engine/core/services/DataSource';
import { LocalDataSource, SceneProvider } from '@engine/core/services/LocalDataSource';
import { buildParkourBlock, PARKOUR_START } from '@engine/core/levels/parkour';
import { buildCoasterBlock, COASTER_START } from '@engine/core/levels/coaster';
import { Coords } from '@engine/core/utils/Coords';
import type { GameSetting } from '@engine/core/types/GameSetting';
import type { IGameApi } from '@engine/core/services/IGameApi';
import { GAMES, gameById } from '../games/registry';
import { GameApiRouter } from '../games/GameApiRouter';
import { FetchGameApi } from '../games/FetchGameApi';
import { DEMO_BLOCK, DEMO_AVATAR_ID, DEMO_ASSETS, buildDemoScene } from '../scenes/demoScene';
import { MAHJONG_BLOCK, buildMahjongScene } from '../scenes/mahjongScene';
import { POOL_BLOCK, buildPoolScene } from '../scenes/poolScene';
import { MAZE_BLOCK, buildMazeScene } from '../scenes/mazeScene';
import { SANDBOX_BLOCK, SANDBOX_CENTER, buildSandboxScene, pickFace, pickFaceInCell, cellOfPoint, nextFace } from '../scenes/sandboxScene';
import { DYN_BLOCK, DYNAMIC_ADJUNCT_CODE, buildDynamicAdjunctScene } from '../scenes/dynamicAdjunctScene';
import { saveBlockDraft } from '@engine/core/utils/BlockSerializer';
import { WebSocketLiveSource } from './live/WebSocketLiveSource';
import { FakeWebSocket } from './live/FakeWebSocket';

import { DEFAULT_PLAYER_STATE } from '../Constants';

/** A block's 2D-map summary (render-layer only; see DesktopLoader.fetchMapCell). */
export interface MapCell {
    x: number;
    y: number;
    occupied: boolean;   // has any adjunct content
    count: number;       // adjunct instance count
    game: number;        // block.game flag (playable zone) — raw[4]
    elevation: number;   // block elevation — raw[0]
}

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

    /** Realtime transport (simulated WebSocket) feeding the engine's live channel.
     *  Also reachable as engine.live (the injected ILiveSource). */
    private _live: WebSocketLiveSource | null = null;

    /** True once the 3D pool table's balls are spawned (B-to-shoot enabled). */
    private _poolReady = false;

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

    /** One IGameApi injected into the engine, dispatching by game name to per-game
     *  backends (loopback mock, or networked FetchGameApi under `?mjserver`). The
     *  Game Setting `methods` whitelist is enforced by the engine before a call
     *  reaches it. Built in init() from the game registry. */
    private gameApi: IGameApi = new GameApiRouter({});
    /** Active game name + its latest state (null when no game is running). The engine
     *  is the source of truth (game.started/ended carry the name). Generic — each
     *  game's HUD reads/casts gameState as it needs. */
    private _activeGame: string | null = null;
    private _gameState: any = null;
    public get activeGame(): string | null { return this._activeGame; }
    public get gameState(): any { return this._gameState; }
    /** Back-compat alias for the mahjong HUD/e2e. */
    public get mahjongState(): any { return this._activeGame === 'mahjong' ? this._gameState : null; }
    private _onGameState: ((game: string | null, s: any) => void) | null = null;
    /** Subscribe to active-game state updates (consumer: useEngine → GameHUD). */
    public onGameStateChange(cb: (game: string | null, s: any) => void): void { this._onGameState = cb; }

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
    /** Block-data seam: unifies the scene seed (mock/parkour/coaster + demo) with
     *  the local draft overlay. Built once draftStore is hydrated (see init). */
    private localData: LocalDataSource | null = null;

    public playerState: SPPPlayerState = { ...DEFAULT_PLAYER_STATE };

    // ── IDataSource ───────────────────────────────────────────────────────────

    public async world(_index: number): Promise<any> {
        // Local Genesis world config + a demo avatar resource so the player has a
        // real (network-loaded) body instead of the placeholder box.
        const cfg = JSON.parse(JSON.stringify(MockWorldNormal));
        if (cfg.player?.avatar) cfg.player.avatar.resource = DEMO_AVATAR_ID;
        return cfg;
    }

    public async view(x: number, y: number, ext: number, _worldIndex: number): Promise<any> {
        // Effective neighbourhood window (scene seed + local draft overlay) from
        // the unified block seam. handleGridRequest drives streaming through the
        // same LocalDataSource; this method makes the IDataSource seam callable
        // too (e.g. the 2D map / tooling), no longer dead.
        return this.localData ? this.localData.view(x, y, ext) : null;
    }

    public async module(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            const rec = await this.ingestAsset(id);
            if (rec && rec.type !== 'texture') out[id] = rec;
        }
        return out;
    }

    public async texture(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            const rec = await this.ingestAsset(id);
            if (rec && rec.type === 'texture') out[id] = rec;
        }
        return out;
    }

    /** Resource record cache: resource id → { type, format, raw=CID, repeat? }. */
    private _resCatalog = new Map<number, { type: string; format: string; raw: string; repeat?: [number, number] }>();

    /**
     * Resolve a resource id to a content-addressed record, ingesting it into the
     * IPFS store on first use ("ipfs add"): fetch the seed file → put bytes into
     * engine.ipfs → CID. Thereafter all bytes are fetched through the router by
     * CID — no hardcoded path leaves this method. Returns null for unknown ids.
     */
    private async ingestAsset(id: number) {
        const cached = this._resCatalog.get(id);
        if (cached) return cached;
        const asset = DEMO_ASSETS.find((a) => a.id === id);
        const router = this.engine?.ipfs;
        if (!asset || !router) return null;
        const resp = await fetch(asset.src);
        if (!resp.ok) throw new Error(`[DesktopLoader] asset fetch failed: ${asset.src} (${resp.status})`);
        const cid = await router.put(new Uint8Array(await resp.arrayBuffer()));
        const rec = { type: asset.type, format: asset.format, raw: cid, ...(asset.repeat ? { repeat: asset.repeat } : {}) };
        this._resCatalog.set(id, rec);
        return rec;
    }

    /** Resolve a Game Setting resource (game.md §2): a playable block carries a
     *  registered game's id in its `game` field. Looked up in the game registry. */
    public async gameSetting(id: number): Promise<GameSetting | null> {
        return gameById(id)?.setting ?? null;
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    public async init(containerId: string, ui?: any) {
        if (this.engine) return;

        // Build one transport per registered game and route by name. `?mjserver`
        // dials each game's real server (FetchGameApi → its baseurl); otherwise the
        // in-page loopback mock (offline). Existing demo/e2e behaviour preserved.
        const useServer = typeof location !== 'undefined'
            && new URLSearchParams(location.search).has('mjserver');
        const backends: Record<string, IGameApi> = {};
        for (const g of GAMES) {
            backends[g.name] = useServer
                ? new FetchGameApi(g.setting.baseurl ?? `/api/${g.name}`)
                : g.makeLoopback();
        }
        this.gameApi = new GameApiRouter(backends);

        // Realtime transport: a (currently simulated) WebSocket implements the
        // engine's ILiveSource. Swap FakeWebSocket → new WebSocket(url) to go live;
        // the engine side (LiveSystem → world.events) is unchanged.
        this._live = new WebSocketLiveSource(new FakeWebSocket());

        this.engine = new Engine(containerId, { api: this, ui, gameApi: this.gameApi, liveSource: this._live });

        this.engine.on('block.need', (payload) => {
            this.handleGridRequest(payload.center);
        });
        this.engine.on('player.state', (state) => {
            this._saveState(state);
        });

        // Live content channel: the server pushes { adjunctId, hash } on the
        // 'motif' topic → the motif swaps its texture to that IPFS hash and
        // re-expands → the image updates live. The adjunct never touches a socket.
        this._live.subscribe('motif');
        this.engine.on('live.message', (payload: any) => {
            this.applyLiveMotifUpdate(payload?.data);
        }, { key: 'motif' });

        // 3D pool: when the pool table block materializes, build the physical balls
        // (PoolSystem owns the physics). Press B to break/shoot toward where the
        // camera faces. The 2D Game-Setting HUD stays an orthogonal way to play.
        this.engine.on('block.loaded', () => this.setupPool3D(), { key: `blk:${POOL_BLOCK[0]}_${POOL_BLOCK[1]}`, once: true });
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
                if (e.code === 'KeyB' && this._poolReady) this.poolShootFromCamera();
            });
        }

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

        // Game runtime lifecycle (game.md §5): the engine resolved the block's
        // Game Setting and called the whitelisted `start`; its response is the
        // opening board. `end` (on leaving) tears the session down. The HUD
        // mirrors `_gameState` and drives moves through world.gameRuntime.call.
        this.engine.on('game.started', (p: any) => {
            this._activeGame = p?.game ?? null;
            this._gameState = p?.session ?? null;
            this._onGameState?.(this._activeGame, this._gameState);
        });
        this.engine.on('game.ended', () => {
            this._activeGame = null;
            this._gameState = null;
            this._onGameState?.(null, null);
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

        // Dynamic adjuncts: run the sandboxed declarative code and register it by
        // type-id BEFORE any block streams in, so a block authoring that id can
        // resolve it. Browser-only (Web Worker) — guarded so a failure here never
        // blocks boot for the built-in scenes.
        try {
            await this.engine.loadDynamicAdjunct(DYNAMIC_ADJUNCT_CODE);
        } catch (e) {
            console.warn('[Loader] dynamic adjunct load failed (sandbox unavailable?):', e);
        }

        // P1 persistence: pull every saved draft into the sync cache BEFORE the
        // first block materializes (BlockSystem swaps drafts in synchronously),
        // and restore the player's persisted location/inventory/session.
        await this.engine.hydrateDrafts(0);

        // The unified block seam: one SceneProvider (mode-dispatched seed) + the
        // now-hydrated DraftStore. All block streaming flows through this.
        this.localData = new LocalDataSource(
            { block: (x, y) => this.sceneBlock(x, y) } as SceneProvider,
            this.engine.getWorld()!.draftStore,
            0,
        );

        // Parkour: load the persisted best time for the HUD.
        if (this.isParkour) {
            const best = await this.engine.getWorld()?.draftStore.loadMeta(0, 'parkour_best');
            if (typeof best === 'number') this.parkourBestTime = best;
        }

        // Offer the demo 3D models to the editor palette's module picker.
        this.engine.setModuleCatalog(
            DEMO_ASSETS
                .filter((a) => a.type === 'module')
                .map((a) => ({
                    id: a.id,
                    label: (a.src.split('/').pop() || `model ${a.id}`).replace(/\.[^.]+$/, ''),
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

        // Bounded window — match the old engine's cross() algorithm: any loaded
        // block OUTSIDE the required window is evicted IMMEDIATELY, so the resident
        // set stays exactly (2*extend+1)^2 regardless of how far/fast the player
        // roams. A wall-clock TTL grace used to live here ("keep recently-left
        // blocks for instant re-entry"); under fast traversal (running, coaster
        // rides, teleport) the player crosses many blocks within the grace, so the
        // set ballooned into the hundreds — which is what tanked the frame rate.
        const required = new Set(requiredKeys);
        for (const k of [...this.loadedBlockKeys]) {
            if (required.has(k)) continue;
            const [ex, ey] = k.split('_').map(Number);
            this.engine.removeBlock(ex, ey);
            this.loadedBlockKeys.delete(k);
        }

        const missing = requiredKeys.filter(k => !this.loadedBlockKeys.has(k));
        if (missing.length === 0 || !this.localData) return;

        // Pull the effective window (scene seed + draft overlay) from the unified
        // seam in ONE call, then inject only the not-yet-resident blocks. Wiring
        // view() this way retires the inline three-source fetch dispatch.
        const missingSet = new Set(missing);
        for (const block of this.localData.view(center[0], center[1], extend)) {
            const key = `${block.x}_${block.y}`;
            if (!missingSet.has(key)) continue;
            this.engine.injectBlock({ x: block.x, y: block.y, adjuncts: block.raw, elevation: block.raw[0] });
            this.loadedBlockKeys.add(key);
        }
    }

    /**
     * SceneProvider seed: the base (authored/procedural) raw for a block, BEFORE
     * local drafts (LocalDataSource overlays those). Dispatches the three base
     * sources by the world's fixed level — the former fetchBlock body, sync.
     */
    private sceneBlock(x: number, y: number): any[] {
        // Parkour: course segment for course blocks, empty block elsewhere.
        if (this.isParkour) return buildParkourBlock(x, y);
        // Coaster: the spawn block holds the b6 coaster source; elsewhere empty.
        if (this.isCoaster) {
            return (x === COASTER_START.block[0] && y === COASTER_START.block[1])
                ? buildCoasterBlock() : [0, 1, [], []];
        }
        // The mahjong table block (game zone) and the demo showcase block are
        // authored in scenes/; the loader just dispatches.
        if (x === MAHJONG_BLOCK[0] && y === MAHJONG_BLOCK[1]) return buildMahjongScene(x, y);
        if (x === POOL_BLOCK[0] && y === POOL_BLOCK[1]) return buildPoolScene(x, y);
        if (x === MAZE_BLOCK[0] && y === MAZE_BLOCK[1]) return buildMazeScene(x, y);
        if (x === SANDBOX_BLOCK[0] && y === SANDBOX_BLOCK[1]) return buildSandboxScene(x, y);
        if (x === DYN_BLOCK[0] && y === DYN_BLOCK[1]) return buildDynamicAdjunctScene(x, y);
        if (x === DEMO_BLOCK[0] && y === DEMO_BLOCK[1]) return buildDemoScene(x, y);
        return MockBlockData(x, y).raw;
    }

    /**
     * DEV TOOL — stamp the demo test scene onto a block as a PERSISTENT draft, so
     * it survives reload and can be edited/tested. Lets you jump to any empty
     * block and drop a fresh, fully-wired scene (doors/triggers/items/SPP) to
     * iterate on. Rebuilds the live block from the new draft immediately.
     */
    public stampTestScene(bx: number, by: number): void {
        if (!this.engine || !this.localData) return;
        const raw = buildDemoScene(bx, by);
        this.engine.getWorld()!.draftStore.save(0, bx, by, raw);   // persist
        // Re-materialise FROM the draft: BlockSystem reads the raw at inject time,
        // so swap the live block by remove + re-inject the now-merged content.
        this.engine.removeBlock(bx, by);
        const merged = this.localData.blockAt(bx, by);
        this.engine.injectBlock({ x: bx, y: by, adjuncts: merged.raw, elevation: merged.raw[0] });
        this.loadedBlockKeys.add(`${bx}_${by}`);
        console.log(`[Loader] stamped test scene onto block ${bx}_${by} (persisted)`);
    }

    /**
     * DEV TOOL — RESET STATE: wipe ALL local drafts + metadata (block edits,
     * player position, inventory, session) then reload, so the world falls back
     * to the pristine scene seed. Awaits the durable wipe before reloading, else
     * the IndexedDB delete could be interrupted by the navigation.
     */
    public async resetWorld(): Promise<void> {
        if (this.engine) await this.engine.clearDrafts(0);
        try { localStorage.removeItem('spp_player_state'); } catch { /* non-browser */ }
        window.location.reload();
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

    // ── Mahjong moves ───────────────────────────────────────────────────────────
    // All routed through world.gameRuntime.call, which enforces the Game Setting
    // `methods` whitelist (game.md §3) before the call reaches the game transport.

    /** Generic game move: call a whitelisted method on the active game and mirror
     *  the returned state. Any game's HUD uses this (mahjong discard, pool shoot…).
     *  The engine's GameRuntime enforces the methods whitelist before the transport. */
    public async gameAction(method: string, params: any[] = []): Promise<void> {
        const rt = this.engine?.getWorld()?.gameRuntime;
        if (!rt) return;
        try {
            const s = await rt.call(method, params);
            this._gameState = s;
            this._onGameState?.(this._activeGame, s);
        } catch (e) {
            console.warn('[game] move refused/failed', this._activeGame, method, e);
        }
    }

    /** Leave the active table: exit Game mode → engine calls the whitelisted `end`. */
    public leaveGame(): void { this.setMode('normal'); }

    // Back-compat thin aliases used by the mahjong HUD/e2e.
    public mahjongDiscard(tile: number): Promise<void> { return this.gameAction('discard', [tile]); }
    public mahjongWin(): Promise<void> { return this.gameAction('win', []); }
    public mahjongLeave(): void { this.leaveGame(); }

    // ── Player / view controls ─────────────────────────────────────────────────

    public setPlayerMoveIntent(x: number, y: number) {
        this.engine?.setMoveIntent(x, y);
    }

    /** Teleport the player to an SPP block + local offset (fast-travel / testing
     *  seam). Sets the live transform directly; the next step settles physics. */
    public teleportSpp(block: [number, number], pos: [number, number, number] = [8, 8, 3]): void {
        const w = this.engine?.getWorld();
        if (!w) return;
        const ids = w.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        const t = w.getComponent(ids[0], 'TransformComponent') as any;
        if (!t) return;
        const e = Coords.sppToEngine(pos, block);
        t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2];
        t.dirty = true;
    }

    // ── SPP sandbox (held "magic ball" — orbit + two-level cell→face edit) ────
    private _sandboxActive = false;
    private _sandboxDetach: (() => void) | null = null;
    private _sandboxDown: { x: number; y: number; t: number } | null = null;
    /** Two-level select: null = pick a cell; a number = that cell is open and
     *  only ITS faces are editable. The other cells dim while one is open. */
    private _sandboxCell: number | null = null;
    private _focusRaf = 0;

    public get sandboxActive(): boolean { return this._sandboxActive; }
    /** The cell currently open for face-editing, or null in cell-picking mode. */
    public get sandboxSelectedCell(): number | null { return this._sandboxCell; }

    /** Enter the SPP sandbox: teleport onto the diorama block, hide the avatar,
     *  orbit (Observe) the grid centre, and listen for taps to sculpt cell faces. */
    public enterSandbox(): void {
        if (this._sandboxActive) return;
        const w = this.engine?.getWorld() as any;
        if (!w) return;
        this.teleportSpp(SANDBOX_BLOCK, SANDBOX_CENTER);
        // Hide the avatar — it would sit in the middle of the diorama.
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (av) av.visible = false;
        this.setMode('observe');
        // A 3/4 orbit framing the 12 m grid.
        const cc = w.systems.findSystemByName('CharacterController') as any;
        if (cc) { cc._obsAzimuth = 0.7; cc._obsElevation = 0.7; cc._obsRadius = 22; }
        // Tap (not drag) on the canvas → select a cell, or edit the open cell's face.
        const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.sandboxDeselect(); };
        window.addEventListener('keydown', onKey);
        if (canvas) {
            const onDown = (e: MouseEvent) => { this._sandboxDown = { x: e.clientX, y: e.clientY, t: Date.now() }; };
            const onUp = (e: MouseEvent) => {
                const d = this._sandboxDown; this._sandboxDown = null;
                if (!d) return;
                if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || Date.now() - d.t > 500) return; // drag/hold = orbit
                const rect = canvas.getBoundingClientRect();
                const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
                this.sandboxClick(ndcX, ndcY);
            };
            canvas.addEventListener('mousedown', onDown);
            canvas.addEventListener('mouseup', onUp);
            this._sandboxDetach = () => {
                canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('mouseup', onUp);
                window.removeEventListener('keydown', onKey);
            };
        } else {
            this._sandboxDetach = () => window.removeEventListener('keydown', onKey);
        }
        // Re-assert per-cell dimming every frame: derived pieces are destroyed and
        // rebuilt on each face edit, so the opacity has to be re-applied once the
        // new meshes exist (AdjunctSystem builds them a frame after re-expand).
        const focusTick = () => {
            if (!this._sandboxActive) return;
            if (this._sandboxCell != null) this.applyCellFocus();
            this._focusRaf = requestAnimationFrame(focusTick);
        };
        this._focusRaf = requestAnimationFrame(focusTick);
        this._sandboxActive = true;
    }

    public exitSandbox(): void {
        if (!this._sandboxActive) return;
        this._sandboxActive = false;
        if (this._focusRaf) { cancelAnimationFrame(this._focusRaf); this._focusRaf = 0; }
        this.sandboxDeselect();
        this._sandboxDetach?.(); this._sandboxDetach = null;
        const w = this.engine?.getWorld() as any;
        const pid = w?.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (av) av.visible = true;
        this.setMode('normal');
    }

    /** Reconstruct the SPP-local camera ray for an NDC click on the diorama. The
     *  Observe orbit gives the camera world position; the picked surface point
     *  gives the direction. Returns null if the click missed all geometry. */
    private sandboxRay(w: any, ndcX: number, ndcY: number): { origin: number[]; dir: number[] } | null {
        const hit = w.renderEngine?.castRayFromCamera?.(ndcX, ndcY);
        if (!hit) return null;
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const t = w.getComponent(pid, 'TransformComponent');
        const cc = w.systems.findSystemByName('CharacterController') as any;
        const obs = cc?.getObserveState?.();
        if (!t || !obs) return null;
        const tx = t.position[0], ty = t.position[1] + 1, tz = t.position[2];
        const ce = Math.cos(obs.elevation), se = Math.sin(obs.elevation), r = obs.radius;
        const cam = [tx + r * ce * Math.sin(obs.azimuth), ty + r * se, tz + r * ce * Math.cos(obs.azimuth)];
        const dirE = [hit.point[0] - cam[0], hit.point[1] - cam[1], hit.point[2] - cam[2]];
        // Engine(abs) → SPP-local of the sandbox block. A point maps as
        // (x-bxoff, -z-byoff, y); a direction drops the offset: (dx, -dz, dy).
        const B = Coords.BLOCK_SIZE;
        return {
            origin: [cam[0] - (SANDBOX_BLOCK[0] - 1) * B, -cam[2] - (SANDBOX_BLOCK[1] - 1) * B, cam[1]],
            dir: [dirE[0], -dirE[2], dirE[1]],
        };
    }

    /**
     * One tap on the diorama, dispatched by the two-level edit state:
     *   - No cell open → SELECT the cell under the ray (the others dim).
     *   - A cell open  → cycle the face of THAT cell the ray enters; a tap that
     *     misses the open cell is ignored (it never edits a neighbour).
     * Returns what happened so the UI can reflect it. Pure picking lives in
     * scenes/sandboxScene.ts; here we only supply the camera ray.
     */
    public sandboxClick(ndcX: number, ndcY: number): { kind: 'select' | 'cycle' | 'none'; cell?: number } {
        const w = this.engine?.getWorld() as any;
        if (!w) return { kind: 'none' };
        const ray = this.sandboxRay(w, ndcX, ndcY);
        if (!ray) return { kind: 'none' };

        if (this._sandboxCell == null) {
            const pick = pickFace(ray.origin, ray.dir);
            if (!pick) return { kind: 'none' };
            this._sandboxCell = pick.cellIndex;
            this.applyCellFocus();
            return { kind: 'select', cell: pick.cellIndex };
        }

        const face = pickFaceInCell(ray.origin, ray.dir, this._sandboxCell);
        if (face == null) return { kind: 'none' }; // tap outside the open cell → keep it open
        return this.sandboxCycleFace(this._sandboxCell, face)
            ? { kind: 'cycle', cell: this._sandboxCell }
            : { kind: 'none' };
    }

    /** Open a cell for face-editing without a ray (UI / tests). Pass null to close. */
    public sandboxSelectCell(cell: number | null): void {
        this._sandboxCell = cell;
        if (cell == null) this.restoreCellFocus();
        else this.applyCellFocus();
    }

    /** Cycle one face of one cell (实→门→窗→空) on the shared b6 source and
     *  re-expand live. The deterministic seam the ray path and tests share. */
    public sandboxCycleFace(cell: number, face: number): boolean {
        const w = this.engine?.getWorld() as any;
        if (!w) return false;
        const src = this.findSandboxSource(w);
        const c = src?.std.cells?.[cell];
        if (!src || !c?.faces) return false;
        c.faces[face] = nextFace(c.faces[face]);
        w.systems.findSystemByName('BlockSystem')?.reexpandParticle?.(w, src.eid);
        this.applyCellFocus(); // re-assert dim; the focus rAF keeps it as meshes rebuild
        return true;
    }

    /** Close the open cell: stop face-editing, restore every cell to full opacity. */
    public sandboxDeselect(): void {
        if (this._sandboxCell == null) return;
        this._sandboxCell = null;
        this.restoreCellFocus();
    }

    /** Dim every derived piece NOT in the open cell to read as background; the
     *  open cell stays at full opacity so its faces are clearly the edit target. */
    private applyCellFocus(): void {
        const w = this.engine?.getWorld() as any;
        const sel = this._sandboxCell;
        if (!w || sel == null) return;
        const tag = `${SANDBOX_BLOCK[0]}_${SANDBOX_BLOCK[1]}`;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (!a?.stdData?.derivedFrom || !String(a.stdData.derivedFrom).includes(tag)) continue;
            const ci = cellOfPoint([a.stdData.ox, a.stdData.oy, a.stdData.oz]);
            const mesh = w.getComponent(eid, 'MeshComponent');
            if (mesh?.handle) w.renderEngine.setObjectOpacityIsolated(mesh.handle, ci === sel ? 1.0 : 0.22);
        }
    }

    /** Lift the dim — every derived piece back to full opacity. */
    private restoreCellFocus(): void {
        const w = this.engine?.getWorld() as any;
        if (!w) return;
        const tag = `${SANDBOX_BLOCK[0]}_${SANDBOX_BLOCK[1]}`;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (!a?.stdData?.derivedFrom || !String(a.stdData.derivedFrom).includes(tag)) continue;
            const mesh = w.getComponent(eid, 'MeshComponent');
            if (mesh?.handle) w.renderEngine.setObjectOpacityIsolated(mesh.handle, 1.0);
        }
    }

    /** Persist the sculpted sandbox INTO its block draft so it survives a reload.
     *  Re-serializes the live block (keeps the b6 SOURCE, drops derived pieces)
     *  into the DraftStore + flushes to IndexedDB. Display is already live; this
     *  only makes the structure durable. Returns whether it was written. */
    public async saveSandbox(): Promise<boolean> {
        const w = this.engine?.getWorld() as any;
        if (!w) return false;
        let blockEid: any = null;
        for (const eid of w.queryEntities('BlockComponent')) {
            const b = w.getComponent(eid, 'BlockComponent');
            if (b?.x === SANDBOX_BLOCK[0] && b?.y === SANDBOX_BLOCK[1]) { blockEid = eid; break; }
        }
        if (blockEid == null) return false;
        const ok = saveBlockDraft(w, blockEid);
        if (ok) await w.draftStore?.flush?.();
        return ok;
    }

    private findSandboxSource(w: any): { eid: any; std: any } | null {
        const tag = `${SANDBOX_BLOCK[0]}_${SANDBOX_BLOCK[1]}`;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const adj = w.getComponent(eid, 'AdjunctComponent');
            if (adj?.stdData?.typeId === AdjunctType.Particle && String(adj.adjunctId ?? '').includes(tag)) {
                return { eid, std: adj.stdData };
            }
        }
        return null;
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
        // castRayFromMinimap returns { entityId, distance, point } where point is the
        // ABSOLUTE engine-space hit. Derive the BLOCK coords the inspect panel needs;
        // returning the raw hit (no .metadata) is what crashed App on click-to-inspect.
        const hit = (this.engine.getWorld() as any)?.minimap.pickBlockFromMinimap(ndcX, ndcY);
        if (!hit?.point) return null;
        const { block } = Coords.engineToSpp(hit.point);
        return { metadata: { x: block[0], y: block[1] }, entityId: hit.entityId };
    }

    public resetMinimapFollow() {
        if (this.engine) (this.engine.getWorld() as any)?.minimap.setFollow(true);
    }

    // ── 2D map (data seam) ────────────────────────────────────────────────────────
    // The 2D world map is a pure RENDER-layer feature: it reads block summaries
    // straight off the SAME data seam the 3D world streams from (LocalDataSource),
    // WITHOUT building any 3D entities. The map's viewport drives which cells get
    // fetched (dynamic region loading), mirroring the old engine's render_2d
    // loadDetails window — just decoupled from the player's position. Reading
    // through the unified seam means the map also reflects local edits (drafts).

    /** World grid dimensions (block count per axis); cells outside are void. */
    public get worldRange(): [number, number] {
        const r = (this.engine?.getWorld() as any)?.config?.world?.range;
        return Array.isArray(r) && r.length === 2 ? [r[0], r[1]] : [4096, 4096];
    }

    /** Lightweight 2D summary of one block, derived from its raw — no meshes,
     *  no ECS entities. raw = [elevation, status, adjunctsRaw, animations, game]. */
    public async fetchMapCell(x: number, y: number): Promise<MapCell> {
        try {
            // Effective block (seed + draft overlay) when the seam is up; before
            // boot fall back to the raw seed.
            const raw: any[] = this.localData ? this.localData.blockAt(x, y).raw : this.sceneBlock(x, y);
            const groups: any[] = Array.isArray(raw[2]) ? raw[2] : [];
            let count = 0;
            for (const g of groups) count += Array.isArray(g?.[1]) ? g[1].length : 0;
            return {
                x, y, count,
                occupied: count > 0,
                game: typeof raw[4] === 'number' ? raw[4] : 0,
                elevation: typeof raw[0] === 'number' ? raw[0] : 0,
            };
        } catch {
            return { x, y, count: 0, occupied: false, game: 0, elevation: 0 };
        }
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

    /**
     * Live-content handler: a 'motif' message carries { adjunctId, hash }. Point
     * the named motif's texture at that content hash (an IPFS CID) and re-expand
     * it — the generated geometry rebuilds with the new image, resolved through
     * the IPFS layer. This is the engine-side endpoint of the live pipeline:
     *   (sim) WebSocket → ILiveSource → LiveSystem → world.events → here.
     */
    /** Build the 3D pool table balls on the pool block (geometry matches poolScene). */
    private setupPool3D(): void {
        this.engine?.setupPool({
            block: POOL_BLOCK, origin: [8, 8],
            bedW: 7, bedD: 4, bedSurfaceZ: 0.95,
            ballR: 0.12, pocketR: 0.22, friction: 0.55,
        });
        this._poolReady = true;
    }

    /** Break/shoot the cue toward where the camera faces (B key). The engine's
     *  PoolSystem does the physics; we only translate camera yaw → table angle. */
    private poolShootFromCamera(): void {
        const w = this.engine?.getWorld() as any;
        const yaw = w?.renderEngine?.getMainCameraRotation?.()[1] ?? 0;
        // Engine forward at yaw φ is (-sinφ, 0, -cosφ); table is East = +X, North = -Z.
        const angle = Math.atan2(Math.cos(yaw), -Math.sin(yaw));
        this.engine?.poolShoot(angle, 1);
    }

    private applyLiveMotifUpdate(data: any): void {
        const world = this.engine?.getWorld() as any;
        if (!world || !data || data.adjunctId == null) return;
        const targetId = String(data.adjunctId);
        const hash = data.hash != null ? String(data.hash) : null;
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent(eid, 'AdjunctComponent');
            if (a?.adjunctId !== targetId) continue;
            a.stdData.params = { ...(a.stdData.params || {}), texture: hash };
            world.systems.findSystemByName('BlockSystem')?.reexpandSource?.(world, eid);
            break;
        }
    }
}
