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

import VBW from "./framework";

const reg={
    name:"time",        //组件名称
    category:'system',      //组件分类
}

const config={
    network:"solana",
    mount:["env","time"],
    definition:{
        year:12,        // months/year
        month:30,       // days/month
        day:24,         // hours/day
        hour:60,        // minutes/hour
        minute:60,      // seconds/minute
        second:1000,    // microseconds/second
        start:78000,    // 0 milestone (2027-6-19 00:00)
        speed:20,       // rate =  septopus year / reality year
    },
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:config.mount,
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

    convert:(height,interval)=>{
        const value=VBW.cache.get(config.chain);
        if(value.error) return false;
        
    },
}

const vbw_time={
    hooks:self.hooks,
    calc:(data)=>{
        if(data.network!==config.network) return false;
        if(!data.height) return false;
        self.convert(data.height,data.interval);
    },
}

export default vbw_time;