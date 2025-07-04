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
            return {rotation:[diff[1],0,0]};
        },
        down:(diff,ak)=>{

            //     const ak_deg=camera.rotation.z;
            //     const bk_deg=diff.rotation[0];

            //     const ak = THREE.MathUtils.degToRad(ak_deg); // 朝向角
            //     const bk = THREE.MathUtils.degToRad(bk_deg); // 抬头角
            //     const qFacing = new THREE.Quaternion().setFromAxisAngle(
            //         new THREE.Vector3(0, 0, 1), ak
            //     );
            //     const localXAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(qFacing);
            //     const qPitch = new THREE.Quaternion().setFromAxisAngle(localXAxis, bk);
            //     const qFinal = qFacing.clone().multiply(qPitch);
            //     const euler = new THREE.Euler().setFromQuaternion(qFinal, 'XYZ');
            //     camera.rotation.set(
            //         camera.rotation.x + euler.x,
            //         camera.rotation.y + euler.y,
            //         camera.rotation.z + euler.z,
            //     );

            return {rotation:[-diff[1],0,0]};
        },
        left:(diff,ak)=>{

            return {rotation:[0,0,diff[1]]};
        },
        right:(diff,ak)=>{
            return {rotation:[0,0,-diff[1]]};
        },
    },
    scale:{

    },
    test:()=>{
        console.log(player);
    },
}

export default vbw_movement;