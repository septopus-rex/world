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

}

const mocker={
    height:(agent)=>{
        let slot=Toolbox.rand(80000,31000);
        const salt=Toolbox.char(5);
        setInterval(()=>{
            const obj={
                network:"solana",
                type:"devnet",
                height:slot,
                salt:salt,
                event:"height",
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
    world:()=>{

    },
    block:(bs)=>{

    },
    auto:(disposer)=>{
        mocker.height(disposer);
    },
}

export default api_solana;