/**
 * Land registry seam (protocol/cn|en/land.md) — CHAIN-NEUTRAL.
 *
 * The hybrid architecture: the world (code + config + content roots) is
 * anchored on Bitcoin (boot-chain.md); block OWNERSHIP + the owner's published
 * block content CID live in a land registry the world config points at
 * (`land` section). This file is the only thing the clients know about that
 * registry — the concrete chain adapter (client/chain, Solana) is injected at
 * build time through the `@land-plugin` alias; the pure build aliases it to
 * `plugin-none.ts` and ships zero chain code (AGENTS.md / roadmap P5).
 */

/** `land` section of the world config (world.md §land, land.md §2). */
export interface LandConfig {
    /** Registry chain id. v1: 'solana'. */
    chain: string;
    /** Cluster moniker: 'localnet' | 'devnet' | 'mainnet-beta'. */
    cluster: string;
    /** Optional explicit RPC endpoint (else derived from cluster; env may override). */
    rpc?: string;
    /** Registry program address. */
    program: string;
    /** World name inside the registry — equals the Bitcoin anchor `name`. */
    world: string;
}

export type LandStatus = 'unminted' | 'owned' | 'listed' | 'banned';

export interface LandBlock {
    x: number;
    y: number;
    status: LandStatus;
    /** Owner address (chain-native string), null when unminted. */
    owner: string | null;
    /** Published content as a CIDv1(raw) `bafk…`, null = none. */
    cid: string | null;
    /** Listing price in the chain's base unit (lamports); 0 unless listed. */
    price: number;
    /** Content revision counter (bumps on every setContent). */
    revision: number;
}

export interface LandWorldInfo {
    chain: string;
    world: string;
    /** Mint price in base units. */
    mintPrice: number;
    range: [number, number];
    minted: number;
    frozen: boolean;
    /** Display unit + decimals for base units (SOL / 9). */
    unit: string;
    decimals: number;
}

export interface ILandRegistry {
    readonly chain: string;
    readonly config: LandConfig;
    /** Registry world record; null when the world is not registered on chain. */
    info(): Promise<LandWorldInfo | null>;
    /** Connected wallet address, null when disconnected. */
    wallet(): string | null;
    /** Which wallet backs the session ('injected' / 'dev-burner'). */
    walletKind(): string | null;
    connect(): Promise<string>;
    disconnect(): Promise<void>;
    /** Wallet balance in base units (0 when disconnected). */
    balance(): Promise<number>;
    /** Batch read; unminted coords come back with status 'unminted'. */
    getBlocks(coords: [number, number][]): Promise<LandBlock[]>;
    mint(x: number, y: number): Promise<string>;
    /** Publish (cid) or clear (null) the block content. Returns the tx signature. */
    setContent(x: number, y: number, cid: string | null): Promise<string>;
    list(x: number, y: number, price: number): Promise<string>;
    delist(x: number, y: number): Promise<string>;
    buy(x: number, y: number, expectedPrice: number): Promise<string>;
}

/** The build-time plugin contract (`@land-plugin`). */
export type LandPluginFactory = (cfg: LandConfig) => Promise<ILandRegistry | null>;
