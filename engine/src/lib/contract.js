import Solana from "./solana";
import { MD5 } from "crypto-js";

const def={
    name_list:{
        seed:"luck_mapping",
        method:"registryName",
    },
    white_list:{
        seed:"whitelist_vec",
        method:"whiteList",
    },
    gene_data:{
        seed: "gene_storage_account",
        method:"geneData",
    },
    luck_counter:{
        seed: "luck_counter",
        method:"luckCounter",
    },
    gene_counter:{
        seed: "gene_counter",
        method:"geneCounter",
    },
    ticket_record:{
        seed: "",
        method:"ticketRecord",
    },
    approve_record:{
        seed: "approve",
        method:"luckyRecord",
    },
    claim_record:{
        seed: "claim",
        method:"claimRecord",
    },
}

let wallet=null;
let program=null;
const info={
    name_list:async ()=>{
        try {
            const {method, seed}=def.name_list;
            const seeds=[seed];
            const PDA=Solana.getPDA(seeds,program.programId);
            return await program.account[method].fetch(PDA);
        } catch (error) {
            return {error:`Falied to get gene name list.`}
        }
    },
    white_list:async ()=>{
        try {
            const {method, seed}=def.white_list;
            const seeds=[seed];
            const PDA=Solana.getPDA(seeds,program.programId);
            return await program.account[method].fetch(PDA);
        } catch (error) {
            return {error:`Falied to get gene name list.`}
        }
    },
    gene_data:async (name)=>{
        try {
            const {method, seed}=def.gene_data;
            const seeds=[seed,name];
            const PDA=Solana.getPDA(seeds,program.programId);

            const onchain=await program.account[method].fetch(PDA);
            if(onchain.data) onchain.data=JSON.parse(onchain.data);

            return onchain;
        } catch (error) {
            return {error:`Falied to get "${name}" data on chain.`}
        }
    },
    luck_counter:async()=>{
        try {
            const {method, seed}=def.luck_counter;
            const seeds=[seed];
            const PDA=Solana.getPDA(seeds,program.programId);
            return await program.account[method].fetch(PDA);
        } catch (error) {
            return {error:`Falied to get luck counter.`}
        }
    },
    gene_counter:async(name)=>{
        try {
            const {method, seed}=def.gene_counter;
            const seeds=[seed,name];
            const PDA=Solana.getPDA(seeds,program.programId);
            return await program.account[method].fetch(PDA);
        } catch (error) {
            return {error:`Falied to get "${name}" counter.`}
        }
    },
    ticket_record:async(name)=>{
        try {
            const {method}=def.ticket_record;
            const seeds=[
                Buffer.from(name),
                wallet.publicKey.toBuffer(),
            ]
            const PDA =Solana.getPDAByBuffer(seeds,program.programId);
            return await program.account[method].fetch(PDA);  
        } catch (error) {
            return {error:"No ticket record."}
        }
    },
    approve_record:async(name,signature)=>{
        try {
            const {method, seed}=def.approve_record;
            const m5 = MD5(name + signature).toString();
            const seeds=[m5,seed];
            const PDA=Solana.getPDA(seeds,program.programId);
            return await program.account[method].fetch(PDA);
        } catch (error) {
            return {error:`Falied to get approve record "${name}" and "${signature}".`}
        }
    },
    claim_record:async(name,signature)=>{
        try {
            const {method, seed}=def.claim_record;
            const m5 = MD5(name + signature).toString();
            const seeds=[m5,seed];
            const PDA=Solana.getPDA(seeds,program.programId);
            return await program.account[method].fetch(PDA);
        } catch (error) {
            return {error:`Falied to get claim record "${name}" and "${signature}".`}
        }
    },
};

const actions={
    create:async(name,raw,ck)=>{
        const next=6;
        const dt=await info.white_list();
        //console.log(dt);
        const acc_recipient=Solana.getPublicKey(dt.recipient);
        const tx=await program.methods
        .create(name,raw,next)
        .accounts({
            payer: wallet.publicKey,
            recipient:acc_recipient,
        })
        .rpc()
        .catch((err) => {
            return  ck && ck({error:`Failed to call "create".`,more:err})
        });

        Solana.onChange(wallet.publicKey,(data)=>{
            console.log(data);
        });
        return ck && ck(tx);
    },
    enable:async(name,ck)=>{
        const tx=await program.methods
        .enable(name)
        .accounts({
            payer: wallet.publicKey,
        })
        .rpc()
        .catch((err) => {
            return  ck && ck({error:`Failed to call "enable".`,more:err})
        });

        Solana.onChange(wallet.publicKey,(data)=>{
            console.log(data);
        });
        return ck && ck(tx);
    },
    disable:async(name,ck)=>{
        const tx=await program.methods
        .disable(name)
        .accounts({
            payer: wallet.publicKey,
        })
        .rpc()
        .catch((err) => {
            return  ck && ck({error:`Failed to call "enable".`,more:err})
        });

        Solana.onChange(wallet.publicKey,(data)=>{
            console.log(data);
        });
        return ck && ck(tx);
    },
    ticket:async(name,ck)=>{
        const white=await info.white_list();
        const recipient=Solana.getPublicKey(white.recipient);
        const gene=await info.gene_data(name);
        const creator=Solana.getPublicKey(gene.creator);

        const tx=await program.methods
            .ticket(name)
            .accounts({
                payer: wallet.publicKey,
                recipient:recipient,
                creator:creator,
            })
            .rpc()
            .catch((err) => {
                return  ck && ck({error:`Failed to call "ticket".`,more:err})
            });

        Solana.onChange(wallet.publicKey,(data)=>{
            console.log(data);
        });
        return ck && ck(tx);
    },
    claim:async (name,signature,ck)=>{
        const white=await info.white_list();
        const recipient=Solana.getPublicKey(white.recipient);
        const gene=await info.gene_data(name);
        const creator=Solana.getPublicKey(gene.creator);
        const m5 = MD5(name + signature).toString();

        const tx=await program.methods
            .claim(m5, name, signature)
            .accounts({
                payer: wallet.publicKey,
                recipient:recipient,
                creator:creator,
            })
            .rpc()
            .catch((err) => {
                return  ck && ck({error:`Failed to call "claim".`,more:err})
            });

        Solana.onChange(wallet.publicKey,(data)=>{
            console.log(data);
        });
        return ck && ck(tx);
    },

    /*********************************/
    init:async (root,recipient,ck)=>{
        console.log(root,recipient);
        const tx=await program.methods
            .init(root,recipient)
            .accounts({
                payer: wallet.publicKey,
            })
            .rpc()
            .catch((err) => {
                return  ck && ck({error:`Failed to call "init".`,more:err})
            });

        Solana.onChange(wallet.publicKey,(data)=>{
            console.log(data);
        });
        return ck && ck(tx);
    },
};


const SeptopusContract={
    set:async(wt)=>{
        wallet = wt;
        program = await Solana.getContract(wt);
        console.log(wt);
    },

    // check signature status
    status:(name,signature,addr,ck)=>{

    },

    //get raw data of account on chain
    get:async (cat,param)=>{
        if(!info[cat]) return {error:"Invalid account"};
        const fun=info[cat];
        return (param!==undefined && Array.isArray(param))?await fun(...param):await fun();
    },

    //call program functions.
    call:async(act,ck,param)=>{
        if(!actions[act]) return {error:"Invalid action"};
        const fun=actions[act];
        if(param!==undefined && Array.isArray(param)){
            fun(...param,ck);
        }else{
            fun(ck);
        }
    },

    //get token balance
    balance:(addr,ck)=>{

    },
}

export default SeptopusContract;