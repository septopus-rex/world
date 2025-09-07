/**
 * Core - weather
 *
 * @fileoverview
 *  1. calc weather by slot hash ( right now Solana height )
 *
 * @author Fuu
 * @date 2025-04-25
 */

import Toolbox from "../lib/toolbox";
import VBW from "./framework";

const reg={
    name:"weather",
    category:'system',
    events:["change","cloud","rain","snow"],
}

const config={
    network:"solana",
    chain:["env","weather"],
    interval:60*30,
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
        return parseInt(`0x${str}`);
    },

    convert:(hash)=>{
        console.log(`Weather`,hash);

        const cat=self.getValue(hash,def.data.category[0],def.data.category[1]);
        const grade=self.getValue(hash,def.data.grade[0],def.data.grade[1]);
        const cat_index=cat%def.category.length;
        const cat_name=def.category[cat_index];

        const value=VBW.cache.get(config.chain);
        value.hash=hash;
        value.category=cat_index;
        value.grade=grade%def.detail[cat_name].length;

    },
    setWeather:()=>{

    },
}

const vbw_weather={
    hooks:self.hooks,
    calc:(data)=>{
        //console.log(data);
        if(data.network!==config.network) return false;
        if(!data.hash) return false;
        if(def===null){
            self.setDef();
            self.convert(data.hash);
        } 

        if(counter >= config.interval){
            self.convert(data.hash);
            counter=0;
        }else{
            counter+=60;
        }

        //test code
        const evt={
            from:"weather",
            stamp:Toolbox.stamp(),
        }
        //console.log(`Trigger weather`);
        VBW.event.trigger("weather","change",evt);
    },

    //task for trigger
    task:()=>{
        return {
            set:self.setWeather(),
            router:["set"],
        }
    }
}

export default vbw_weather;