import Solana from "./solana";

const def={

}

let wallet=null;
let program=null;
const info={

}

const actions={

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
        //console.log(wt.publicKey);
        if(wallet===null && wt.publicKey!==null){
            wallet = wt;
            program = await Solana.getContract(wt);
            console.log(program,wt);
        }
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