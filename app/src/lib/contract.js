import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import Solana from "./solana";

// PDA seeds — must match chain/programs/septopus/src/constants.rs
const SEEDS = {
    BLOCK_DATA:  Buffer.from("b_dt"),
    WORLD_LIST:  Buffer.from("worlds"),
    WORLD_COUNT: Buffer.from("w_ct"),
};

const u32buf = (n) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(n);
    return buf;
};

let wallet  = null;
let program = null;

// ── PDA derivation ────────────────────────────────────────────────────────────

const getBlockPDA = (x, y, world) =>
    PublicKey.findProgramAddressSync(
        [SEEDS.BLOCK_DATA, u32buf(x), u32buf(y), u32buf(world)],
        program.programId
    )[0];

const getWorldListPDA = () =>
    PublicKey.findProgramAddressSync([SEEDS.WORLD_LIST], program.programId)[0];

// ── Read (info) ───────────────────────────────────────────────────────────────

const info = {
    // Returns on-chain block state. { minted: false } if account doesn't exist yet.
    block: async (x, y, world) => {
        if (!program) return { error: "Contract not initialized" };
        try {
            const pda  = getBlockPDA(x, y, world);
            const data = await program.account.blockData.fetch(pda);
            return {
                x, y, world,
                owner:  data.owner,
                price:  data.price.toNumber(),
                status: data.status,
                data:   data.data,          // raw string: "[]" JSON or IPFS CID
                create: data.create.toNumber(),
                update: data.update.toNumber(),
                minted: data.create.toNumber() !== 0,
            };
        } catch {
            // Account not initialized → block not minted
            return { x, y, world, minted: false };
        }
    },

    // Returns parsed world setting for the given world index.
    world: async (index) => {
        if (!program) return { error: "Contract not initialized" };
        try {
            const pda       = getWorldListPDA();
            const worldList = await program.account.worldList.fetch(pda);
            if (index >= worldList.list.length) return { error: "World not found" };
            const wd = worldList.list[index];
            return {
                index,
                data:  JSON.parse(wd.data),
                start: wd.start.toNumber(),
            };
        } catch (e) {
            return { error: e.message };
        }
    },
};

// ── Write (actions) ───────────────────────────────────────────────────────────

const actions = {
    mint_block: async (x, y, world, ck) => {
        try {
            const tx = await program.methods
                .mintBlock(x, y, world)
                .accounts({ payer: wallet.publicKey })
                .rpc();
            return ck && ck(tx);
        } catch (err) {
            return ck && ck({ error: err.message });
        }
    },

    // data: JSON string or IPFS CID (max 200 chars enforced by chain)
    update_block: async (data, x, y, world, ck) => {
        try {
            const tx = await program.methods
                .updateBlock(data, x, y, world)
                .accounts({ payer: wallet.publicKey })
                .rpc();
            return ck && ck(tx);
        } catch (err) {
            return ck && ck({ error: err.message });
        }
    },

    // price in lamports (u64)
    sell_block: async (x, y, world, price, ck) => {
        try {
            const tx = await program.methods
                .sellBlock(x, y, world, new BN(price))
                .accounts({ payer: wallet.publicKey })
                .rpc();
            return ck && ck(tx);
        } catch (err) {
            return ck && ck({ error: err.message });
        }
    },

    // expectedPrice guards against price front-running; recipientPubkey is current owner
    buy_block: async (x, y, world, expectedPrice, recipientPubkey, ck) => {
        try {
            const tx = await program.methods
                .buyBlock(x, y, world, new BN(expectedPrice))
                .accounts({
                    payer:     wallet.publicKey,
                    recipient: new PublicKey(recipientPubkey),
                })
                .rpc();
            return ck && ck(tx);
        } catch (err) {
            return ck && ck({ error: err.message });
        }
    },

    withdraw_block: async (x, y, world, ck) => {
        try {
            const tx = await program.methods
                .withdrawBlock(x, y, world)
                .accounts({ payer: wallet.publicKey })
                .rpc();
            return ck && ck(tx);
        } catch (err) {
            return ck && ck({ error: err.message });
        }
    },
};

// ── Public API ────────────────────────────────────────────────────────────────

const SeptopusContract = {
    set: async (wt) => {
        if (wallet === null && wt.publicKey !== null) {
            wallet  = wt;
            program = await Solana.getContract(wt);
        }
    },

    get: async (cat, param) => {
        if (!info[cat]) return { error: "Invalid account" };
        return Array.isArray(param) ? await info[cat](...param) : await info[cat]();
    },

    call: async (act, ck, param) => {
        if (!actions[act]) return { error: "Invalid action" };
        return Array.isArray(param) ? actions[act](...param, ck) : actions[act](ck);
    },

    status: (signature, ck) => {
        Solana.getTransaction(signature).then(tx => ck && ck(tx));
    },

    balance: (_addr, _ck) => {
        // Reserved for SPL token balance once token is introduced
    },

    isReady: () => wallet !== null && program !== null,
};

export default SeptopusContract;
