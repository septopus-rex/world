/**
 * Solana implementation of ILandRegistry (protocol/cn|en/land.md).
 *
 * Lives under client/chain/ — NEVER imported by the pure desktop/mobile build.
 * Wired in only when the build is invoked with SEPTOPUS_LAND=solana (via the
 * `@land-plugin` Vite alias).
 */
import { Buffer } from 'buffer';
import { Connection, PublicKey, Transaction, TransactionInstruction, clusterApiUrl } from '@solana/web3.js';

if (typeof globalThis !== 'undefined' && !(globalThis as any).Buffer) {
    (globalThis as any).Buffer = Buffer;
}
import type { ILandRegistry, LandBlock, LandConfig, LandStatus, LandWorldInfo } from '../../core/src/land/types';
import { cidToDigest, digestToCid } from '../../core/src/land/cid';
import {
    STATUS,
    WorldAccount,
    blockPda,
    decodeBlock,
    decodeWorld,
    explainError,
    ixBuyBlock,
    ixDelistBlock,
    ixListBlock,
    ixMintBlock,
    ixSetContent,
    worldPda,
} from './program';
import { BurnerWallet, InjectedWallet, LandWallet, injectedProvider } from './wallet';

export const LAND_PLUGIN = 'solana';

function rpcEndpoint(cfg: LandConfig): string {
    if (cfg.rpc) return cfg.rpc;
    if (cfg.cluster === 'localnet') return 'http://127.0.0.1:8899';
    if (cfg.cluster === 'devnet' || cfg.cluster === 'testnet' || cfg.cluster === 'mainnet-beta') {
        return clusterApiUrl(cfg.cluster);
    }
    return cfg.cluster;
}

const statusName = (s: number): LandStatus =>
    s === STATUS.LISTED ? 'listed' : s === STATUS.BANNED ? 'banned' : 'owned';

export class SolanaLandRegistry implements ILandRegistry {
    public readonly chain = 'solana';
    private readonly conn: Connection;
    private readonly program: PublicKey;
    private readonly worldPubkey: PublicKey;
    private activeWallet: LandWallet | null = null;
    private cachedWorld: WorldAccount | null = null;

    constructor(public readonly config: LandConfig) {
        this.conn = new Connection(rpcEndpoint(config), 'confirmed');
        this.program = new PublicKey(config.program);
        this.worldPubkey = worldPda(this.program, config.world);
    }

    private async fetchWorld(fresh = false): Promise<WorldAccount | null> {
        if (this.cachedWorld && !fresh) return this.cachedWorld;
        try {
            const acc = await this.conn.getAccountInfo(this.worldPubkey);
            if (!acc) return null;
            this.cachedWorld = decodeWorld(acc.data);
            return this.cachedWorld;
        } catch {
            return null;
        }
    }

    async info(): Promise<LandWorldInfo | null> {
        const w = await this.fetchWorld(true);
        if (!w) return null;
        return {
            chain: 'solana',
            world: w.name,
            mintPrice: Number(w.mintPrice),
            range: [w.rangeX, w.rangeY],
            minted: Number(w.minted),
            frozen: w.frozen,
            unit: 'SOL',
            decimals: 9,
        };
    }

    wallet(): string | null {
        return this.activeWallet?.publicKey?.toBase58() ?? null;
    }

    walletKind(): string | null {
        return this.activeWallet?.kind ?? null;
    }

    async connect(): Promise<string> {
        if (!this.activeWallet) {
            const injected = injectedProvider();
            this.activeWallet = injected
                ? new InjectedWallet(injected)
                : new BurnerWallet(this.conn, this.config.cluster);
        }
        const pk = await this.activeWallet.connect();
        return pk.toBase58();
    }

    async disconnect(): Promise<void> {
        await this.activeWallet?.disconnect();
        this.activeWallet = null;
    }

    async balance(): Promise<number> {
        const pk = this.activeWallet?.publicKey;
        if (!pk) return 0;
        try {
            return await this.conn.getBalance(pk);
        } catch {
            return 0;
        }
    }

    async getBlocks(coords: [number, number][]): Promise<LandBlock[]> {
        if (coords.length === 0) return [];
        const pdas = coords.map(([x, y]) => blockPda(this.program, this.worldPubkey, x, y));
        const infos = await this.conn.getMultipleAccountsInfo(pdas);
        return coords.map(([x, y], i) => {
            const info = infos[i];
            if (!info) {
                return { x, y, status: 'unminted', owner: null, cid: null, price: 0, revision: 0 };
            }
            const b = decodeBlock(info.data);
            return {
                x,
                y,
                status: statusName(b.status),
                owner: b.owner.toBase58(),
                cid: digestToCid(b.content),
                price: Number(b.price),
                revision: b.revision,
            };
        });
    }

    private requireSigner(): PublicKey {
        const pk = this.activeWallet?.publicKey;
        if (!pk) throw new Error('wallet not connected');
        return pk;
    }

    private async send(ix: TransactionInstruction): Promise<string> {
        const signer = this.requireSigner();
        try {
            const bh = await this.conn.getLatestBlockhash('confirmed');
            const tx = new Transaction({
                feePayer: signer,
                blockhash: bh.blockhash,
                lastValidBlockHeight: bh.lastValidBlockHeight,
            }).add(ix);
            const signed = await this.activeWallet!.signTransaction(tx);
            const sig = await this.conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
            await this.conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
            return sig;
        } catch (e) {
            throw new Error(explainError(e));
        }
    }

    async mint(x: number, y: number): Promise<string> {
        const signer = this.requireSigner();
        const w = await this.fetchWorld();
        if (!w) throw new Error(`world "${this.config.world}" not initialized on chain`);
        return this.send(ixMintBlock(this.program, this.worldPubkey, signer, w.treasury, x, y));
    }

    async setContent(x: number, y: number, cid: string | null): Promise<string> {
        const signer = this.requireSigner();
        const digest = cid ? cidToDigest(cid) : new Uint8Array(32);
        return this.send(ixSetContent(this.program, this.worldPubkey, signer, x, y, digest));
    }

    async list(x: number, y: number, price: number): Promise<string> {
        const signer = this.requireSigner();
        return this.send(ixListBlock(this.program, this.worldPubkey, signer, x, y, price));
    }

    async delist(x: number, y: number): Promise<string> {
        const signer = this.requireSigner();
        return this.send(ixDelistBlock(this.program, this.worldPubkey, signer, x, y));
    }

    async buy(x: number, y: number, expectedPrice: number): Promise<string> {
        const buyer = this.requireSigner();
        const [cur] = await this.getBlocks([[x, y]]);
        if (!cur || !cur.owner) throw new Error('block is not minted');
        const seller = new PublicKey(cur.owner);
        return this.send(ixBuyBlock(this.program, this.worldPubkey, buyer, seller, x, y, expectedPrice));
    }
}

export async function createLandRegistry(cfg: LandConfig): Promise<ILandRegistry | null> {
    if (cfg.chain !== 'solana') return null;
    return new SolanaLandRegistry(cfg);
}
