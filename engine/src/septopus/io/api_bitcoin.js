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
                //hash:,
                stamp:Toolbox.stamp(),
            };
            agent(obj);
            height++;
        },3000);
    },
    transaction:(addr)=>{

    },
    block:(n)=>{

    },
}

const api_bitcoin={
    world:()=>{

    },
    block:(bs)=>{

    },
    auto:(disposer)=>{
        
    },
}

export default api_bitcoin;