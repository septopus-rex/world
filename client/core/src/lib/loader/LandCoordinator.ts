/**
 * LandCoordinator — the client-side collaborator for the land registry
 * (protocol/cn|en/land.md), following the same composition-root pattern as
 * GameBridge / AiAuthoring / SppStudio.
 *
 * Responsibilities:
 *  · boot-time discovery: if the served world config declares `land` AND the
 *    build includes `@land-plugin` (SEPTOPUS_LAND=solana) AND the registry is
 *    reachable on the network, activate land mode; otherwise stay inert (`enabled = false`)
 *    so the pure standalone experience and all existing e2e specs are untouched.
 *  · ownership + content cache for streamed blocks (`syncCoords`), pulling
 *    published CIDs from CAS/IPFS (gateway tier → local BlockCas) and swapping
 *    the live 3D block when on-chain content arrives (unless a local draft
 *    already overrides it).
 *  · the `IChainPublisher` adapter (`uploadData` → CAS + IPFS gateway pin,
 *    `commitBlock` → `registry.setContent`).
 *  · wallet + marketplace verbs (`connect`, `mint`, `publish`, `list`, `delist`,
 *    `buy`) + UI change notifications.
 */
import type { Engine } from '@engine/Engine';
import type { IChainPublisher } from '@engine/core/services/IChainPublisher';
import { canonicalBlockBytes } from '@engine/core/protocol/BlockRaw';
import type { ILandRegistry, LandBlock, LandConfig, LandWorldInfo } from '../../land/types';
import { createLandRegistry } from '@land-plugin';
import type { HttpChannel } from '../../net/HttpChannel';
import type { WorldContent } from './WorldContent';

export interface LandUiSnapshot {
    enabled: boolean;
    chain: string | null;
    cluster: string | null;
    world: string | null;
    mintPrice: number;
    unit: string;
    decimals: number;
    wallet: string | null;
    walletKind: string | null;
    balance: number;
    block: LandBlock | null;
    hasDraft: boolean;
    canEdit: boolean;
}

export class LandCoordinator implements IChainPublisher {
    private registry: ILandRegistry | null = null;
    private worldInfo: LandWorldInfo | null = null;
    private blocks = new Map<string, LandBlock>();
    private onChainRaw = new Map<string, any[]>();
    private walletBalance = 0;
    private listeners = new Set<() => void>();

    constructor(
        private readonly engine: () => Engine | null,
        private readonly content: WorldContent,
        private readonly ipfsChannel: () => HttpChannel | null,
    ) {}

    public get enabled(): boolean { return this.registry != null && this.worldInfo != null; }

    public onChange(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private notify(): void {
        for (const cb of this.listeners) cb();
    }

    /**
     * Activate the land registry if (1) the build includes a plugin, (2) the
     * world config has a `land` section (or `?land=1` forces it), and (3) the
     * registry world account is live on chain. Any miss cleanly leaves land
     * mode disabled (offline-first).
     */
    public async init(worldDoc: any): Promise<void> {
        const cfg: LandConfig | undefined = worldDoc?.land;
        if (!cfg) return;
        const env = (import.meta as any).env ?? {};
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        if (params?.get('land') === '0') return;
        const resolved: LandConfig = {
            ...cfg,
            rpc: params?.get('solana_rpc') || env.VITE_SOLANA_RPC || cfg.rpc,
        };
        try {
            const reg = await createLandRegistry(resolved);
            if (!reg) return;
            const info = await reg.info();
            if (!info) {
                console.log(`[Land] registry unreachable or world "${resolved.world}" not initialized — running standalone`);
                return;
            }
            this.registry = reg;
            this.worldInfo = info;
            this.content.setChainLayer({
                rawAt: (x, y) => this.rawAt(x, y),
                onGridWindow: (coords) => { void this.syncCoords(coords); },
            });
            console.log(`[Land] online: ${info.chain}/${resolved.cluster} world="${info.world}" program=${resolved.program}`);
            this.notify();
        } catch (e) {
            console.warn('[Land] init skipped:', e);
        }
    }

    /** On-chain BlockRaw for (x, y), if fetched and not banned. */
    public rawAt(x: number, y: number): any[] | null {
        const key = `${x}_${y}`;
        const meta = this.blocks.get(key);
        if (!meta || meta.status === 'banned' || !meta.cid) return null;
        return this.onChainRaw.get(key) ?? null;
    }

    public blockState(x: number, y: number): LandBlock {
        return this.blocks.get(`${x}_${y}`) ?? {
            x, y, status: 'unminted', owner: null, cid: null, price: 0, revision: 0,
        };
    }

    /** Ownership gate (land.md §4): standalone = always true; with land active,
     *  only the connected owner of an `owned` (non-listed, non-banned) block. */
    public canEdit(x: number, y: number): boolean {
        if (!this.enabled) return true;
        const w = this.registry?.wallet();
        if (!w) return false;
        const b = this.blockState(x, y);
        return b.status === 'owned' && b.owner === w;
    }

    /** Fetch on-chain metadata (+ CID content from CAS/IPFS) for a batch of coordinates. */
    public async syncCoords(coords: [number, number][]): Promise<void> {
        if (!this.registry || coords.length === 0) return;
        try {
            const list = await this.registry.getBlocks(coords);
            const engine = this.engine();
            const cas = engine?.getWorld()?.blockCas;
            let changed = false;

            for (const item of list) {
                const key = `${item.x}_${item.y}`;
                const prev = this.blocks.get(key);
                this.blocks.set(key, item);
                if (!prev || prev.status !== item.status || prev.owner !== item.owner || prev.cid !== item.cid || prev.price !== item.price) {
                    changed = true;
                }
                if (item.cid && item.status !== 'banned' && cas) {
                    if (prev?.cid !== item.cid || !this.onChainRaw.has(key)) {
                        try {
                            const raw = await cas.get(item.cid);
                            this.onChainRaw.set(key, raw);
                            this.content.rematerializeBlock(item.x, item.y);
                            changed = true;
                        } catch (e) {
                            console.warn(`[Land] failed to fetch block CID ${item.cid} for ${key}:`, e);
                        }
                    }
                } else if (this.onChainRaw.has(key)) {
                    this.onChainRaw.delete(key);
                    this.content.rematerializeBlock(item.x, item.y);
                    changed = true;
                }
            }
            if (changed) this.notify();
        } catch (e) {
            console.warn('[Land] syncCoords failed:', e);
        }
    }

    public async refreshCurrent(): Promise<LandBlock | null> {
        const [bx, by] = this.content.playerState.block;
        await this.syncCoords([[bx, by]]);
        if (this.registry?.wallet()) {
            this.walletBalance = await this.registry.balance();
            this.notify();
        }
        return this.blockState(bx, by);
    }

    // ── IChainPublisher ───────────────────────────────────────────────────────

    /** Put canonical block bytes into the local CAS AND replicate to the HTTP
     *  IPFS gateway so other clients (browsers) can fetch the CID. */
    public async uploadData(raw: any): Promise<string> {
        const engine = this.engine();
        const cas = engine?.getWorld()?.blockCas;
        if (!cas) throw new Error('engine CAS not ready');
        const cid = await cas.put(raw);
        const ch = this.ipfsChannel();
        if (ch) {
            try {
                await ch.postBytes('/v0/add', canonicalBlockBytes(raw));
            } catch (e) {
                console.warn('[Land] gateway pin failed (local CAS still holds bytes):', e);
            }
        }
        return cid;
    }

    public async commitBlock(blockKey: string, cid: string): Promise<string> {
        if (!this.registry) throw new Error('land registry not active');
        const [x, y] = blockKey.split('_').map(Number);
        const sig = await this.registry.setContent(x, y, cid);
        await this.syncCoords([[x, y]]);
        return sig;
    }

    // ── Wallet + land actions (driven by UI and e2e) ──────────────────────────

    public async connectWallet(): Promise<string> {
        if (!this.registry) throw new Error('land registry not active');
        const addr = await this.registry.connect();
        this.walletBalance = await this.registry.balance();
        await this.refreshCurrent();
        this.notify();
        return addr;
    }

    public async disconnectWallet(): Promise<void> {
        if (!this.registry) return;
        await this.registry.disconnect();
        this.walletBalance = 0;
        if (this.engine()?.getWorld()?.mode === 'edit') {
            this.engine()?.setMode('normal' as any);
        }
        this.notify();
    }

    public async mint(x?: number, y?: number): Promise<string> {
        if (!this.registry) throw new Error('land registry not active');
        const [bx, by] = [x ?? this.content.playerState.block[0], y ?? this.content.playerState.block[1]];
        const sig = await this.registry.mint(bx, by);
        this.walletBalance = await this.registry.balance();
        await this.syncCoords([[bx, by]]);
        return sig;
    }

    /** Encode current effective block → upload to IPFS → commit CID to Solana →
     *  clear the local draft (now clean against chain). */
    public async publishOnChain(x?: number, y?: number): Promise<{ cid: string; signature: string }> {
        if (!this.registry) throw new Error('land registry not active');
        const [bx, by] = [x ?? this.content.playerState.block[0], y ?? this.content.playerState.block[1]];
        const eff = this.content.blockAt(bx, by);
        if (!eff) throw new Error('block not loaded');
        const cid = await this.uploadData(eff.raw);
        const signature = await this.commitBlock(`${bx}_${by}`, cid);
        this.onChainRaw.set(`${bx}_${by}`, eff.raw);
        this.engine()?.getWorld()?.draftStore.remove(0, bx, by);
        this.content.rematerializeBlock(bx, by);
        this.walletBalance = await this.registry.balance();
        await this.syncCoords([[bx, by]]);
        return { cid, signature };
    }

    public async listForSale(priceLamports: number, x?: number, y?: number): Promise<string> {
        if (!this.registry) throw new Error('land registry not active');
        const [bx, by] = [x ?? this.content.playerState.block[0], y ?? this.content.playerState.block[1]];
        if (this.engine()?.getWorld()?.mode === 'edit') {
            this.engine()?.setMode('normal' as any);
        }
        const sig = await this.registry.list(bx, by, priceLamports);
        this.walletBalance = await this.registry.balance();
        await this.syncCoords([[bx, by]]);
        return sig;
    }

    public async delist(x?: number, y?: number): Promise<string> {
        if (!this.registry) throw new Error('land registry not active');
        const [bx, by] = [x ?? this.content.playerState.block[0], y ?? this.content.playerState.block[1]];
        const sig = await this.registry.delist(bx, by);
        this.walletBalance = await this.registry.balance();
        await this.syncCoords([[bx, by]]);
        return sig;
    }

    public async buy(x?: number, y?: number): Promise<string> {
        if (!this.registry) throw new Error('land registry not active');
        const [bx, by] = [x ?? this.content.playerState.block[0], y ?? this.content.playerState.block[1]];
        const cur = (await this.registry.getBlocks([[bx, by]]))[0];
        if (!cur || cur.status !== 'listed') throw new Error('block is not listed for sale');
        const sig = await this.registry.buy(bx, by, cur.price);
        this.walletBalance = await this.registry.balance();
        await this.syncCoords([[bx, by]]);
        return sig;
    }

    public snapshot(): LandUiSnapshot {
        const [bx, by] = this.content.playerState.block;
        const hasDraft = !!this.engine()?.getWorld()?.draftStore.hasDraft(0, bx, by);
        return {
            enabled: this.enabled,
            chain: this.worldInfo?.chain ?? null,
            cluster: this.registry?.config.cluster ?? null,
            world: this.worldInfo?.world ?? null,
            mintPrice: this.worldInfo?.mintPrice ?? 0,
            unit: this.worldInfo?.unit ?? 'SOL',
            decimals: this.worldInfo?.decimals ?? 9,
            wallet: this.registry?.wallet() ?? null,
            walletKind: this.registry?.walletKind() ?? null,
            balance: this.walletBalance,
            block: this.enabled ? this.blockState(bx, by) : null,
            hasDraft,
            canEdit: this.canEdit(bx, by),
        };
    }
}
