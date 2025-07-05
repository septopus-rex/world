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
import * as THREE from "three";

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
        },

        //返回jump运动的数组，模拟运动操作
        jump:(diff,ak)=>{

        },
        squat:(diff,ak)=>{

        },
    },
    head:{
        //[sin-sin, sin-cos, cos-sin, cos-cos]
        // up:(diff,ak)=>{
        //     const bk=-diff[1]*0.1;
        //     const x = Math.sin(bk) * Math.sin(ak);
        //     const y = -Math.sin(bk) * Math.cos(ak); // Three.js 的 Z → 你坐标系的 Y（负号）
        //     const z = Math.cos(bk);                 // Three.js 的 Y → 你坐标系的 Z
        //     return {rotation:[0,x,y]};
        // },
        // down:(diff,ak)=>{
        //     const bk=diff[1]*0.1;
        //     const x = Math.sin(bk) * Math.sin(ak);
        //     const y = -Math.sin(bk) * Math.cos(ak); // Three.js 的 Z → 你坐标系的 Y（负号）
        //     const z = Math.cos(bk);                 // Three.js 的 Y → 你坐标系的 Z
        //     return {rotation:[0,x,y]};
        // },
        up:(diff,ak)=>{
            //const bs=-diff[1]*0.1 * Math.cos(ak);
            const bs=-diff[1]*0.1
            return {rotation:[
                bs*Math.cos(ak),
                bs*Math.cos(ak),
                0,
            ]};
        },
        down:(diff,ak)=>{
            //const bs=diff[1]*0.1 * Math.cos(ak);
            const bs=diff[1]*0.1
            return {rotation:[
                bs*Math.cos(ak),
                bs*Math.cos(ak),
                0,
            ]};
        },
        left:(diff,ak)=>{
            return {rotation:[0,0,-diff[1]]};
        },
        right:(diff,ak)=>{
            return {rotation:[0,0,diff[1]]};
        },

        // left:(diff,ak)=>{
        //     const bk=-diff[1];
        //     const x = Math.sin(bk) * Math.sin(ak);
        //     const y = -Math.sin(bk) * Math.cos(ak); // Three.js 的 Z → 你坐标系的 Y（负号）
        //     const z = Math.cos(bk);                 // Three.js 的 Y → 你坐标系的 Z
        //     return {rotation:[x,y,0]};
        // },
        // right:(diff,ak)=>{
        //     const bk=diff[1];
        //     const x = Math.sin(bk) * Math.sin(ak);
        //     const y = -Math.sin(bk) * Math.cos(ak); // Three.js 的 Z → 你坐标系的 Y（负号）
        //     const z = Math.cos(bk);                 // Three.js 的 Y → 你坐标系的 Z
        //     return {rotation:[x,y,0]};
        // },
    },
    scale:{

    },
    test:()=>{
        console.log(player);
    },
}

export default vbw_movement;