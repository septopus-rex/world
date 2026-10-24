/**
 * Idempotent localnet world initializer: ensures the World PDA for the default
 * world ('septopus') exists on the running validator, with range [4096, 4096]
 * and mint_price = 0.1 SOL (100_000_000 lamports). Safe to re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { decodeWorld, ixInitWorld, worldPda } from '../src/program';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RPC = process.env.SOLANA_RPC ?? 'http://127.0.0.1:8899';
const WORLD_NAME = process.env.WORLD_NAME ?? 'septopus';
const RANGE_X = Number(process.env.RANGE_X ?? 4096);
const RANGE_Y = Number(process.env.RANGE_Y ?? 4096);
const MINT_PRICE = BigInt(process.env.MINT_PRICE ?? 100_000_000); // 0.1 SOL

function loadKeypair(rel: string): Keypair {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
    const conn = new Connection(RPC, 'confirmed');
    const programKp = loadKeypair('chain/keys/septopus_land-keypair.json');
    const authority = loadKeypair('chain/keys/world-authority.json');
    const program = programKp.publicKey;
    const pda = worldPda(program, WORLD_NAME);

    if ((await conn.getBalance(authority.publicKey)) < 2 * LAMPORTS_PER_SOL) {
        const sig = await conn.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);
        const bh = await conn.getLatestBlockhash();
        await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    }

    const existing = await conn.getAccountInfo(pda);
    if (existing) {
        const w = decodeWorld(existing.data);
        console.log(`[init-world] already exists: ${w.name} (${pda.toBase58()}) range=[${w.rangeX},${w.rangeY}] minted=${w.minted}`);
        return;
    }

    const ix = ixInitWorld(program, authority.publicKey, authority.publicKey, WORLD_NAME, RANGE_X, RANGE_Y, MINT_PRICE);
    const bh = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: authority.publicKey, ...bh }).add(ix);
    tx.sign(authority);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');

    const check = await conn.getAccountInfo(pda);
    const w = decodeWorld(check!.data);
    console.log(`[init-world] initialized "${w.name}" → ${pda.toBase58()} (program ${program.toBase58()}, price ${ Number(w.mintPrice) / LAMPORTS_PER_SOL } SOL)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
