/**
 * IO - Solana Network
 *
 * @fileoverview
 *  1. get the latest block height and hash
 *  2. get block information
 *
 * @author Fuu
 * @date 2025-04-23
 */

import Toolbox from "../lib/toolbox";

const map={}; 
const self={

    hash:(n)=>{

    },
}

const mocker={
    height:(agent)=>{
        let slot=Toolbox.rand(80000,310000);
        const salt=Toolbox.char(5);
        //0xefc58bbf7e0b002e23982caebbb3e072fa8482a515dc454fab52d945909b80b0
        setInterval(()=>{
            const obj={
                network:"solana",
                type:"devnet",
                height:slot,
                salt:salt,
                hash:Toolbox.hash(64),
                event:"height",
                interval:3,                 // (seconds) slot speed 
                stamp:Toolbox.stamp(),
            };
            agent(obj);
            slot++;
        },3000);
    },
    account:(addr)=>{

    },
    transaction:(addr)=>{

    },
    block:(n)=>{

    },
}

const api_solana={
    hooks:{
        auto:(disposer)=>{
            mocker.height(disposer);
        },
    },
    world:()=>{

    },
    block:(bs)=>{

    },
}

export default api_solana;