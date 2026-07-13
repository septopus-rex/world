/**
 * DesktopLoader — chain-free engine loader for the 3D clients (desktop + mobile
 * shells), and the single seam React sees (`useEngine` → one loader instance).
 *
 * ARCHITECTURE (2026-07 god-object split — was one ~1600-line class): the
 * loader is now a COMPOSITION ROOT + thin facade. Every stateful concern lives
 * in an explicit collaborator under lib/loader/, and the coupling between them
 * is a visible constructor argument, not a grab into this class:
 *
 *   · WorldContent — the content core: level identity (?level → AuthoredLevel),
 *     the IDataSource method bodies, block streaming (LocalDataSource seam +
 *     resident window), the playerState mirror, 2D-map reads, live-motif.
 *   · GameBridge  — per-game backends (probe→server / loopback), the
 *     game.started/ended session mirror, gameAction/leaveGame, mahjong3d setup.
 *   · AiAuthoring — AI 造物 preview/build/cancel (depends on WorldContent).
 *   · SppStudio   — SPP sandbox editor + style-pack switcher.
 *   · PanelState  — e4 book / e5 board display state.
 *   · EnvClock    — the mock chain-height ticker (day/night + weather); real
 *     Bitcoin-driven time (BtcClock, VITE_BTC_CLOCK) swaps in the same seam.
 *
 * The facade keeps: the Engine handle + boot orchestration (init), the UI
 * mirrors React subscribes to (mode/zone/leave-intent), thin engine-verb
 * delegations (move/jump/teleport/avatar/minimap/export), and the delegating
 * public surface — `window.loader.*` is unchanged from before the split (the
 * e2e suite drives that surface directly).
 *
 * Chain-free: no @solana/*; the chain exists only as optional boot injection
 * (__SEPTOPUS_WORLD_CONFIG_PROMISE__, boot-chain.md) and the IChainPublisher
 * plugin seam. See docs/plan/STANDALONE_ENGINE_ROADMAP.md.
 */
import { Engine } from '@engine/Engine';
import { TransformComponent } from '@engine/core/components/PlayerComponents';
import { registerItemTemplate, type ItemTemplate } from '@engine/core/services/ItemRegistry';
import demoItemsJson from '../items/demo.items.json';
import { IDataSource } from '@engine/core/services/DataSource';
import { Coords } from '@engine/core/utils/Coords';
import type { GameSetting } from '@engine/core/types/GameSetting';
import { gameById } from '../games/registry';
import { ServiceHub } from '../net/ServiceHub';
import type { StylePack } from '@engine/core/spp/Variants';
import { DEMO_ASSETS, DEFAULT_AVATAR_ID } from '../scenes/demoScene';
import { DYNAMIC_ADJUNCT_CODE } from '../scenes/dynamicAdjunctScene';
import { WebSocketLiveSource } from './live/WebSocketLiveSource';
import { FakeWebSocket } from './live/FakeWebSocket';
import { HttpCasProvider } from './HttpCasProvider';
import { SppStudio } from './loader/SppStudio';
import { PanelState, type BookState, type BoardState } from './loader/PanelState';
import { WorldContent, type MapCell, type SeptopusPlayerState } from './loader/WorldContent';
import { GameBridge } from './loader/GameBridge';
import { AiAuthoring } from './loader/AiAuthoring';
import { EnvClock } from './loader/EnvClock';
import { BtcClock } from './loader/BtcClock';

// The map + player-state shapes moved to WorldContent with the content core;
// re-exported so existing `import { MapCell } from '../lib/DesktopLoader'` holds.
export type { MapCell, SeptopusPlayerState };

export class DesktopLoader implements IDataSource {
    public engine: Engine | null = null;

    /** Realtime transport (simulated WebSocket) feeding the engine's live channel.
     *  Also reachable as engine.live (the injected ILiveSource). */
    private _live: WebSocketLiveSource | null = null;

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

    // ── collaborators (the split-out concerns; see the class header) ──────────
    private content = new WorldContent(() => this.engine);
    private games = new GameBridge({
        engine: () => this.engine,
        net: this.net,
        setMode: (m) => this.setMode(m),
    });
    private ai = new AiAuthoring(() => this.engine, this.content);
    // VITE_BTC_CLOCK set → real Bitcoin blocks drive the calendar (1 block = 1
    // day, protocol/world.md §3.1); unset (dev/demo/e2e default) → the mock
    // ticker keeps the ~2-minute demo day/night cycle, deterministic and
    // network-free. Same idiom as VITE_LIVE_WS's real-vs-fake transport pick.
    private env: EnvClock | BtcClock = (import.meta as any).env?.VITE_BTC_CLOCK
        ? new BtcClock((h, hash, i) => this.engine?.feedChainState(h, hash, i))
        : new EnvClock((h, hash, i) => this.engine?.feedChainState(h, hash, i));
    private panels = new PanelState(() => this.net);
    private spp = new SppStudio({
        world: () => this.engine?.getWorld() ?? null,
        engine: () => this.engine,
        teleportSeptopus: (b, pos) => this.teleportSeptopus(b, pos),
        setMode: (m) => this.setMode(m),
    });

    // ── UI mirrors (the seam useEngine subscribes to) ─────────────────────────

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
     *  game.leave_intent instead of auto-exiting. Cleared when the player
     *  confirms (exit) or walks back in (re-enter). */
    private _leaveIntent = false;
    public get leaveIntentActive(): boolean { return this._leaveIntent; }
    private _onLeaveIntent: ((active: boolean) => void) | null = null;
    /** Subscribe to leave-game-intent (one consumer: useEngine → LeaveGameDialog). */
    public onLeaveIntent(cb: (active: boolean) => void): void { this._onLeaveIntent = cb; }
    /** "Stay" — dismiss the leave prompt without exiting Game (the round is still
     *  alive; the player can walk back into the block to resume it). */
    public cancelLeaveIntent(): void { if (this._leaveIntent) { this._leaveIntent = false; this._onLeaveIntent?.(false); } }

    // ── content-core surface (WorldContent) ───────────────────────────────────

    /** Live player location mirror (HUD/minimap/streaming centre). Owned by the
     *  content core; read-only outside (nothing assigns loader.playerState). */
    public get playerState(): SeptopusPlayerState { return this.content.playerState; }

    public worldInfo(): { id: number; nickname: string } { return this.content.worldInfo(); }
    public get worldRange(): [number, number] { return this.content.worldRange; }
    public fetchMapCell(x: number, y: number): Promise<MapCell> { return this.content.fetchMapCell(x, y); }
    public getLoadedBlockCount(): number { return this.content.loadedCount; }
    public stampTestScene(bx: number, by: number): void { this.content.stampTestScene(bx, by); }
    public publishBlock(bx: number, by: number): Promise<string | null> { return this.content.publishBlock(bx, by); }
    public currentBlockRaw(): Promise<{ block: [number, number]; raw: any; isDraft: boolean } | null> {
        return this.content.currentBlockRaw();
    }
    /** The current level's spawn (Septopus block + local position). */
    public getSpawn(): { block: [number, number]; position: [number, number, number] } { return this.content.getSpawn(); }

    /** Is the coaster level active? (ride it in Game mode). */
    public get coasterActive(): boolean { return this.content.isCoaster; }
    /** True once the coaster ride reaches the end. */
    public get coasterComplete(): boolean {
        return this.engine?.getWorld()?.globalFlags?.coaster_complete === true;
    }
    /** Is the parkour level active? (drives the parkour HUD). */
    public get parkourActive(): boolean { return this.content.isParkour; }
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

    // ── IDataSource (bodies live on the content core) ─────────────────────────

    public world(index: number): Promise<any> { return this.content.world(index); }
    public view(x: number, y: number, ext: number, _worldIndex: number): Promise<any> { return this.content.view(x, y, ext); }
    public module(ids: number[]): Promise<any> { return this.content.module(ids); }
    public texture(ids: number[]): Promise<any> { return this.content.texture(ids); }
    public stylePack(refs: string[]): Promise<Record<string, StylePack>> { return this.content.stylePack(refs); }

    /** Resolve a Game Setting resource (game.md §2): a playable block carries a
     *  registered game's id in its `game` field. Looked up in the game registry. */
    public async gameSetting(id: number): Promise<GameSetting | null> {
        return gameById(id)?.setting ?? null;
    }

    // ── book (e4) + board (e5) panel state (PanelState) ───────────────────────

    public get bookState(): BookState | null { return this.panels.bookState; }
    public onBook(cb: (b: BookState | null) => void): void { this.panels.onBook(cb); }
    public openBook(pages: string[], title = ''): void { this.panels.openBook(pages, title); }
    public turnBookPage(delta: number): void { this.panels.turnBookPage(delta); }
    public closeBook(): void { this.panels.closeBook(); }
    public get boardPanelState(): BoardState | null { return this.panels.boardPanelState; }
    public onBoard(cb: (b: BoardState | null) => void): void { this.panels.onBoard(cb); }
    public openBoard(channel: string, title = ''): Promise<void> { return this.panels.openBoard(channel, title); }
    public postBoardMessage(text: string, author = '游客'): Promise<boolean> { return this.panels.postBoardMessage(text, author); }
    public closeBoard(): void { this.panels.closeBoard(); }

    // ── games (GameBridge) ────────────────────────────────────────────────────

    public get activeGame(): string | null { return this.games.activeGame; }
    public get gameState(): any { return this.games.gameState; }
    /** Back-compat alias for the mahjong HUD/e2e. */
    public get mahjongState(): any { return this.games.mahjongState; }
    public onGameStateChange(cb: (game: string | null, s: any) => void): void { this.games.onGameStateChange(cb); }
    public gameAction(method: string, params: any[] = []): Promise<void> { return this.games.gameAction(method, params); }
    /** Leave the active table: exit Game mode → engine calls the whitelisted `end`. */
    public leaveGame(): void { this.games.leaveGame(); }
    // Back-compat thin aliases used by the mahjong HUD/e2e.
    public mahjongDiscard(tile: number): Promise<void> { return this.gameAction('discard', [tile]); }
    public mahjongWin(): Promise<void> { return this.gameAction('win', []); }
    public mahjongLeave(): void { this.leaveGame(); }

    /** Read-only shooting-range snapshot (score/shots/hits/phase) for the HUD. */
    public shootingState(): any { return this.engine?.shootingState() ?? null; }
    /** Read-only tumble-tower snapshot (standing/pulled/maxY/toppled/settled). */
    public tumbleState(): any { return this.engine?.tumbleState() ?? null; }

    // ── AI authoring (AiAuthoring) ────────────────────────────────────────────

    public aiTargetBlock(): [number, number] | null { return this.ai.aiTargetBlock(); }
    public aiPreview(doc: any): boolean { return this.ai.aiPreview(doc); }
    public aiBuild(): boolean { return this.ai.aiBuild(); }
    public aiCancel(): void { this.ai.aiCancel(); }

    // ── Boot ──────────────────────────────────────────────────────────────────

    public async init(containerId: string, ui?: any) {
        if (this.engine) return;

        // Demo item catalogue (templates are world CONTENT — the host registers
        // its own; the engine ships none). Item templates are DATA (item.md) —
        // frozen at src/items/demo.items.json (base-data-audit D3).
        for (const t of demoItemsJson as unknown as ItemTemplate[]) registerItemTemplate(t);

        // Per-game transports (probe → real dev server, else loopback), routed by
        // name through one IGameApi. Built BEFORE the engine (a ctor argument).
        const gameApi = this.games.buildApi();

        // Realtime transport (ILiveSource): the WS half of the two-channel split
        // (HTTP = request/response · WS = server push). With VITE_LIVE_WS set the
        // live source rides a hub-managed ReconnectingSocket; without it, the
        // in-process FakeWebSocket keeps dev/e2e deterministic.
        const liveUrl = (import.meta as any).env?.VITE_LIVE_WS;
        this._live = new WebSocketLiveSource(liveUrl ? this.net.socket(liveUrl) : new FakeWebSocket());

        this.engine = new Engine(containerId, { api: this, ui, gameApi, liveSource: this._live });

        // Streaming + player-mirror: the content core owns both ends.
        this.engine.on('block.need', (payload) => { void this.content.handleGridRequest(payload.center); });
        this.engine.on('player.state', (state) => { this.content.mirrorState(state); });

        // Live content channel: the server pushes { adjunctId, hash } on the
        // 'motif' topic → the motif swaps its texture to that IPFS hash and
        // re-expands → the image updates live.
        this._live.subscribe('motif');
        this.engine.on('live.message', (payload: any) => {
            this.content.applyLiveMotifUpdate(payload?.data);
        }, { key: 'motif' });

        // Game lifecycle mirrors + mahjong3d table setup + demo keys (B/N).
        this.games.wire(this.engine);

        // Game-zone gating: the engine derives "player is in a playable block"
        // from the block.game flag; the UI offers Game-mode entry only inside.
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

        // e-series click handlers: clicking an adjunct fires interact.primary with
        // the hit entity; the engine carries the data + interaction, the client
        // performs the view action (DOM / overlay stays out of the engine).
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
        this.content.applyAuthoredStart();

        // SPP StylePacks: register the content library BEFORE any block streams
        // in, so a b6 `theme` (id or CID) resolves at expansion time.
        await this.content.registerStylePacksAtBoot();

        // Boot at the level spawn as the FALLBACK; durable persistence (player
        // location, inventory, session) is restored by hydrateDrafts below.
        await this.engine.bootWorld(0, this.content.playerState);

        // NETWORK content tier (services/ipfs): quiet-probe the dev IPFS gateway
        // and, when up, register it into the world's IpfsRouter at LOWEST priority
        // — the in-process CAS stays the local cache (offline-first), only misses
        // fall through to HTTP. Absent gateway = zero cost, zero behavior change.
        try {
            const ipfsCh = this.net.http('ipfs');
            if (await ipfsCh.probe()) {
                this.engine.getWorld()!.ipfs.addProvider(new HttpCasProvider(ipfsCh));
                console.log(`[Loader] IPFS gateway online → router tier-2: ${ipfsCh.base}`);
            }
            // REAL public gateways (read-only, lowest priority): comma list via
            // VITE_IPFS_GATEWAYS. Our CIDs are real CIDv1(raw) — pinned content
            // resolves verbatim and passes the router's re-hash integrity check.
            const real = String((import.meta as any).env?.VITE_IPFS_GATEWAYS || '')
                .split(',').map((s) => s.trim()).filter(Boolean);
            for (const base of real) {
                this.engine.getWorld()!.ipfs.addProvider(new HttpCasProvider(this.net.adhoc(base), false));
                console.log(`[Loader] real IPFS gateway tier: ${base} (read-only)`);
            }
        } catch { /* never block boot on the network tier */ }

        // Dynamic adjuncts: run the sandboxed declarative code and register it by
        // type-id BEFORE any block streams in. Browser-only (Web Worker) — guarded
        // so a failure here never blocks boot for the built-in scenes.
        try {
            await this.engine.loadDynamicAdjunct(DYNAMIC_ADJUNCT_CODE);
        } catch (e) {
            console.warn('[Loader] dynamic adjunct load failed (sandbox unavailable?):', e);
        }

        // P1 persistence: pull every saved draft into the sync cache BEFORE the
        // first block materializes, and restore location/inventory/session.
        await this.engine.hydrateDrafts(0);

        // Restore the picked avatar (session meta) — the engine booted with the
        // default; a differing saved pick swaps through the same runtime seam.
        try {
            const savedAvatar = await this.engine.getWorld()!.draftStore.loadMeta(0, 'avatar');
            if (savedAvatar != null && this.avatarCatalog().some(a => a.id === Number(savedAvatar))) {
                this.setAvatar(Number(savedAvatar)); // routes through the catalog facing lookup
            }
        } catch { /* no saved pick */ }

        // The unified block seam (scene seed + now-hydrated DraftStore + CAS).
        this.content.buildLocalData();

        // Parkour: load the persisted best time for the HUD.
        if (this.content.isParkour) {
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
        // the fallback spawn) — decide what wins for THIS level and centre there.
        this.content.resolveStartLocation();

        const [bx, by] = this.content.playerState.block;
        const initialBKey = `${bx}_${by}`;
        const blockReadyPromise = new Promise<void>((resolve) => {
            // block.loaded fires ONCE per block (when its last adjunct mesh is
            // built); the typed queue routes it by the stable block key.
            this.engine?.on('block.loaded', () => resolve(), { key: `blk:${initialBKey}`, once: true });
            // Failsafe: proceed after 3s even if the ready signal never fires.
            setTimeout(resolve, 3000);
        });

        // Inject the initial neighborhood BEFORE starting physics (prevents falling).
        console.log(`[Loader] Pre-loading initial neighborhood for ${initialBKey}...`);
        await this.content.handleGridRequest(this.content.playerState.block);

        this.engine.start();

        await blockReadyPromise;
        console.log('[Loader] World Ready.');

        this.env.start();
    }

    // ── world export / import (P1) ────────────────────────────────────────────

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

    // ── block inspector (StatusPanel → BlockInspector) ────────────────────────

    /** True while orbiting the current block (Observe mode). */
    public isObserving(): boolean { return (this.engine?.getWorld() as any)?.mode === 'observe'; }

    /** Toggle an orbit-camera inspection of the CURRENT block (Observe mode):
     *  hide the avatar, frame a 3/4 orbit; toggle again to return to Normal.
     *  Returns the new observing state. */
    public toggleBlockObserve(): boolean {
        const w = this.engine?.getWorld() as any;
        if (!w) return false;
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (w.mode === 'observe') {
            this.setMode('normal');
            if (av) av.visible = true;
            return false;
        }
        if (av) av.visible = false;
        this.setMode('observe');
        const cc = w.systems.findSystemByName?.('CharacterController') as any;
        if (cc) { cc._obsAzimuth = 0.6; cc._obsElevation = 0.5; cc._obsRadius = 14; }
        return true;
    }

    // ── player / view controls (thin engine delegations) ──────────────────────

    public setPlayerMoveIntent(x: number, y: number) {
        this.engine?.setMoveIntent(x, y);
    }

    /** Selectable avatars for the frontend picker (data rides the world doc). */
    public avatarCatalog(): { id: number; label: string; facing: number }[] {
        return this.content.avatarCatalog();
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

    /** Teleport the player to a Septopus block + local offset (fast-travel /
     *  testing seam). Sets the live transform directly; physics settles next step. */
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

    /** Return to the active level's spawn point (the same start used on boot). */
    public goToSpawn(): void {
        const s = this.content.getSpawn();
        this.teleportSeptopus(s.block, s.position);
    }

    // ── SPP sandbox + style packs (SppStudio) ─────────────────────────────────

    public get sandboxActive(): boolean { return this.spp.sandboxActive; }
    public get sandboxSelectedCell(): number | null { return this.spp.sandboxSelectedCell; }
    public listSppStyles(): string[] { return this.spp.listSppStyles(); }
    public get sppStyle(): string | null { return this.spp.sppStyle; }
    public setSppStyle(id: string | null): void { this.spp.setSppStyle(id); }
    public enterSandbox(): void { this.spp.enterSandbox(); }
    public exitSandbox(): void { this.spp.exitSandbox(); }
    public sandboxClick(ndcX: number, ndcY: number): { kind: 'select' | 'cycle' | 'none'; cell?: number } { return this.spp.sandboxClick(ndcX, ndcY); }
    public sandboxSelectCell(cell: number | null): void { this.spp.sandboxSelectCell(cell); }
    public sandboxCycleFace(cell: number, face: number): boolean { return this.spp.sandboxCycleFace(cell, face); }
    public sandboxDeselect(): void { this.spp.sandboxDeselect(); }
    public saveSandbox(): Promise<boolean> { return this.spp.saveSandbox(); }

    // ── modes / camera / interaction ──────────────────────────────────────────

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

    /** Would tapping this entity DO something if in reach? True for the things a
     *  player taps to use: e4 book(pages) / e5 board(channel) / e1 link(url),
     *  b5 items, ba NPCs (dialogue or a click interact verb). Used to hint
     *  "太远了 · walk closer" ONLY for real interactables — every adjunct is a
     *  raycast target, so plain scenery (walls/ground) must NOT trigger the hint. */
    public isInteractableTarget(target: any): boolean {
        const w = this.engine?.getWorld();
        if (!w || target === undefined || target === null) return false;
        if (w.getComponent(target, 'ItemComponent')) return true;               // b5 item
        const std = (w.getComponent(target, 'AdjunctComponent') as any)?.stdData;
        if (!std) return false;
        if (Array.isArray(std.pages) && std.pages.length > 0) return true;       // e4 book
        if (typeof std.channel === 'string' && std.channel) return true;         // e5 board
        if (typeof std.url === 'string' && /^https?:\/\//.test(std.url)) return true; // e1 link
        if (std.dialogue || std.interact) return true;                           // ba npc
        return false;
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

    // ── minimap ───────────────────────────────────────────────────────────────

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
}
