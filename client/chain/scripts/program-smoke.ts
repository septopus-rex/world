/**
 * Direct-RPC smoke test of every septopus_land instruction against a live
 * localnet validator: init_world → mint_block → set_content (with real CIDv1
 * round-trip) → list_block → guard against set_content while listed →
 * buy_block (with price-mismatch guard) → delist → moderate_block (ban/unban).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, TransactionInstruction } from '@solana/web3.js';
import { cidToDigest, digestToCid } from '../../core/src/land/cid';
import {
    STATUS,
    blockPda,
    decodeBlock,
    decodeWorld,
    explainError,
    ixBuyBlock,
    ixDelistBlock,
    ixInitWorld,
    ixListBlock,
    ixMintBlock,
    ixModerateBlock,
    ixSetContent,
    worldPda,
} from '../src/program';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const conn = new Connection(process.env.SOLANA_RPC ?? 'http://127.0.0.1:8899', 'confirmed');

function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function fund(kp: Keypair, sol = 5) {
    const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
}

async function send(signer: Keypair, ix: TransactionInstruction) {
    const bh = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: signer.publicKey, ...bh }).add(ix);
    tx.sign(signer);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    return sig;
}

async function expectFail(fn: () => Promise<unknown>, needle: string) {
    let failed = false;
    try { await fn(); }
    catch (e) {
        failed = true;
        const msg = explainError(e);
        assert(msg.includes(needle), `expected "${needle}", got "${msg}"`);
    }
    assert(failed, `expected failure (${needle}) but succeeded`);
}

async function main() {
    const programKp = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, 'chain/keys/septopus_land-keypair.json'), 'utf8'))),
    );
    const program = programKp.publicKey;
    const authority = Keypair.generate();
    const treasury = Keypair.generate();
    const alice = Keypair.generate();
    const bob = Keypair.generate();
    await Promise.all([fund(authority), fund(alice), fund(bob)]);

    const worldName = `smoke_${Date.now().toString(36)}`;
    const wPda = worldPda(program, worldName);
    const price = 100_000_000n; // 0.1 SOL

    await send(authority, ixInitWorld(program, authority.publicKey, treasury.publicKey, worldName, 64, 64, price));
    const w0 = decodeWorld((await conn.getAccountInfo(wPda))!.data);
    assert(w0.name === worldName && w0.rangeX === 64 && w0.mintPrice === price, 'world initialized');

    // Out-of-range coordinate is rejected.
    await expectFail(() => send(alice, ixMintBlock(program, wPda, alice.publicKey, treasury.publicKey, 65, 1)), 'OutOfRange');

    // Alice mints (10, 20); treasury receives mint_price.
    await send(alice, ixMintBlock(program, wPda, alice.publicKey, treasury.publicKey, 10, 20));
    assert((await conn.getBalance(treasury.publicKey)) === Number(price), 'treasury received mint fee');
    const bPda = blockPda(program, wPda, 10, 20);
    let b = decodeBlock((await conn.getAccountInfo(bPda))!.data);
    assert(b.owner.equals(alice.publicKey) && b.status === STATUS.OWNED && digestToCid(b.content) === null, 'minted state');

    // Double-mint fails.
    await expectFail(() => send(bob, ixMintBlock(program, wPda, bob.publicKey, treasury.publicKey, 10, 20)), 'AccountAlreadyInUse');

    // Alice publishes a real CIDv1(raw, sha2-256); round-trips bit-for-bit.
    const sampleDigest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
    const cid = digestToCid(sampleDigest)!;
    assert(cid.startsWith('bafk'), `CID prefix: ${cid}`);
    await send(alice, ixSetContent(program, wPda, alice.publicKey, 10, 20, cidToDigest(cid)));
    b = decodeBlock((await conn.getAccountInfo(bPda))!.data);
    assert(digestToCid(b.content) === cid && b.revision === 1, 'CID round-trip on chain');

    // Non-owner cannot set_content.
    await expectFail(() => send(bob, ixSetContent(program, wPda, bob.publicKey, 10, 20, new Uint8Array(32))), 'NotOwner');

    // Alice lists at 0.5 SOL; while listed, set_content is refused (no bait-and-switch).
    const ask = 500_000_000n;
    await send(alice, ixListBlock(program, wPda, alice.publicKey, 10, 20, ask));
    await expectFail(() => send(alice, ixSetContent(program, wPda, alice.publicKey, 10, 20, new Uint8Array(32))), 'BlockListed');

    // Bob buys: wrong expected_price fails; matching price transfers ownership + SOL.
    await expectFail(() => send(bob, ixBuyBlock(program, wPda, bob.publicKey, alice.publicKey, 10, 20, ask - 1n)), 'PriceMismatch');
    const aliceBefore = await conn.getBalance(alice.publicKey);
    await send(bob, ixBuyBlock(program, wPda, bob.publicKey, alice.publicKey, 10, 20, ask));
    const aliceAfter = await conn.getBalance(alice.publicKey);
    assert(aliceAfter - aliceBefore === Number(ask), 'seller received sale proceeds');
    b = decodeBlock((await conn.getAccountInfo(bPda))!.data);
    assert(b.owner.equals(bob.publicKey) && b.status === STATUS.OWNED && b.price === 0n, 'bob now owns and block delisted');
    assert(digestToCid(b.content) === cid, 'content preserved across sale');

    // Authority moderation: ban blocks owner writes; unban restores.
    await send(authority, ixModerateBlock(program, wPda, authority.publicKey, 10, 20, true));
    await expectFail(() => send(bob, ixListBlock(program, wPda, bob.publicKey, 10, 20, ask)), 'BlockBanned');
    await send(authority, ixModerateBlock(program, wPda, authority.publicKey, 10, 20, false));
    await send(bob, ixListBlock(program, wPda, bob.publicKey, 10, 20, ask));
    await send(bob, ixDelistBlock(program, wPda, bob.publicKey, 10, 20));

    console.log('[program-smoke] ALL ASSERTIONS PASSED ✓');
}

main().catch((e) => { console.error(e); process.exit(1); });
