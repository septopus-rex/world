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
};


let def=null;
let counter=0;
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
                    category:0,
                    grade:0,
                }
            };
        },
    },
    setDef:()=>{
        def = VBW.cache.get(["env","world","common","weather"],true);

    },

    getValue:(hash,start,step)=>{
        const str=hash.substring(start+2,start+2+step);
        //console.log(hash,str,start,step);
        return parseInt(`0x${str}`);
    },

    convert:(hash)=>{
        const value=VBW.cache.get(config.chain);
        const cat=self.getValue(hash,def.data.category[0],def.data.category[1]);
        const grade=self.getValue(hash,def.data.grade[0],def.data.grade[1]);
        const cat_index=cat%def.category.length;
        const cat_name=def.category[cat_index];

        value.hash=hash;
        value.category=cat_index;
        value.grade=grade%def.detail[cat_name].length;

        //console.log(JSON.stringify(value));
    },
}

const vbw_weather={
    hooks:self.hooks,
    calc:(data)=>{
        if(data.network!==config.network) return false;
        if(!data.hash) return false;
        if(def===null) self.setDef();

        if(counter >= def.data.interval){
            self.convert(data.hash);
            counter=0;
        }else{
            counter+=60;
        }

        //console.log(counter);
    },
}

export default vbw_weather;