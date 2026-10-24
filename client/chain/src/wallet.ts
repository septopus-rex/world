/**
 * Wallets for the land plugin.
 *
 *  · InjectedWallet — any Wallet-Standard-era injected provider exposing the
 *    classic `window.solana` surface (Phantom, Backpack, Solflare legacy):
 *    connect() → publicKey, signTransaction(tx).
 *  · BurnerWallet — DEV ONLY (localnet / devnet): a keypair kept in
 *    localStorage, auto-funded by airdrop. This is what the Playwright suite
 *    drives (each browser context = its own burner = its own player). Refused
 *    on mainnet-beta by construction.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';

export interface LandWallet {
    readonly kind: 'injected' | 'dev-burner';
    readonly publicKey: PublicKey | null;
    connect(): Promise<PublicKey>;
    disconnect(): Promise<void>;
    signTransaction(tx: Transaction): Promise<Transaction>;
}

export function injectedProvider(): any | null {
    const g = globalThis as any;
    const p = g.phantom?.solana ?? g.solana ?? null;
    return p && typeof p.connect === 'function' && typeof p.signTransaction === 'function' ? p : null;
}

export class InjectedWallet implements LandWallet {
    readonly kind = 'injected' as const;
    constructor(private readonly provider: any) {}
    get publicKey(): PublicKey | null {
        const pk = this.provider.publicKey;
        return pk ? new PublicKey(pk.toString()) : null;
    }
    async connect(): Promise<PublicKey> {
        const r = await this.provider.connect();
        return new PublicKey((r?.publicKey ?? this.provider.publicKey).toString());
    }
    async disconnect(): Promise<void> { await this.provider.disconnect?.(); }
    signTransaction(tx: Transaction): Promise<Transaction> { return this.provider.signTransaction(tx); }
}

const b64 = {
    enc: (u: Uint8Array) => btoa(String.fromCharCode(...u)),
    dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

export class BurnerWallet implements LandWallet {
    readonly kind = 'dev-burner' as const;
    private kp: Keypair | null = null;
    private readonly storageKey: string;

    constructor(private readonly conn: Connection, private readonly cluster: string) {
        if (cluster === 'mainnet-beta') throw new Error('dev burner wallet is refused on mainnet-beta');
        this.storageKey = `septopus.land.burner.${cluster}`;
    }

    get publicKey(): PublicKey | null { return this.kp?.publicKey ?? null; }

    async connect(): Promise<PublicKey> {
        if (!this.kp) {
            let kp: Keypair | null = null;
            try {
                const saved = localStorage.getItem(this.storageKey);
                if (saved) kp = Keypair.fromSecretKey(b64.dec(saved));
            } catch { /* corrupt → fresh */ }
            if (!kp) {
                kp = Keypair.generate();
                try { localStorage.setItem(this.storageKey, b64.enc(kp.secretKey)); } catch { /* private mode */ }
            }
            this.kp = kp;
        }
        await this.ensureFunded();
        return this.kp.publicKey;
    }

    /** Top up to ≥ 2 SOL by airdrop (localnet always works; devnet is rate-limited). */
    private async ensureFunded(): Promise<void> {
        const pk = this.kp!.publicKey;
        if ((await this.conn.getBalance(pk)) >= 2 * LAMPORTS_PER_SOL) return;
        try {
            const sig = await this.conn.requestAirdrop(pk, 10 * LAMPORTS_PER_SOL);
            const bh = await this.conn.getLatestBlockhash();
            await this.conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
        } catch (e) {
            console.warn('[land] airdrop failed (devnet faucet limit?):', e);
        }
    }

    async disconnect(): Promise<void> { this.kp = null; }

    async signTransaction(tx: Transaction): Promise<Transaction> {
        if (!this.kp) throw new Error('wallet not connected');
        tx.partialSign(this.kp);
        return tx;
    }
}
