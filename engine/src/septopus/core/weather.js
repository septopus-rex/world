/**
 * Core - weather
 *
 * @fileoverview
 *  1. calc weather by slot hash ( right now Solana height )
 *
 * @author Fuu
 * @date 2025-04-25
 */

import VBW from "./framework";

const reg={
    name:"weather",
    category:'system',
}

const config={
    network:"solana",
    chain:["env","weather"],
    // definition:{
    //     type:[12,6],          // type of weather, ["cloud","rain","snow"]
    //     grading:[36,2],       // grading of intensity, 0~8
    //     wind:[40,2],          // wind intensity, 0~16
    // },
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:config.chain,
                value:{
                    hash:"",
                    depth:0,
                }
            };
        },
    },
    convert:(hash)=>{
        //console.log(hash);
        const value=VBW.cache.get(config.chain);

    },
}

const vbw_weather={
    hooks:self.hooks,
    calc:(data)=>{
        if(data.network!==config.network) return false;
        if(!data.hash) return false;

        self.convert(data.hash);
    },
}

export default vbw_weather;