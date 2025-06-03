/**
 * Core - player
 *
 * @fileoverview
 *  1. save the location of player
 *  2. save the body parameters of player.
 *
 * @author Fuu
 * @date 2025-04-23
 */

import Toolbox from "../lib/toolbox";
import VBW  from "./framework";
import UI from "../io/io_ui";

const reg={
    name:"player",
    category:'system',
}

const config={
    location:{
        block:[2025,501],
        world:0,
        position:[8,8,1.7],
        //rotation:[Math.PI*0.5,0,0],
        rotation:[0,0,0],
        headAx:"y",
        extend:2,
    },
    body:{
        height:1.5,
        shoulder:0.5,
        chest:0.22,
    },
    capacity:{
        move:0.03,          //move speed, meter/second
        rotate:0.05,        //rotate speed of head
        span:0.31,          //max height of walking
        squat:0.1,          //height of squat
        jump:1,	            //max height of jump
        death:3,            //min height of fall death
        speed:1.5,          //move speed, meter/second
        strength:1,         //strength time for jump. Not used yet.
    },
    autosave:{
        interval:60,        //frames for player status autosaving
        key:"vbw_player",
    }
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            const py=Toolbox.clone(config);
            py.avatar="";
            py.address="";
            py.stamp=Toolbox.stamp();
            
            return {
                chain:["env","player"],
                value:py,
            };
        },
    },
    getPlayerLocation:()=>{
        const key=config.autosave.key;
        const pp=localStorage.getItem(key);
        if(pp===null){
            localStorage.setItem(key,JSON.stringify(config.location));
            return Toolbox.clone(config.location);
        }else{
            try {
                const data=JSON.parse(pp);
                return data;
            } catch (error) {
                localStorage.setItem(key,JSON.stringify(config.location));
                return Toolbox.clone(config.location);
            }
        }
    },
}

let count=0;
let player=null;
const vbw_player={
    hooks:self.hooks,
    body:()=>{

    },
    autosave:()=>{
        if(player===null){
            player=VBW.cache.get(["env","player","location"]);
        }
        //UI.show("compass",player.rotation[0]*180);

        if(count>config.autosave.interval){
            const key=config.autosave.key;
            //console.log(JSON.stringify(player));
            localStorage.setItem(key,JSON.stringify(player));
            count=0;

            UI.show("status",JSON.stringify(player.block));
        }else{
            count++;
        }
    },

    //get the player status.
    start:(dom_id,ck)=>{
        const data=self.getPlayerLocation();
        const chain=["block",dom_id,data.world,"loop"];
        if(!VBW.cache.exsist(chain)) VBW.cache.set(chain,[]);
        const queue=VBW.cache.get(chain);
        queue.push({name:"player",fun:vbw_player.autosave});

        return ck && ck(data);
    },
}

export default vbw_player;