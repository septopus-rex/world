import type { Engine } from '@engine/Engine';
import type { IGameApi } from '@engine/core/services/IGameApi';
import type { ServiceHub } from '../../net/ServiceHub';
import { GAMES } from '../../games/registry';
import { GameApiRouter } from '../../games/GameApiRouter';
import { ProbedGameApi } from '../../games/ProbedGameApi';
import { FetchGameApi } from '../../games/FetchGameApi';
import { NATIVE_MAHJONG_BLOCK, MAHJONG_SURFACE_Z } from '../../scenes/mahjong3dScene';
import { generateMahjongFaceCids } from '../../scenes/mahjongFaces';

/** The seam GameBridge needs from its host (DesktopLoader): the engine handle,
 *  the connection hub the backends register on, and the mode verb leaveGame
 *  funnels through (the engine's zone contract does the actual teardown). */
export interface GameHost {
    engine(): Engine | null;
    net: ServiceHub;
    setMode(mode: 'normal' | 'edit' | 'game' | 'ghost' | 'observe'): boolean;
}

/**
 * GameBridge — the loader's game glue, extracted from DesktopLoader (2026-07
 * god-object split). Owns:
 *   · backend assembly — one transport per registered game (offline-first
 *     tiering: probe the real per-game dev server, else in-page loopback),
 *     routed by name through one IGameApi (the engine enforces the Game
 *     Setting `methods` whitelist before a call reaches it)
 *   · the session mirror — game.started/ended → activeGame/gameState the
 *     HUDs subscribe to
 *   · move funnels — gameAction (whitelisted method call + state mirror),
 *     leaveGame, and the demo key conveniences (B = pool shot, N = mahjong
 *     discard-first)
 *   · native-3D mahjong table setup — tile-face CIDs generated into the CAS,
 *     dealt when its block materializes
 */
export class GameBridge {
    constructor(private host: GameHost) {}

    /** One IGameApi injected into the engine, dispatching by game name. */
    private api: IGameApi = new GameApiRouter({});
    public get gameApi(): IGameApi { return this.api; }

    /** Active game name + its latest state (null when no game is running). The
     *  engine is the source of truth (game.started/ended carry the name). */
    private _activeGame: string | null = null;
    private _gameState: any = null;
    public get activeGame(): string | null { return this._activeGame; }
    public get gameState(): any { return this._gameState; }
    /** Back-compat alias for the mahjong HUD/e2e. */
    public get mahjongState(): any { return this._activeGame === 'mahjong' ? this._gameState : null; }
    private _onGameState: ((game: string | null, s: any) => void) | null = null;
    /** Subscribe to active-game state updates (consumer: useEngine → GameHUD). */
    public onGameStateChange(cb: (game: string | null, s: any) => void): void { this._onGameState = cb; }

    /** True once the native 3D mahjong table is dealt (N-to-discard enabled). */
    private _mahjongReady = false;
    /** kind → face-image CID, generated + ingested once (memoized). */
    private _mahjongFaceCids: Promise<string[] | undefined> | null = null;

    /**
     * Build one transport per registered game and route by name (offline-first
     * tiering, services/game): default = lazy probe → the REAL dev game server
     * (HTTP + server-held sessions) when it answers, else the in-page loopback
     * engine (same class, byte-identical play). `?mjserver` still forces each
     * game's data-declared baseurl (the route-intercept e2e path). Called by the
     * facade BEFORE the Engine is constructed (the api is an Engine ctor arg).
     */
    public buildApi(): IGameApi {
        const useServer = typeof location !== 'undefined'
            && new URLSearchParams(location.search).has('mjserver');
        const env = (import.meta as any).env ?? {};
        const backends: Record<string, IGameApi> = {};
        for (const g of GAMES) {
            // Each game gets ITS OWN physical server (services/<name>, devPort) —
            // registered on the hub as `game:<name>`; env override per game
            // (VITE_GAME_SERVER_MAHJONG=…) mirrors production per-operator bases.
            const base = env[`VITE_GAME_SERVER_${g.name.toUpperCase()}`] || `http://127.0.0.1:${g.devPort}`;
            const gameCh = this.host.net.register(`game:${g.name}`, base);
            backends[g.name] = useServer
                ? new FetchGameApi(this.host.net.adhoc(g.setting.baseurl ?? `/api/${g.name}`)) // data-declared server
                : new ProbedGameApi(gameCh,
                    () => new FetchGameApi(this.host.net.adhoc(`${gameCh.base}/api/${g.name}`)),
                    () => g.makeLoopback());
        }
        this.api = new GameApiRouter(backends);
        return this.api;
    }

    /**
     * Wire the engine-side game events + demo key conveniences. Called by the
     * facade right after the Engine is constructed.
     *   · game.started/ended (game.md §5): the engine resolved the block's Game
     *     Setting and called the whitelisted `start`; its response is the opening
     *     board. `end` (on leaving) tears the session down.
     *   · native 3D mahjong: when its table block materializes, deal the tiles
     *     (MahjongSystem owns the game; the FACES are a host resource concern).
     *   · B = pool shot toward the camera · N = mahjong discard-first.
     */
    public wire(engine: Engine): void {
        engine.on('game.started', (p: any) => {
            this._activeGame = p?.game ?? null;
            this._gameState = p?.session ?? null;
            this._onGameState?.(this._activeGame, this._gameState);
        });
        engine.on('game.ended', () => {
            this._activeGame = null;
            this._gameState = null;
            this._onGameState?.(null, null);
        });
        engine.on('block.loaded', () => { void this.setupMahjong3D(); },
            { key: `blk:${NATIVE_MAHJONG_BLOCK[0]}_${NATIVE_MAHJONG_BLOCK[1]}`, once: true });
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
                if (e.code === 'KeyB') this.poolShootFromCamera(); // no-ops without a live pool session
                if (e.code === 'KeyN' && this._mahjongReady) this.mahjongDiscardFirst();
            });
        }
    }

    /** Generic game move: call a whitelisted method on the active game and mirror
     *  the returned state. Any game's HUD uses this (mahjong discard, pool shoot…).
     *  The engine's GameRuntime enforces the methods whitelist before the transport. */
    public async gameAction(method: string, params: any[] = []): Promise<void> {
        const rt = this.host.engine()?.getWorld()?.gameRuntime;
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
    public leaveGame(): void { this.host.setMode('normal'); }

    // ── native-3D mahjong table ───────────────────────────────────────────────

    private mahjongFaceCids(): Promise<string[] | undefined> {
        if (!this._mahjongFaceCids) {
            const router = this.host.engine()?.ipfs;
            this._mahjongFaceCids = router
                ? generateMahjongFaceCids(router).catch((e) => {
                    console.warn('[GameBridge] mahjong face generation failed; tiles stay blank.', e);
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
        this.host.engine()?.setupMahjong({
            block: NATIVE_MAHJONG_BLOCK, origin: [8, 8],
            surfaceZ: MAHJONG_SURFACE_Z, seed: 20260629,
            ...(faceCids ? { faceCids } : {}),
        });
        this._mahjongReady = true;
    }

    /** Discard the first tile in the human's hand (N key) — a no-aim convenience;
     *  clicking a tile in-world does the same through the engine's raycast path. */
    private mahjongDiscardFirst(): void {
        const engine = this.host.engine();
        const st = engine?.mahjongState();
        if (!st || st.phase !== 'playing' || st.turn !== st.humanSeat) return;
        const hand = st.hands[st.humanSeat];
        if (hand?.length) engine?.mahjongDiscard(hand[0]);
    }

    /** Break/shoot the cue toward where the camera faces (B key). The engine's
     *  PoolSystem does the physics; we only translate camera yaw → table angle. */
    private poolShootFromCamera(): void {
        const engine = this.host.engine();
        const w = engine?.getWorld() as any;
        const yaw = w?.renderEngine?.getMainCameraRotation?.()[1] ?? 0;
        // Engine forward at yaw φ is (-sinφ, 0, -cosφ); table is East = +X, North = -Z.
        const angle = Math.atan2(Math.cos(yaw), -Math.sin(yaw));
        engine?.poolShoot(angle, 1);
    }
}
