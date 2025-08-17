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
        up:(diff,ak)=>{
            const bk = diff[1] * 0.1;
            const EPS = 1e-4;
            const maxPitch = Math.PI / 2 - EPS;
            const pitch = Math.max(-maxPitch, Math.min(maxPitch, bk));

            const rx = pitch; // X 轴：抬头/低头
            const ry = 0;     // Y 轴：此方案不使用
            const rz = ak;    // Z 轴：左右转头（世界 Z）
            return {rotation:[rx, ry, rz],order:"ZXY"} ;
        },
        down:(diff,ak)=>{
            return {rotation:[0,0,0]};
        },

        left:(diff,ak)=>{
            return {rotation:[0,0,-diff[1]]};
        },
        right:(diff,ak)=>{
            return {rotation:[0,0,diff[1]]};
        },
    },
    scale:{

    },
    test:()=>{
        console.log(player);
    },
}

export default vbw_movement;