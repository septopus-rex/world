/**
 * septopus_land program client — pure Uint8Array/DataView borsh over the Anchor
 * IDL (`chain/target/idl/septopus_land.json` → copied to ./idl/).
 *
 * Uses standard Web APIs (Uint8Array, DataView, TextEncoder/TextDecoder) rather
 * than Node's `buffer` module, so Vite 8 never externalizes `Buffer` in the
 * browser bundle. Shared by the browser plugin AND the node scripts.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import idl from './idl/septopus_land.json';

export const IDL = idl as any;

const enc = new TextEncoder();
const dec = new TextDecoder();

const disc = (name: string): Uint8Array => {
    const ix = IDL.instructions.find((i: any) => i.name === name);
    if (!ix) throw new Error(`IDL has no instruction ${name}`);
    return Uint8Array.from(ix.discriminator);
};
const accDisc = (name: string): number[] => IDL.accounts.find((a: any) => a.name === name).discriminator;

export const STATUS = { OWNED: 0, LISTED: 1, BANNED: 2 } as const;

// ─── binary helpers (no Node Buffer) ─────────────────────────────────────────

const u32le = (n: number): Uint8Array => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    return b;
};

const u64le = (n: number | bigint): Uint8Array => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
    return b;
};

function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((s, p) => s + p.byteLength, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.byteLength; }
    return out;
}

// ─── PDAs ────────────────────────────────────────────────────────────────────

export function worldPda(program: PublicKey, name: string): PublicKey {
    return PublicKey.findProgramAddressSync([enc.encode('world'), enc.encode(name)], program)[0];
}

export function blockPda(program: PublicKey, world: PublicKey, x: number, y: number): PublicKey {
    return PublicKey.findProgramAddressSync([enc.encode('block'), world.toBytes(), u32le(x), u32le(y)], program)[0];
}

// ─── accounts ────────────────────────────────────────────────────────────────

export interface WorldAccount {
    authority: PublicKey; treasury: PublicKey; name: string;
    rangeX: number; rangeY: number; mintPrice: bigint; minted: bigint; frozen: boolean;
}

export interface BlockAccount {
    world: PublicKey; x: number; y: number; owner: PublicKey; content: Uint8Array;
    price: bigint; status: number; revision: number; mintedSlot: bigint; updatedSlot: bigint;
}

function checkDisc(data: Uint8Array, expected: number[], what: string) {
    for (let i = 0; i < 8; i++) if (data[i] !== expected[i]) throw new Error(`not a ${what} account`);
}

export function decodeWorld(raw: Uint8Array): WorldAccount {
    const b = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    checkDisc(b, accDisc('World'), 'World');
    let o = 8;
    const authority = new PublicKey(b.subarray(o, o + 32)); o += 32;
    const treasury = new PublicKey(b.subarray(o, o + 32)); o += 32;
    const len = dv.getUint32(o, true); o += 4;
    const name = dec.decode(b.subarray(o, o + len)); o += len;
    const rangeX = dv.getUint32(o, true); o += 4;
    const rangeY = dv.getUint32(o, true); o += 4;
    const mintPrice = dv.getBigUint64(o, true); o += 8;
    const minted = dv.getBigUint64(o, true); o += 8;
    const frozen = b[o] === 1;
    return { authority, treasury, name, rangeX, rangeY, mintPrice, minted, frozen };
}

export function decodeBlock(raw: Uint8Array): BlockAccount {
    const b = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    checkDisc(b, accDisc('Block'), 'Block');
    let o = 8;
    const world = new PublicKey(b.subarray(o, o + 32)); o += 32;
    const x = dv.getUint32(o, true); o += 4;
    const y = dv.getUint32(o, true); o += 4;
    const owner = new PublicKey(b.subarray(o, o + 32)); o += 32;
    const content = new Uint8Array(b.subarray(o, o + 32)); o += 32;
    const price = dv.getBigUint64(o, true); o += 8;
    const status = b[o]; o += 1;
    const revision = dv.getUint32(o, true); o += 4;
    const mintedSlot = dv.getBigUint64(o, true); o += 8;
    const updatedSlot = dv.getBigUint64(o, true);
    return { world, x, y, owner, content, price, status, revision, mintedSlot, updatedSlot };
}

// ─── instructions ────────────────────────────────────────────────────────────

const ixData = (name: string, ...parts: Uint8Array[]) => concat(disc(name), ...parts) as any;
const meta = (pubkey: PublicKey, isWritable: boolean, isSigner = false) => ({ pubkey, isWritable, isSigner });

export function ixInitWorld(program: PublicKey, authority: PublicKey, treasury: PublicKey, name: string, rangeX: number, rangeY: number, mintPrice: number | bigint) {
    const nameBytes = enc.encode(name);
    return new TransactionInstruction({
        programId: program,
        keys: [meta(worldPda(program, name), true), meta(authority, true, true), meta(treasury, false), meta(SystemProgram.programId, false)],
        data: ixData('init_world', u32le(nameBytes.length), nameBytes, u32le(rangeX), u32le(rangeY), u64le(mintPrice)),
    });
}

export function ixMintBlock(program: PublicKey, world: PublicKey, payer: PublicKey, treasury: PublicKey, x: number, y: number) {
    return new TransactionInstruction({
        programId: program,
        keys: [meta(world, true), meta(blockPda(program, world, x, y), true), meta(payer, true, true), meta(treasury, true), meta(SystemProgram.programId, false)],
        data: ixData('mint_block', u32le(x), u32le(y)),
    });
}

function ownerIx(name: string, program: PublicKey, world: PublicKey, owner: PublicKey, x: number, y: number, ...args: Uint8Array[]) {
    return new TransactionInstruction({
        programId: program,
        keys: [meta(world, false), meta(blockPda(program, world, x, y), true), meta(owner, false, true)],
        data: ixData(name, u32le(x), u32le(y), ...args),
    });
}

export const ixSetContent = (p: PublicKey, w: PublicKey, owner: PublicKey, x: number, y: number, digest: Uint8Array) =>
    ownerIx('set_content', p, w, owner, x, y, digest);
export const ixListBlock = (p: PublicKey, w: PublicKey, owner: PublicKey, x: number, y: number, price: number | bigint) =>
    ownerIx('list_block', p, w, owner, x, y, u64le(price));
export const ixDelistBlock = (p: PublicKey, w: PublicKey, owner: PublicKey, x: number, y: number) =>
    ownerIx('delist_block', p, w, owner, x, y);
export const ixTransferBlock = (p: PublicKey, w: PublicKey, owner: PublicKey, x: number, y: number, to: PublicKey) =>
    ownerIx('transfer_block', p, w, owner, x, y, to.toBytes());

export function ixBuyBlock(program: PublicKey, world: PublicKey, buyer: PublicKey, seller: PublicKey, x: number, y: number, expectedPrice: number | bigint) {
    return new TransactionInstruction({
        programId: program,
        keys: [meta(world, false), meta(blockPda(program, world, x, y), true), meta(buyer, true, true), meta(seller, true), meta(SystemProgram.programId, false)],
        data: ixData('buy_block', u32le(x), u32le(y), u64le(expectedPrice)),
    });
}

export function ixModerateBlock(program: PublicKey, world: PublicKey, authority: PublicKey, x: number, y: number, banned: boolean) {
    return new TransactionInstruction({
        programId: program,
        keys: [meta(world, false), meta(blockPda(program, world, x, y), true), meta(authority, false, true)],
        data: ixData('moderate_block', u32le(x), u32le(y), new Uint8Array([banned ? 1 : 0])),
    });
}

// ─── errors ──────────────────────────────────────────────────────────────────

/** Map a failed-transaction error to the program's readable message, if it is one. */
export function explainError(e: any): string {
    const text = String(e?.message ?? e);
    const logs: string[] = e?.logs ?? e?.transactionLogs ?? [];
    const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
    const code = hex ? parseInt(hex[1], 16) : (() => {
        const m = [...logs, text].join('\n').match(/Error Number: (\d+)/);
        return m ? Number(m[1]) : null;
    })();
    if (code != null) {
        const err = IDL.errors.find((x: any) => x.code === code);
        if (err) return `${err.name}: ${err.msg}`;
        if (code === 0) return 'AccountAlreadyInUse: block already minted';
        if (code === 1) return 'InsufficientFunds: not enough SOL';
    }
    if (/already in use/.test(text)) return 'AccountAlreadyInUse: block already minted';
    return text;
}
