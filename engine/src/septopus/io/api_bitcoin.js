/**
 * IO - Bitcoin Network
 *
 * @fileoverview
 *  1. get the latest block height and hash
 *  2. get block information
 *
 * @author Fuu
 * @date 2025-04-29
 */

import Toolbox from "../lib/toolbox";

const map={};
const self={

}

let agent=null;
const mocker={
    height:(agent)=>{
        let height=Toolbox.rand(80000,31000);
        const salt=Toolbox.char(5);
        setInterval(()=>{
            const obj={
                network:"bitcoin",
                height:height,
                salt:salt,
                stamp:Toolbox.stamp(),
            };
            agent(obj);
            height++;
        },60000*4);
    },
    transaction:(addr)=>{

    },
    block:(n)=>{

    },
}

const api_bitcoin={
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

export default api_bitcoin;