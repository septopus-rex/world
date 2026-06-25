/**
 * GameSetting — the per-zone game-runtime descriptor (Septopus Game Mode Protocol,
 * protocol/cn/game.md §2).
 *
 * A playable block points at a Game Setting *resource* (the block-level `game`
 * field carries its resource id). When the player enters Game mode on that block
 * the engine resolves the setting and runs the documented lifecycle:
 *   resource(id) → (preload blocks) → apply init → call game.start() → … → game.end()
 *
 * The *external communication contract* lives here: `baseurl` + `methods` declare
 * the API whitelist. Per §3, "游戏模式下，如提供了 `methods`，引擎仅允许与其中定义
 * 的外部 API 进行通讯" — the engine refuses any call to a method not on this list
 * (enforced by GameRuntime). The engine itself never performs the network/DOM call;
 * it hands the whitelisted call to an injected IGameApi (the host/chain wires the
 * transport), exactly like IActuator / IChainPublisher.
 *
 * This is the interpreter-agnostic data contract; the 3D engine is one consumer.
 * Multiplayer (init.server / sync / wasm) is declared but not yet wired — see
 * docs/plan/specs (deferred P2/P3). Single-player + external-API games (e.g. a
 * networked-server game like mahjong) work on the methods whitelist alone.
 */

/** One whitelisted external API method (protocol §2 `methods[]`, §3). */
export interface GameMethod {
    /** Method name the engine is allowed to call (e.g. "start", "end", "discard"). */
    name: string;
    /** Optional argument constraints (type/limit) — advisory for now. */
    params?: Array<{ type: 'number' | 'string'; limit?: [number, number] | number }>;
    /** Optional response shape (type/length) — advisory for now. */
    response?: Array<{ type: 'number' | 'string'; length?: number }>;
}

/** Multiplayer server config (protocol §7.2 init.server). Declared, not yet wired. */
export interface GameServerConfig {
    stun?: string;
    turn?: string;
    turnUser?: string;
    turnPass?: string;
    maxPlayers?: number;
}

/** Initial-state overrides applied on Game entry (protocol §2 init). */
export interface GameInit {
    sky?: Record<string, any>;
    weather?: Record<string, any>;
    start?: { block?: [number, number]; position?: [number, number, number]; rotation?: [number, number, number] };
    server?: GameServerConfig;
}

/** Sync granularity for multiplayer (protocol §7.1). null = single-player. */
export type GameSyncLevel = null | 'position' | 'state' | 'inventory' | 'authority';

export interface GameSetting {
    /** Game name / identifier (required). */
    game: string;
    /** External game-API root (omit for pure-P2P / no external API). */
    baseurl?: string;
    /** Game homepage URL. */
    homepage?: string;
    /** Game version. */
    version?: string;
    /** Preload regions: [x,y] single block or [x,y,extX,extY] rect (absolute coords). */
    blocks?: Array<[number, number] | [number, number, number, number]>;
    /** Initial overrides applied on entry. */
    init?: GameInit;
    /** Multiplayer sync level; null/omitted = single-player. */
    sync?: GameSyncLevel;
    /** WASM authoritative-logic resource id (protocol §8). Declared, not yet wired. */
    wasm?: number | null;
    /** External API whitelist. Omitted/empty ⇒ no external API permitted (P2P-only). */
    methods?: GameMethod[];
}
