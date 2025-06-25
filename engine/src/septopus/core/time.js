/**
 * Core - time
 *
 * @fileoverview
 *  1. calc time by slot height ( right now Solana height )
 *  2. calc by Bitcoin block height in the furture
 *
 * @author Fuu
 * @date 2025-04-25
 */

const reg={
    name:"time",        //组件名称
    category:'system',      //组件分类
}

const config={
    start:78000,
    network:"solana",
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","time"],
                value:{
                    height:0,
                    year:0,
                    month:0,
                    day:0,
                    hour:0,
                }
            };
        },
    },

    convert:(height)=>{
        console.log(height);
    },
}

const vbw_time={
    hooks:self.hooks,
    calc:(data)=>{
        if(data.network!==config.network) return false;
        if(!data.height) return false;

       self.convert(data.height);
    },
}

export default vbw_time;