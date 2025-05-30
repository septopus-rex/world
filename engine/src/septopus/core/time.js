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
}

const vbw_time={
    hooks:self.hooks
}

export default vbw_time;