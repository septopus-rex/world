/**
 * Core - bag
 *
 * @fileoverview
 *  1. bag system for gaming mode.
 *
 * @author Fuu
 * @date 2025-06-26
 */

const reg={
    name:"bag",
    category:'system',
    desc:"Bag system, for player to check condition and bring tools.",
    version:"1.0.0",
}

const env={
    limit:20,               //bag limit
    private:true,           //whether private, if true, other player can not see your stuff
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","bag"],
                value:{
                    list:[],
                    last:0,
                    start:0,
                    lock:false,         //whether lock bag to get more stuff
                }
            };
        },
    },
}

const vbw_bag={
    hooks:self.hooks,
    list:()=>{

    },
    exsist:()=>{

    },

    //task for trigger
    task:()=>{
        return {
            mint:()=>{

            },
            consume:()=>{

            },
            router:["consume","mint"],
        }
    },
}

export default vbw_bag;