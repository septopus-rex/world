/**
 * Simulated shared-server implementation of ILandRegistry (`SEPTOPUS_LAND=sim`).
 *
 * Talks to `services/land-sim` (:7792) via the unified `HttpChannel` seam —
 * zero `@solana/*` bundle weight, zero browser wallet extension required, and
 * every new player account starts with 10 SOL on first connect.
 *
 * When ready to connect the real Solana `septopus_land` contract, rebuild with
 * `SEPTOPUS_LAND=solana`: `LandCoordinator`, `LandPanel`, `WorldMap2D` and
 * `BlockDetailPage` require zero changes.
 */
import { HttpChannel } from '../net/HttpChannel';
import type { ILandRegistry, LandBlock, LandConfig, LandWorldInfo } from './types';

export const LAND_PLUGIN = 'sim';

const SLOT_KEY = 'septopus.land.sim.slot';
const SECRET_PREFIX = 'septopus.land.sim.secret';

function randomHex(bytes = 24): string {
    const arr = new Uint8Array(bytes);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(arr);
    } else {
        for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readSlot(): number {
    try {
        const n = Number(localStorage.getItem(SLOT_KEY) || '1');
        return n >= 1 && n <= 3 ? Math.floor(n) : 1;
    } catch {
        return 1;
    }
}

function secretStorageKey(slot: number): string {
    return slot === 1 ? SECRET_PREFIX : `${SECRET_PREFIX}.${slot}`;
}

function loadOrCreateSecret(slot: number): string {
    const key = secretStorageKey(slot);
    try {
        const saved = localStorage.getItem(key);
        if (saved && saved.length >= 16) return saved;
        const fresh = randomHex(24);
        localStorage.setItem(key, fresh);
        return fresh;
    } catch {
        return randomHex(24);
    }
}

function resolveSimEndpoint(cfg: LandConfig): string {
    const env = (import.meta as any).env ?? {};
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const override = params?.get('land_sim') || env.VITE_LAND_SIM_SERVER;
    if (override) return String(override).replace(/\/+$/, '');
    if (cfg.rpc && /^https?:\/\//.test(cfg.rpc) && cfg.chain === 'sim') {
        return cfg.rpc.replace(/\/+$/, '');
    }
    return 'http://127.0.0.1:7792';
}

export class SimLandRegistry implements ILandRegistry {
    public readonly chain = 'sim';
    public readonly config: LandConfig;
    private readonly ch: HttpChannel;
    private slot: number = readSlot();
    private activeSecret: string | null = null;
    private activeAddress: string | null = null;
    private cachedBalance = 0;

    constructor(cfg: LandConfig) {
        const base = resolveSimEndpoint(cfg);
        this.config = { ...cfg, chain: 'sim', cluster: 'simnet', rpc: base };
        this.ch = new HttpChannel(base, '/v0/health');
    }

    async info(): Promise<LandWorldInfo | null> {
        try {
            if (!(await this.ch.probe())) return null;
            const res = await this.ch.getJson(`/v0/info?world=${encodeURIComponent(this.config.world)}`);
            return res?.ok && res.info ? (res.info as LandWorldInfo) : null;
        } catch {
            return null;
        }
    }

    wallet(): string | null {
        return this.activeAddress;
    }

    walletKind(): string | null {
        return this.activeAddress ? 'sim' : null;
    }

    accountSlot(): number {
        return this.slot;
    }

    async connect(): Promise<string> {
        this.slot = readSlot();
        const secret = loadOrCreateSecret(this.slot);
        const res = await this.postChecked('/v0/wallet/connect', { secret });
        this.activeSecret = secret;
        this.activeAddress = String(res.address);
        this.cachedBalance = Number(res.balance ?? 0);
        return this.activeAddress;
    }

    async disconnect(): Promise<void> {
        this.activeSecret = null;
        this.activeAddress = null;
        this.cachedBalance = 0;
    }

    async switchAccount(): Promise<string> {
        const next = (this.slot % 3) + 1;
        this.slot = next;
        try { localStorage.setItem(SLOT_KEY, String(next)); } catch { /* ignore */ }
        return this.connect();
    }

    async balance(): Promise<number> {
        if (!this.activeAddress) return 0;
        try {
            const res = await this.ch.getJson(`/v0/wallet/balance?address=${encodeURIComponent(this.activeAddress)}`);
            if (typeof res?.balance === 'number') this.cachedBalance = res.balance;
            return this.cachedBalance;
        } catch {
            return this.cachedBalance;
        }
    }

    async getBlocks(coords: [number, number][]): Promise<LandBlock[]> {
        if (coords.length === 0) return [];
        const res = await this.postChecked('/v0/blocks', {
            world: this.config.world,
            coords,
        });
        return Array.isArray(res?.blocks) ? (res.blocks as LandBlock[]) : [];
    }

    private authHeaders(): Record<string, string> {
        if (!this.activeSecret || !this.activeAddress) {
            throw new Error('请先激活模拟钱包');
        }
        return { authorization: `Bearer ${this.activeSecret}` };
    }

    private async postChecked(path: string, body: unknown, auth = false): Promise<any> {
        const headers = auth ? this.authHeaders() : undefined;
        const { ok, status, data } = await this.ch.postJsonFull(path, body, { headers, timeoutMs: 15000 });
        if (!ok || !data || data.ok === false) {
            throw new Error(data?.error || `[land-sim] ${path} failed (${status})`);
        }
        return data;
    }

    async mint(x: number, y: number): Promise<string> {
        const res = await this.postChecked('/v0/mint', { world: this.config.world, x, y }, true);
        if (typeof res.balance === 'number') this.cachedBalance = res.balance;
        return String(res.signature);
    }

    async setContent(x: number, y: number, cid: string | null): Promise<string> {
        const res = await this.postChecked('/v0/set-content', { world: this.config.world, x, y, cid }, true);
        return String(res.signature);
    }

    async list(x: number, y: number, price: number): Promise<string> {
        const res = await this.postChecked('/v0/list', { world: this.config.world, x, y, price }, true);
        return String(res.signature);
    }

    async delist(x: number, y: number): Promise<string> {
        const res = await this.postChecked('/v0/delist', { world: this.config.world, x, y }, true);
        return String(res.signature);
    }

    async buy(x: number, y: number, expectedPrice: number): Promise<string> {
        const res = await this.postChecked('/v0/buy', { world: this.config.world, x, y, expectedPrice }, true);
        if (typeof res.balance === 'number') this.cachedBalance = res.balance;
        return String(res.signature);
    }
}

export async function createLandRegistry(cfg: LandConfig): Promise<ILandRegistry | null> {
    return new SimLandRegistry(cfg);
}
