import { PublicKey,Connection,Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import IDL from "./septopus.json";
import bs58 from "bs58";
import config from "../config";

let  linker=null;
const self={
    init: async ()=>{
        if(linker===null) linker = new Connection(config.node[config.env]);
    },
}

const Solana={
    validAccount:(acc)=>{
        try {
            new PublicKey(acc);
            return true;
        } catch (e) {
            return false;
        }
    },
    getPublicKey:(acc)=>{
        try {
            const data=new PublicKey(acc);
            return data;
        } catch (e) {
            return null;
        }
    },
    getNewAccount:()=>{
        return new Keypair();
    },
    getAccount:async(addr)=>{
        await self.init();
        if(typeof(addr)==="string"){
            if(!Solana.validAccount(addr)) return false;
            const account=new PublicKey(addr);
            const info= await linker.getAccountInfo(account);
            return info;
        }else{
            return await linker.getAccountInfo(addr);
        }
    },
    getPDA:(seeds,PID)=>{
        const bs=[];
        for(let i=0;i<seeds.length;i++){
            bs.push(Buffer.from(seeds[i]));
        }
        const [PDA] = PublicKey.findProgramAddressSync(bs,PID);
        return PDA;
    },
    getPDAByBuffer:(seeds,PID)=>{
        const [PDA] = PublicKey.findProgramAddressSync(seeds,PID);
        return PDA;
    },
    recentTxs:async (acc,before,limit = 12)=>{
        await self.init();
        try {
            const pubkey = new PublicKey(acc);
            let signatures=null;
            if(!!before){
                signatures = await linker.getSignaturesForAddress(pubkey, {limit,before});
            }else{
                signatures = await linker.getSignaturesForAddress(pubkey, {limit});
            }
            return signatures;
        } catch (error) {
            return {error:"Failed to query."};
        }
    },
    getCurrentSlot:async (ck)=>{
        await  self.init();
        return ck && ck(await linker.getBlockHeight());
    },
    getSlotHash: async (slot)=>{
        await  self.init();
        try {
            const cfg={commitment: "confirmed",maxSupportedTransactionVersion:0};
            const block = await linker.getBlock(slot, cfg);
            if (block && block.blockhash) {
                return block.blockhash;
            } else {
                return {error:"Unconfirmed block."};
            }
        } catch (error) {
            console.log(error);
            return {error:"Failed to get block hash."};
        }
    },
    validSignature:(sign)=>{
        const signatureBytes = bs58.decode(sign);
        if (signatureBytes.length !== 64) return false;
        return true;
    },
    getTransaction:async (hash)=>{
        await self.init();
        const cfg={commitment: "confirmed",maxSupportedTransactionVersion:0}
        const tx = await linker.getParsedTransaction(hash,cfg);
        return tx;
    },
    getContract: async (wallet) =>{
        await self.init();
        const provider = new anchor.AnchorProvider(linker, wallet, {commitment: 'confirmed' });
        const caller = new anchor.Program(IDL,provider);
        return caller
    },
    getSigner:(tx)=>{
        const accounts=tx.transaction.message.accountKeys;
        for(let i=0;i<accounts.length;i++){
            const row=accounts[i];
            if(row.signer) return row.pubkey.toString();
        }
        return false;
    },
    getConnection:()=>{
        return linker;
    },
    onChange:async(pubkey,ck)=>{
        linker.onAccountChange(pubkey, (updatedAccountInfo) => {
            return ck && ck(updatedAccountInfo);
        });
    },
}

export default Solana;