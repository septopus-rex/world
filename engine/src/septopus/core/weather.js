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
    name:"weather",
    category:'system',
}

const config={
    network:"solana",
};

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
                    depth:0,
                }
            };
        },
    },
}

const vbw_weather={
    hooks:self.hooks,
    calc:(data)=>{
        //console.log(`weather`,data);
    },
}

export default vbw_weather;