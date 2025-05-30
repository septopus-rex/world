/**
 * Core - sky
 *
 * @fileoverview
 *  1. struct sky by time and weather
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"sky",
    category:'system',
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","sky"],
                value:{
                    source:"",
                    type:"",
                }
            };
        },
    },
    transform:{

    },
}

const vbw_sky={
    hooks:self.hooks,
    transform:self.transform,
}

export default vbw_sky;