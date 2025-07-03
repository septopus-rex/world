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
import Toolbox from "../lib/toolbox";

const reg={
    name:"time",
    category:'system',
    version:"1.0.0",
}

const config={
    network:"solana",
    mount:["env","time"],
}

let def=null;
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
                    minute:0,
                    second:0,
                }
            };
        },
    },
    setDef:()=>{
        const basic = VBW.cache.get(["env","world","common","time"],true);
        //console.log(basic);
        def={
            minute:basic.minute,
            hour:basic.minute*basic.hour,
            day:basic.minute*basic.hour*basic.day,
            month:basic.minute*basic.hour*basic.day*basic.month,
            year:basic.minute*basic.hour*basic.day*basic.month*basic.year,
            speed:basic.speed,
            start:basic.start,
        };
    },
    convert:(height,interval)=>{
        const value=VBW.cache.get(config.mount);
        if(value.error) return false;

        //console.log(JSON.stringify(value));

        value.height=height;

        let diff=(height-def.start)*interval*def.speed;
        if(diff >= def.year){
            value.year=Math.floor(diff/def.year);
            diff=diff%def.year;
            if(diff===0){
                value.month=0;
                value.day=0;
                value.hour=0;
                value.minute=0;
                return true;
            }
        }
        

        if(diff >= def.month){
            value.month=Math.floor(diff/def.month);
            diff=diff%def.month;
            if(diff===0){
                value.day=0;
                value.hour=0;
                value.minute=0;
                return true;
            }
        }

        if(diff >= def.day){
            value.day=Math.floor(diff/def.day);
            diff=diff%def.day;
            if(diff===0){
                value.hour=0;
                value.minute=0;
                return true;
            }
        }

        if(diff >= def.hour){
            value.hour=Math.floor(diff/def.hour);
            diff=diff%def.hour;
            if(diff===0){
                value.minute=0;
                return true;
            }
        }

        if(diff >= def.minute){
            value.minute=Math.floor(diff/def.minute);
            diff=diff%def.minute;
        }

        value.second=diff;
    },
}

const vbw_time={
    hooks:self.hooks,
    calc:(data)=>{
        if(def===null) self.setDef(); 
        //console.log(data,def);
        if(data.network!==config.network) return false;
        if(!data.height) return false;

        self.convert(data.height,data.interval);
    },
}

export default vbw_time;