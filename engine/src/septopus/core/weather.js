/**
 * Core - weather
 *
 * @fileoverview
 *  1. calc weather by slot hash ( right now Solana height )
 *
 * @author Fuu
 * @date 2025-04-25
 */

const reg={
    name:"wealth",
    category:'system',
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","weather"],
                value:{
                    hash:"",
                    depth:"",
                }
            };
        },
    },
}

const vbw_weather={
    hooks:self.hooks,
}

export default vbw_weather;