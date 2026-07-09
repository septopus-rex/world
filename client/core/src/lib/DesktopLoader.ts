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
import { registerItemTemplate, type ItemTemplate } from '@engine/core/services/ItemRegistry';
import demoItemsJson from '../items/demo.items.json';
import { IDataSource } from '@engine/core/services/DataSource';
import { LocalDataSource, SceneProvider } from '@engine/core/services/LocalDataSource';
// Authored levels are pure DATA (AuthoredLevel JSON) — content lives here with
// the client, the engine only supplies the vocabulary (levelSceneProvider).
import { AuthoredLevel, levelSceneProvider, type ContentResolver } from '@engine/core/services/AuthoredLevel';
import parkourLevelJson from '../levels/parkour.level.json';
import coasterLevelJson from '../levels/coaster.level.json';
import xianjianLevelJson from '../levels/xianjian.level.json';
import galleryLevelJson from '../levels/gallery.level.json';
import refineLevelJson from '../levels/refine.level.json';
import defaultLevelJson from '../levels/default.level.json';
import defaultWorldJson from '../worlds/default.world.json';
import { Coords } from '@engine/core/utils/Coords';
import { validateGenerationDoc, compileGenerationDoc } from '@engine/core/protocol/GenerationDoc';
import type { GameSetting } from '@engine/core/types/GameSetting';
import type { IGameApi } from '@engine/core/services/IGameApi';
import { GAMES, gameById } from '../games/registry';
import { GameApiRouter } from '../games/GameApiRouter';
import { ProbedGameApi } from '../games/ProbedGameApi';
import { ServiceHub } from '../net/ServiceHub';
import { FetchGameApi } from '../games/FetchGameApi';
import { DEMO_BLOCK, DEMO_AVATAR_ID, DEFAULT_AVATAR_ID, DEMO_ASSETS } from '../scenes/demoScene';
import demoBlockJson from '../blocks/demo.block.json';
import { buildWorldLevel } from '../scenes/worldHubScene';
import { resolveStylePacks, allStylePackIds } from '../stylepacks';
import type { StylePack } from '@engine/core/spp/Variants';
import { MAHJONG_BLOCK } from '../scenes/mahjongScene';
import { POOL_BLOCK } from '../scenes/poolScene';
import { NATIVE_MAHJONG_BLOCK, MAHJONG_SURFACE_Z } from '../scenes/mahjong3dScene';
import { generateMahjongFaceCids } from '../scenes/mahjongFaces';
import { SHOOTING_BLOCK } from '../scenes/shootingScene';
import { TUMBLE_BLOCK } from '../scenes/tumbleScene';
import { MAZE_BLOCK } from '../scenes/mazeScene';
import mazeBlockJson from '../blocks/maze.block.json';
import shootingBlockJson from '../blocks/shooting.block.json';
import poolBlockJson from '../blocks/pool.block.json';
import tumbleBlockJson from '../blocks/tumble.block.json';
import mahjongBlockJson from '../blocks/mahjong.block.json';
import mahjong3dBlockJson from '../blocks/mahjong3d.block.json';
import sandboxBlockJson from '../blocks/sandbox.block.json';
import holdemBlockJson from '../blocks/holdem.block.json';
import dynamicBlockJson from '../blocks/dynamic.block.json';
import fallbackBlockJson from '../blocks/fallback.block.json';
import { SANDBOX_BLOCK, SANDBOX_CENTER, pickFace, pickFaceInCell, cellOfPoint, nextFace } from '../scenes/sandboxScene';
import { DYN_BLOCK, DYNAMIC_ADJUNCT_CODE } from '../scenes/dynamicAdjunctScene';
import { saveBlockDraft } from '@engine/core/utils/BlockSerializer';
import { WebSocketLiveSource } from './live/WebSocketLiveSource';
import { FakeWebSocket } from './live/FakeWebSocket';

import { DEFAULT_PLAYER_STATE } from '../Constants';
import { HttpCasProvider } from './HttpCasProvider';

/** A block's 2D-map summary (render-layer only; see DesktopLoader.fetchMapCell). */
export interface MapCell {
    x: number;
    y: number;
    occupied: boolean;   // has any adjunct content
    count: number;       // adjunct instance count
    game: number;        // block.game flag (playable zone) — raw[4]
    elevation: number;   // block elevation — raw[0]
    /** Teleport anchors authored in this block (b8 slot 6) — the map's
     *  fast-travel destinations. Only STREAMED cells reveal anchors, which is
     *  the "discovered" semantic for free (specs/teleport-portal.md §3). */
    anchors: { name: string; e: number; n: number }[];
}

export interface SeptopusPlayerState {
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
    /** True once the native 3D mahjong table is dealt (N-to-discard enabled). */
    private _mahjongReady = false;
    /** Read-only shooting-range snapshot (score/shots/hits/phase) for the HUD. */
    public shootingState(): any { return this.engine?.shootingState() ?? null; }

    /** True once the native 3D tumble tower is armed (drives any tumble HUD). */
    /** Read-only tumble-tower snapshot (standing/pulled/maxY/toppled/settled). */
    public tumbleState(): any { return this.engine?.tumbleState() ?? null; }

    /** `?level=<name>` selects an authored level instead of the demo court. */
    private level = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('level') : null;
    private isParkour = this.level === 'parkour';
    private isCoaster = this.level === 'coaster';
    private isXianjian = this.level === 'xianjian';
    private isWorld = this.level === 'world';
    private isRefine = this.level === 'refine';
    private isGallery = this.level === 'gallery';
    /** The OLD comprehensive demo court (game tables/editor props) — now an
     *  explicit destination; the bare entry starts in the exhibit corridor. */
    private isDemo = this.level === 'demo';

    /** No `?level` → the DEFAULT world, itself just another level document
     *  (P7: default.level.json = 9 block refs + a fallback ground template).
     *  It keeps demo-court semantics the authored levels don't have: the saved
     *  player location WINS over `start` (see `authoredStart`). */
    /** "Default-world family" (bare entry + ?level=demo): the persisted
     *  location WINS over the level start (soft start); authored levels
     *  instead force their start every load. */
    private isDefaultWorld = this.level == null || this.level === 'demo';

    /**
     * ContentResolver (P7): name → content for every `ref` in a level document.
     * Local-first = imported JSON under src/blocks|levels; a networked host
     * swaps this for the CAS/IPFS router WITHOUT touching any level data.
     */
    private static readonly CONTENT: Record<string, any> = {
        demo: demoBlockJson, maze: mazeBlockJson, shooting: shootingBlockJson,
        pool: poolBlockJson, tumble: tumbleBlockJson, mahjong: mahjongBlockJson,
        mahjong3d: mahjong3dBlockJson, sandbox: sandboxBlockJson, holdem: holdemBlockJson,
        dynamic: dynamicBlockJson, fallback: fallbackBlockJson,
        // Level documents are ref-able too (include composition, P4.5's local
        // half): the gallery's portal plaza includes these by name.
        xianjian: xianjianLevelJson, coaster: coasterLevelJson, parkour: parkourLevelJson,
    };
    private resolveContent: ContentResolver = (ref) => DesktopLoader.CONTENT[ref] ?? null;

    /** The active authored level (data document) + its block provider. Levels
     *  are JSON in src/levels/ — the engine holds no level content. The 'world'
     *  level is composed from data (hub/demo blocks + xianjian include;
     *  scenes/worldHubScene.ts glue pending the ref-resolver landing there). */
    private activeLevel: AuthoredLevel =
        this.isParkour ? (parkourLevelJson as unknown as AuthoredLevel)
        : this.isCoaster ? (coasterLevelJson as unknown as AuthoredLevel)
        : this.isXianjian ? (xianjianLevelJson as unknown as AuthoredLevel)
        : this.isWorld ? buildWorldLevel()
        : this.isRefine ? (refineLevelJson as unknown as AuthoredLevel)
        : this.isDemo ? (defaultLevelJson as unknown as AuthoredLevel)
        // Bare entry (no ?level) = the exhibit corridor: ①–⑳ one capability per
        // block, portal plaza at the north end — the curated front door.
        : (galleryLevelJson as unknown as AuthoredLevel);
    private levelProvider = levelSceneProvider(this.activeLevel, this.resolveContent);

    /** Default-world family: the first-run spawn is the ACTIVE level's start
     *  (corridor for the bare entry, demo court for ?level=demo) — the config
     *  doc's own player.start is only the last-resort fallback. Persisted
     *  location still wins (hydrate overrides after boot). */
    private withSoftStart(cfg: any): any {
        if (this.isDefaultWorld && this.activeLevel?.start && cfg?.player) {
            cfg.player.start = JSON.parse(JSON.stringify(this.activeLevel.start));
        }
        return cfg;
    }

    /** The start an AUTHORED level forces on every load; the default world
     *  instead lets the restored (persisted) location win — its `start` is only
     *  the first-run spawn. */
    private get authoredStart() { return this.isDefaultWorld ? null : this.activeLevel.start; }

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

    /** Set while a 'confirm'-policy game wants confirmation to leave (the player
     *  stepped off its block): the engine kept the round alive + emitted
     *  game.leave_intent instead of auto-exiting. The UI shows a "leave game?"
     *  dialog; cleared when the player confirms (exit) or walks back in (re-enter). */
    private _leaveIntent = false;
    public get leaveIntentActive(): boolean { return this._leaveIntent; }
    private _onLeaveIntent: ((active: boolean) => void) | null = null;
    /** Subscribe to leave-game-intent (one consumer: useEngine → LeaveGameDialog). */
    public onLeaveIntent(cb: (active: boolean) => void): void { this._onLeaveIntent = cb; }
    /** "Stay" — dismiss the leave prompt without exiting Game (the round is still
     *  alive; the player can walk back into the block to resume it). */
    public cancelLeaveIntent(): void { if (this._leaveIntent) { this._leaveIntent = false; this._onLeaveIntent?.(false); } }

    /** Open book (e4) — the client-side reader state. Paging a static string[] is
     *  a pure view action (same discipline as e1 link's window.open staying in the
     *  client), so the page index lives here, not in the engine. Clicking a book
     *  adjunct routes through interact.primary → openBook; the BookReader view is a
     *  pure mirror of this state. */
    private _book: { title: string; pages: string[]; page: number } | null = null;
    public get bookState(): { title: string; pages: string[]; page: number } | null { return this._book; }
    private _onBook: ((b: { title: string; pages: string[]; page: number } | null) => void) | null = null;
    /** Subscribe to book-reader state (consumer: BookReader). */
    public onBook(cb: (b: { title: string; pages: string[]; page: number } | null) => void): void { this._onBook = cb; }
    /** Open a book with its pages (ignores an empty book). */
    public openBook(pages: string[], title = ''): void {
        if (!Array.isArray(pages) || pages.length === 0) return;
        this._book = { title, pages, page: 0 };
        this._onBook?.(this._book);
    }
    /** Turn the page, clamped to [0, last] — no wrap, so the reader never falls off either end. */
    public turnBookPage(delta: number): void {
        if (!this._book) return;
        const next = Math.max(0, Math.min(this._book.pages.length - 1, this._book.page + delta));
        if (next === this._book.page) return;
        this._book = { ...this._book, page: next };
        this._onBook?.(this._book);
    }
    /** e5 board — server-backed message wall. State mirrors to BoardPanel; the
     *  channel's messages live on services/board (offline → read-only empty). */
    private _boardPanel: { channel: string; title: string; messages: Array<{ author: string; text: string; at: number }> | null; offline: boolean } | null = null;
    public get boardPanelState() { return this._boardPanel; }
    private _onBoard: ((b: typeof this._boardPanel) => void) | null = null;
    public onBoard(cb: (b: typeof this._boardPanel) => void): void { this._onBoard = cb; }
    /** Open a board panel and (re)load its channel from the board service. */
    public async openBoard(channel: string, title = ''): Promise<void> {
        this._boardPanel = { channel, title, messages: null, offline: false };
        this._onBoard?.(this._boardPanel);
        try {
            const data = await this.net.http('board').getJson(`/v0/list?channel=${encodeURIComponent(channel)}`, { timeoutMs: 2000 });
            if (this._boardPanel?.channel !== channel) return; // closed/switched meanwhile
            this._boardPanel = { ...this._boardPanel, messages: data.messages ?? [], offline: false };
        } catch {
            if (this._boardPanel?.channel !== channel) return;
            this._boardPanel = { ...this._boardPanel, messages: [], offline: true };
        }
        this._onBoard?.(this._boardPanel);
    }
    /** Post to the open board's channel, then refresh the list. */
    public async postBoardMessage(text: string, author = '游客'): Promise<boolean> {
        const b = this._boardPanel;
        if (!b || !text.trim()) return false;
        try {
            await this.net.http('board').postJson('/v0/post', { channel: b.channel, author, text });
            await this.openBoard(b.channel, b.title); // refresh
            return true;
        } catch { return false; }
    }
    public closeBoard(): void { this._boardPanel = null; this._onBoard?.(null); }

    /** Close the reader. */
    public closeBook(): void {
        if (!this._book) return;
        this._book = null;
        this._onBook?.(null);
    }

    /** One IGameApi injected into the engine, dispatching by game name to per-game
     *  backends (loopback mock, or networked FetchGameApi under `?mjserver`). The
     *  Game Setting `methods` whitelist is enforced by the engine before a call
     *  reaches it. Built in init() from the game registry. */
    private gameApi: IGameApi = new GameApiRouter({});
    /** The world document actually served by world() (chain-injected or bundled)
     *  — sync readers like avatarCatalog() consult it. */
    private _worldDoc: any = null;
    /** THE client-side connection manager — every companion-service call routes
     *  through here (net/ServiceHub: probe/timeout/reconnect/status in one place). */
    public readonly net: ServiceHub = (() => {
        const env = (import.meta as any).env ?? {};
        const hub = new ServiceHub();
        hub.register('board', env.VITE_BOARD_SERVER || 'http://127.0.0.1:7786');
        hub.register('ipfs', env.VITE_IPFS_GATEWAY || 'http://127.0.0.1:7789');
        hub.register('ai', env.VITE_AI_GATEWAY || 'http://127.0.0.1:7788');
        return hub;
    })();
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

    // Seeded from the ACTIVE level's start (soft start — the bare entry spawns
    // in the exhibit corridor, ?level=demo in the demo court); the persisted
    // location overrides at hydrate for the default-world family, and authored
    // levels re-force their start in init().
    public playerState: SeptopusPlayerState = {
        ...DEFAULT_PLAYER_STATE,
        block: [...this.activeLevel.start.block] as [number, number],
        position: [...this.activeLevel.start.position] as [number, number, number],
        rotation: [...this.activeLevel.start.rotation] as [number, number, number],
    };

    // ── IDataSource ───────────────────────────────────────────────────────────

    public async world(_index: number): Promise<any> {
        // Local Genesis world config + a demo avatar resource so the player has a
        // real (network-loaded) body instead of the placeholder box. Default =
        // the soldier (33): a full motion set (Idle/Run/Walk) so movement animates
        // out of the box, unlike the single-clip legacy avatar (30, still
        // selectable as 旅者). A saved pick overrides this after hydrate.
        // Chain boot (boot-chain.md §3): the ROOT loader prelude starts fetching
        // the world config by the anchor-pinned CID and leaves the promise on
        // globalThis — when present, THAT is the world (config genuinely comes
        // from the chain root, not the bundle).
        const injected = (globalThis as any).__SEPTOPUS_WORLD_CONFIG_PROMISE__;
        if (injected) {
            const cfg = await injected;
            if (cfg) { this._worldDoc = cfg; return this.withSoftStart(JSON.parse(JSON.stringify(cfg))); }
        }
        // World CONFIG is DATA (src/worlds/default.world.json, P7) — avatar
        // resource/facing are baked into the doc; a saved pick overrides after
        // hydrate. Swap the backing file (or a CID fetch) to change worlds.
        this._worldDoc = defaultWorldJson;
        return this.withSoftStart(JSON.parse(JSON.stringify(defaultWorldJson)));
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

    /**
     * Resolve external SPP StylePacks by ref (id or content CID) — the IDataSource
     * seam (spp-protocol-full.md §3.B). Packs are DATA in src/stylepacks/, not
     * engine code; this stands in for an IPFS/CAS fetch. The engine calls it (or,
     * local-first, `registerStylePacksAtBoot` pre-registers) so a b6 `theme`
     * pointing at a pack resolves before expansion.
     */
    public async stylePack(refs: string[]): Promise<Record<string, StylePack>> {
        return resolveStylePacks(refs);
    }

    /** Local-first: resolve every content StylePack through the seam and register
     *  it into the engine, so listStyles()/setStyleOverride() and any block theme
     *  reference resolve. (A server tier resolves lazily per block instead.) */
    private async registerStylePacksAtBoot(): Promise<void> {
        if (!this.engine) return;
        const packs = await this.stylePack(allStylePackIds());
        for (const pack of Object.values(packs)) this.engine.registerStylePack(pack);
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    public async init(containerId: string, ui?: any) {
        if (this.engine) return;

        // Demo item catalogue (templates are world CONTENT — the host registers
        // its own; the engine ships none). The demo scenes' b5 rows use ids 1–3.
        // Item templates are DATA (item.md: 模板=世界内容,引擎零内置) —
        // frozen at src/items/demo.items.json (base-data-audit D3).
        for (const t of demoItemsJson as unknown as ItemTemplate[]) registerItemTemplate(t);

        // Build one transport per registered game and route by name (offline-first
        // tiering, services/game): default = lazy probe → the REAL dev game server
        // (7787, HTTP + server-held sessions) when it answers, else the in-page
        // loopback engine (same class, byte-identical play). `?mjserver` still
        // forces each game's data-declared baseurl (the route-intercept e2e path).
        const useServer = typeof location !== 'undefined'
            && new URLSearchParams(location.search).has('mjserver');
        const env = (import.meta as any).env ?? {};
        const backends: Record<string, IGameApi> = {};
        for (const g of GAMES) {
            // Each game gets ITS OWN physical server (services/<name>, devPort) —
            // registered on the hub as `game:<name>`; env override per game
            // (VITE_GAME_SERVER_MAHJONG=…) mirrors production per-operator bases.
            const base = env[`VITE_GAME_SERVER_${g.name.toUpperCase()}`] || `http://127.0.0.1:${g.devPort}`;
            const gameCh = this.net.register(`game:${g.name}`, base);
            backends[g.name] = useServer
                ? new FetchGameApi(this.net.adhoc(g.setting.baseurl ?? `/api/${g.name}`)) // data-declared server
                : new ProbedGameApi(gameCh,
                    () => new FetchGameApi(this.net.adhoc(`${gameCh.base}/api/${g.name}`)),
                    () => g.makeLoopback());
        }
        this.gameApi = new GameApiRouter(backends);

        // Realtime transport (ILiveSource): the WS half of the two-channel split
        // (HTTP = request/response · WS = server push). With VITE_LIVE_WS set the
        // live source rides a hub-managed ReconnectingSocket (backoff/heartbeat/
        // re-subscribe-on-reopen); without it, the in-process FakeWebSocket keeps
        // dev/e2e deterministic. The engine side (LiveSystem) never changes.
        const liveUrl = (import.meta as any).env?.VITE_LIVE_WS;
        this._live = new WebSocketLiveSource(liveUrl ? this.net.socket(liveUrl) : new FakeWebSocket());

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

        // Native 3D pool / shooting / tumble: DATA-DRIVEN — each block's b8 game
        // trigger carries the rich declaration (enterGame params[0].game = {kind,…});
        // BlockSystem emits game.declare and the matching System arms itself. The
        // old setupPool3D/setupShooting3D/setupTumble3D mirrors are gone
        // (full-data-migration.md P2). Press B to shoot pool toward the camera.

        // Native 3D mahjong: when its table block materializes, deal the tiles
        // (MahjongSystem owns the game). Still a host call: the tile FACES are
        // client-generated images ingested to the CAS (async CIDs) — a host
        // resource concern, deferred from the data-driven pass (P2-④ note).
        this.engine.on('block.loaded', () => { void this.setupMahjong3D(); }, { key: `blk:${NATIVE_MAHJONG_BLOCK[0]}_${NATIVE_MAHJONG_BLOCK[1]}`, once: true });
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
                if (e.code === 'KeyB') this.poolShootFromCamera(); // no-ops without a live pool session
                if (e.code === 'KeyN' && this._mahjongReady) this.mahjongDiscardFirst();
            });
        }

        // Game-zone gating: the engine derives "player is in a playable block"
        // from the block.game flag and announces it here. The UI uses this to
        // offer Game-mode entry only inside a playable zone (no free toggle).
        this.engine.on('game.zone_enter', () => {
            this._gameZone = true; this._onZone?.(true);
            // Walked back into the game's block → cancel any pending leave prompt.
            if (this._leaveIntent) { this._leaveIntent = false; this._onLeaveIntent?.(false); }
        });
        this.engine.on('game.zone_exit', () => { this._gameZone = false; this._onZone?.(false); });

        // A 'confirm'-policy game: the player stepped off its block but the round is
        // kept alive — ask whether to leave (vs the silent 'ephemeral' auto-exit).
        this.engine.on('game.leave_intent', () => { this._leaveIntent = true; this._onLeaveIntent?.(true); });

        // Engine is the source of truth for the active mode (it can refuse a
        // requested switch — e.g. Game outside a zone, or an auto zone-exit).
        this.engine.on('system.mode', (p: any) => {
            this._mode = p?.mode ?? this._mode;
            this._onMode?.(this._mode);
            // Any move out of Game resolves a pending leave prompt.
            if (this._mode !== 'game' && this._leaveIntent) { this._leaveIntent = false; this._onLeaveIntent?.(false); }
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

        // e-series click handlers: clicking an adjunct fires interact.primary with
        // the hit entity; the engine carries the data + interaction, the client
        // performs the view action (DOM / overlay stays out of the engine).
        //   e1 link → window.open(url);  e4 book → open the paged reader(pages).
        this.engine.on('interact.primary', (_payload: any, ev: any) => {
            const target = ev?.target;
            if (target === undefined || !this.engine) return;
            const adj = this.engine.getWorld()?.getComponent(target, 'AdjunctComponent') as any;
            const std = adj?.stdData;
            if (!std) return;
            // e5 board: a server-backed message channel → open the board panel.
            if (typeof std.channel === 'string' && std.channel && !Array.isArray(std.pages)) {
                void this.openBoard(std.channel, typeof std.title === 'string' ? std.title : '');
                return;
            }
            // e4 book: an inline string[] of pages → open the in-scene reader.
            if (Array.isArray(std.pages) && std.pages.length > 0) {
                this.openBook(std.pages, typeof std.title === 'string' ? std.title : '');
                return;
            }
            // e1 link: an external URL → open in a new tab.
            const url = std.url;
            if (typeof url === 'string' && /^https?:\/\//.test(url)) {
                window.open(url, '_blank', 'noopener');
            }
        });

        // An authored level starts at its own spawn (not the demo/saved spawn).
        if (this.authoredStart) {
            const s = this.authoredStart;
            this.playerState = {
                ...this.playerState,
                block: s.block, position: s.position, rotation: s.rotation,
            };
        }

        // SPP StylePacks: resolve the content library through the IDataSource seam
        // and register it BEFORE any block streams in, so a b6 `theme` (id or CID)
        // resolves at expansion time. These are DATA (src/stylepacks/*.json), not
        // engine code — the engine ships only basic/coaster. Local-first pre-registers
        // all; a server tier would resolve per-block lazily via stylePack().
        await this.registerStylePacksAtBoot();

        // Boot at the demo spawn as the FALLBACK; durable persistence (player
        // location, inventory, session) lives in the engine and is restored by
        // hydrateDrafts below, overriding this when a saved location exists.
        await this.engine.bootWorld(0, this.playerState);

        // NETWORK content tier (services/ipfs, specs/full-data-migration.md 联网层):
        // quiet-probe the dev IPFS gateway and, when up, register it into the
        // world's IpfsRouter at LOWEST priority — the in-process CAS stays the
        // local node/cache (offline-first), only misses fall through to HTTP.
        // Absent gateway = zero cost, zero behavior change (e2e-deterministic).
        try {
            const ipfsCh = this.net.http('ipfs');
            if (await ipfsCh.probe()) {
                this.engine.getWorld()!.ipfs.addProvider(new HttpCasProvider(ipfsCh));
                console.log(`[Loader] IPFS gateway online → router tier-2: ${ipfsCh.base}`);
            }
            // REAL public gateways (read-only, lowest priority): comma list, e.g.
            //   VITE_IPFS_GATEWAYS=https://ipfs.io,https://dweb.link
            // Our CIDs are real CIDv1(raw) — pinned content resolves verbatim and
            // passes the router's re-hash integrity check. No probe: public
            // gateways are slow/rate-limited; a miss/timeout is just a fallthrough.
            const real = String((import.meta as any).env?.VITE_IPFS_GATEWAYS || '')
                .split(',').map((s) => s.trim()).filter(Boolean);
            for (const base of real) {
                this.engine.getWorld()!.ipfs.addProvider(new HttpCasProvider(this.net.adhoc(base), false));
                console.log(`[Loader] real IPFS gateway tier: ${base} (read-only)`);
            }
        } catch { /* never block boot on the network tier */ }

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

        // Restore the picked avatar (session meta) — the engine booted with the
        // default; a differing saved pick swaps through the same runtime seam.
        try {
            const savedAvatar = await this.engine.getWorld()!.draftStore.loadMeta(0, 'avatar');
            if (savedAvatar != null && this.avatarCatalog().some(a => a.id === Number(savedAvatar))) {
                this.setAvatar(Number(savedAvatar)); // routes through the catalog facing lookup
            }
        } catch { /* no saved pick */ }

        // The unified block seam: one SceneProvider (mode-dispatched seed) + the
        // now-hydrated DraftStore. All block streaming flows through this.
        this.localData = new LocalDataSource(
            { block: (x, y) => this.sceneBlock(x, y) } as SceneProvider,
            this.engine.getWorld()!.draftStore,
            0,
            // Route scene seeds through the content-addressed block store: block
            // content is now content-addressed (CID) like resources, over the same
            // mock-IPFS router (第二/三期, spec mock-ipfs-block.md).
            this.engine.getWorld()!.blockCas,
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
        const authored = this.authoredStart;
        const restored = this.engine.getPlayerSeptopusLocation();
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
                const e = Coords.septopusToEngine(authored.position, authored.block);
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
     * SceneProvider seed: the base authored raw for a block, BEFORE local drafts
     * (LocalDataSource overlays those). ONE path (P7): the active level document
     * — the DEFAULT world is itself default.level.json (9 block refs + the
     * declared `fallback` ground for every other coordinate). The old scene
     * registry + MockBlockData procedural fallback are retired; "where content
     * comes from" has a single answer: the level document + ContentResolver.
     */
    private sceneBlock(x: number, y: number): any[] {
        return this.levelProvider.block(x, y) as any[];
    }

    /**
     * DEV TOOL — stamp the demo test scene onto a block as a PERSISTENT draft, so
     * it survives reload and can be edited/tested. Lets you jump to any empty
     * block and drop a fresh, fully-wired scene (doors/triggers/items/SPP) to
     * iterate on. Rebuilds the live block from the new draft immediately.
     */
    public stampTestScene(bx: number, by: number): void {
        if (!this.engine || !this.localData) return;
        // The frozen demo block works at ANY coordinate: its trigger targets are
        // block-relative (adj_~_~_…), nothing in the raw bakes a position.
        const raw = JSON.parse(JSON.stringify(demoBlockJson));
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
     * Publish the current effective block (seed + local edits) into the CAS and
     * return its content id (CID) — the 第三期「发布块到 CAS」primitive. This is
     * how a locally-authored block becomes content-addressed; DraftStore stays the
     * working copy. (A full editor button lives in the React UI; this is the seam.)
     */
    public async publishBlock(bx: number, by: number): Promise<string | null> {
        if (!this.localData) return null;
        const cid = await this.localData.publish(bx, by);
        if (cid) console.log(`[Loader] published block ${bx}_${by} → ${cid}`);
        return cid;
    }

    // ── AI authoring (spec docs/plan/specs/ai-authoring.md §4E-G) ────────────
    /** The active AI proposal: compiled + injected as a PREVIEW (never touches
     *  the draft until aiBuild). Cancel restores the block's original content. */
    private aiPending: { block: [number, number]; raw: any[] } | null = null;


    /** Does the ACTIVE level document author this coordinate (own blocks or any
     *  include, offset-aware)? The post-P7 replacement for the retired scene
     *  registry — AI build targets must not clobber authored content. */
    private authoredCoord(bx: number, by: number, lvl: AuthoredLevel = this.activeLevel): boolean {
        if (lvl.blocks.some((b) => b.x === bx && b.y === by)) return true;
        for (const inc of lvl.include ?? []) {
            const [dx, dy] = inc.offset ?? [0, 0];
            if (inc.level && this.authoredCoord(bx - dx, by - dy, inc.level)) return true;
        }
        return false;
    }

    /** Pick the AI build target: the nearest block (ring 0..3 around the
     *  player) with no authored scene, no draft and no pending preview. */
    public aiTargetBlock(): [number, number] | null {
        const w = this.engine?.getWorld();
        if (!w) return null;
        const ids = w.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        const t = w.getComponent(ids[0], 'TransformComponent') as any;
        const { block } = Coords.engineToSeptopus([t.position[0], t.position[1], t.position[2]]);
        for (let r = 0; r <= 3; r++) {
            for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const bx = block[0] + dx, by = block[1] + dy;
                if (this.authoredCoord(bx, by)) continue;                    // authored level coord
                if (w.draftStore.load(0, bx, by)) continue;                   // player edits
                if (this.aiPending && this.aiPending.block[0] === bx && this.aiPending.block[1] === by) continue;
                return [bx, by];
            }
        }
        return null;
    }

    /** Compile a VALIDATED GenerationDoc and inject it as a runtime PREVIEW
     *  (replaces the block's streamed content; nothing persisted). */
    public aiPreview(doc: any): boolean {
        if (!this.engine) return false;
        const errors = validateGenerationDoc(doc);
        if (errors.length) {                                                  // never trust the wire
            console.warn('[Loader] aiPreview rejected:', errors);
            return false;
        }
        if (this.aiPending) this.aiCancel();                                  // one proposal at a time
        const [bx, by] = doc.target.block;
        const raw = compileGenerationDoc(doc);
        this.engine.removeBlock(bx, by);
        this.engine.injectBlock({ x: bx, y: by, adjuncts: raw, elevation: raw[0] });
        this.loadedBlockKeys.add(`${bx}_${by}`);
        this.aiPending = { block: [bx, by], raw };
        return true;
    }

    /** Commit the previewed proposal: persist as a draft (same channel as the
     *  editor — reload-durable, exportable, publishable via publishBlock). */
    public aiBuild(): boolean {
        if (!this.engine || !this.aiPending) return false;
        const { block: [bx, by], raw } = this.aiPending;
        this.engine.getWorld()!.draftStore.save(0, bx, by, raw);
        this.aiPending = null;
        console.log(`[Loader] AI build committed to block ${bx}_${by} (draft)`);
        return true;
    }

    /** Drop the preview and restore the block's original (seed+draft) content. */
    public aiCancel(): void {
        if (!this.engine || !this.aiPending) return;
        const [bx, by] = this.aiPending.block;
        this.aiPending = null;
        this.engine.removeBlock(bx, by);
        if (this.localData) {
            const merged = this.localData.blockAt(bx, by);
            this.engine.injectBlock({ x: bx, y: by, adjuncts: merged.raw, elevation: merged.raw[0] });
        }
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

    /** Teleport the player to an Septopus block + local offset (fast-travel / testing
     *  seam). Sets the live transform directly; the next step settles physics. */
    /** Selectable avatars for the frontend picker. `facing` = per-model yaw
     *  correction (radians) that aligns each GLTF's authored forward with
     *  Septopus north — external models disagree on which way is "front"
     *  (protocol avatar-animation.md). Empirically: soldier faces −Z (0);
     *  the legacy avatar and RobotExpressive face +Z (π). Each model is its
     *  own correction — there is no universal value. */
    public avatarCatalog(): { id: number; label: string; facing: number }[] {
        // DATA, not code (base-data-audit D1): the catalog rides the world doc
        // (player.avatarCatalog); a chain-injected config missing the field
        // falls back to the bundled document. facing stays per-model data.
        const fromDoc = (doc: any) => doc?.player?.avatarCatalog;
        const list = fromDoc(this._worldDoc) ?? fromDoc(defaultWorldJson) ?? [];
        return list.map((a: any) => ({ id: Number(a.id), label: String(a.label ?? a.id), facing: Number(a.facing) || 0 }));
    }

    /** Live avatar id (mirrors AvatarComponent.resource; catalog default). */
    public currentAvatar(): number {
        const info = this.engine?.avatarInfo?.();
        const n = info?.resource != null ? Number(info.resource) : NaN;
        return Number.isFinite(n) ? n : DEFAULT_AVATAR_ID;
    }

    /** Swap the player's avatar (runtime seam) + persist the pick. Passes the
     *  catalog's per-model facing so external models orient correctly. */
    public setAvatar(id: number): void {
        const facing = this.avatarCatalog().find(a => a.id === id)?.facing;
        this.engine?.setAvatar(String(id), facing);
        this.engine?.getWorld()?.draftStore.saveMeta(0, 'avatar', id);
    }

    /** Map fast-travel: funnel through the SAME anchor-gated teleport action a
     *  content portal uses (specs/teleport-portal.md §3) — seeing an anchor on
     *  the map does not bypass its destination-side `when`. */
    public fastTravel(anchor: string, block: [number, number]): void {
        this.engine?.requestTeleport(anchor, block);
    }

    public teleportSeptopus(block: [number, number], pos: [number, number, number] = [8, 8, 3]): void {
        const w = this.engine?.getWorld();
        if (!w) return;
        const ids = w.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        const t = w.getComponent(ids[0], 'TransformComponent') as any;
        if (!t) return;
        const e = Coords.septopusToEngine(pos, block);
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

    // ── SPP style packs (Workstream B) ───────────────────────────────────────
    /** Registered SPP style ids (built-in + external) for the style switcher. */
    public listSppStyles(): string[] { return (this.engine as any)?.listStyles?.() ?? []; }
    /** The active world-level style override (null = each source keeps its own). */
    public get sppStyle(): string | null { return (this.engine as any)?.getStyleOverride?.() ?? null; }
    /** Swap the world SPP style live — re-expands every SPP source instantly.
     *  `null` clears the override. Re-asserts the sandbox cell dim afterwards so
     *  the open-cell focus survives the mesh rebuild. */
    public setSppStyle(id: string | null): void {
        (this.engine as any)?.setStyleOverride?.(id);
        if (this._sandboxCell != null) this.applyCellFocus();
    }

    /** Enter the SPP sandbox: teleport onto the diorama block, hide the avatar,
     *  orbit (Observe) the grid centre, and listen for taps to sculpt cell faces. */
    public enterSandbox(): void {
        if (this._sandboxActive) return;
        const w = this.engine?.getWorld() as any;
        if (!w) return;
        this.teleportSeptopus(SANDBOX_BLOCK, SANDBOX_CENTER);
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
        w.systems.findSystemByName('BlockSystem')?.reexpandSource?.(w, src.eid);
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
            if (adj?.stdData?.typeId === AdjunctType.Spp && String(adj.adjunctId ?? '').includes(tag)) {
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
        const { block } = Coords.engineToSeptopus(hit.point);
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
            const anchors: { name: string; e: number; n: number }[] = [];
            for (const g of groups) {
                const rows = Array.isArray(g?.[1]) ? g[1] : [];
                count += rows.length;
                if (g?.[0] === 0x00b8) { // b8 trigger — slot 6 may declare an anchor
                    for (const row of rows) {
                        const a = row?.[6];
                        if (a && typeof a === 'object' && typeof a.name === 'string') {
                            anchors.push({ name: a.name, e: row?.[1]?.[0] ?? 8, n: row?.[1]?.[1] ?? 8 });
                        }
                    }
                }
            }
            return {
                x, y, count,
                occupied: count > 0,
                game: typeof raw[4] === 'number' ? raw[4] : 0,
                elevation: typeof raw[0] === 'number' ? raw[0] : 0,
                anchors,
            };
        } catch {
            return { x, y, count: 0, occupied: false, game: 0, elevation: 0, anchors: [] };
        }
    }

    // ── Persistence ──────────────────────────────────────────────────────────────

    // Live mirror of the player's location for the minimap/HUD/extend bookkeeping.
    // Durable persistence is engine-owned now (DraftStore meta 'player', restored
    // by Engine.hydrateDrafts) — this no longer writes to localStorage.
    private _saveState(partial: Partial<SeptopusPlayerState>) {
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


    /** kind → face-image CID, generated + ingested once (memoized). */
    private _mahjongFaceCids: Promise<string[] | undefined> | null = null;

    private mahjongFaceCids(): Promise<string[] | undefined> {
        if (!this._mahjongFaceCids) {
            const router = this.engine?.ipfs;
            this._mahjongFaceCids = router
                ? generateMahjongFaceCids(router).catch((e) => {
                    console.warn('[DesktopLoader] mahjong face generation failed; tiles stay blank.', e);
                    return undefined;
                })
                : Promise.resolve(undefined);
        }
        return this._mahjongFaceCids;
    }

    /** Deal the native 3D mahjong table (geometry matches mahjong3dScene). The
     *  MahjongSystem owns the game; we generate readable tile faces (slot-7
     *  textures via the CAS), then seed it and mark it ready. */
    private async setupMahjong3D(): Promise<void> {
        const faceCids = await this.mahjongFaceCids();
        this.engine?.setupMahjong({
            block: NATIVE_MAHJONG_BLOCK, origin: [8, 8],
            surfaceZ: MAHJONG_SURFACE_Z, seed: 20260629,
            ...(faceCids ? { faceCids } : {}),
        });
        this._mahjongReady = true;
    }

    /** Discard the first tile in the human's hand (N key) — a no-aim convenience;
     *  clicking a tile in-world does the same through the engine's raycast path. */
    private mahjongDiscardFirst(): void {
        const st = this.engine?.mahjongState();
        if (!st || st.phase !== 'playing' || st.turn !== st.humanSeat) return;
        const hand = st.hands[st.humanSeat];
        if (hand?.length) this.engine?.mahjongDiscard(hand[0]);
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
