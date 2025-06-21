/**
 * Core - movement
 *
 * @fileoverview
 *  1. player movement calculation
 *  2. base on Septopus World coordinate system
 *
 * @author Fuu
 * @date 2025-04-29
 */

import VBW from "./framework";

const reg={
    name:"movement",
    category:'system',
}

let player=null;
const self={
    getPlayer:()=>{
        if(player!==null) return true;
        const chain=["env","player"];
        player=VBW.cache.get(chain);
    },
}

const hooks={
    reg:()=>{return reg},
    // init:()=>{
    //     return{
    //         chain:["env","movment"],
    //         value:status
    //     };
    // },
}

const vbw_movement={
    hooks:hooks,
    
    body:{
        forward:(diff,ak)=>{
            return { position: [ -diff[0]*Math.sin(ak), diff[0]*Math.cos(ak), 0] }
            //return { position: [ diff[0]*Math.sin(ak),0, -diff[0]*Math.cos(ak)] }
        },
        backward:(diff,ak)=>{
            return { position: [ diff[0]*Math.sin(ak), -diff[0]*Math.cos(ak), 0] }
            //return { position: [ -diff[0]*Math.sin(ak),0, diff[0]*Math.cos(ak)] }
        },
        leftward:(diff,ak)=>{
            return { position: [ -diff[0]*Math.cos(ak), -diff[0]*Math.sin(ak), 0] }
            //return { position: [ -diff[0]*Math.cos(ak), 0,-diff[0]*Math.sin(ak)] }
        },
        rightward:(diff,ak)=>{
            return { position: [ diff[0]*Math.cos(ak), diff[0]*Math.sin(ak), 0] }
            //return { position: [ diff[0]*Math.cos(ak),0, diff[0]*Math.sin(ak)] }
        },
        rise:(diff,ak)=>{
            return { position: [ 0,0, diff[0]] }
            //return { position: [ 0,diff[0],0 ] }
        },
        fall:(diff,ak)=>{
            return { position: [ 0,0, -diff[0]] }
            //return { position: [ 0,-diff[0],0 ] }
        },

        //返回jump运动的数组，模拟运动操作
        jump:(diff,ak)=>{

        },
        squat:(diff,ak)=>{

        },
    },
    head:{
        up:(diff,ak)=>{
            // console.log(diff,ak);
            // const rx=diff[1]*Math.tan(ak);
            // const ry=0;
            // console.log(rx,ry);
            // return {rotation:[rx,ry,0]};
            return {rotation:[diff[1],0,0]};
        },
        down:(diff,ak)=>{

            return {rotation:[-diff[1],0,0]};
        },
        left:(diff,ak)=>{
            return {rotation:[0,0,diff[1]]};
            //return {rotation:[0,diff[1],0]};
        },
        right:(diff,ak)=>{
            return {rotation:[0,0,-diff[1]]};
            //return {rotation:[0,-diff[1],0]};
        },
    },
    test:()=>{
        console.log(player);
    },
}

export default vbw_movement;