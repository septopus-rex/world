/* 
*  Septopus world avatar movement component
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-29
*  @functions
*  1.convert the action in 3D to player status;
*/

import VBW from "./framework";

const reg={
    name:"movement",       //组件名称
    category:'system',      //组件分类
}

let player=null;                //player的信息位置
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
        },
        backward:(diff,ak)=>{
            return { position: [ diff[0]*Math.sin(ak), -diff[0]*Math.cos(ak), 0] }
        },
        leftward:(diff,ak)=>{
            return { position: [ -diff[0]*Math.cos(ak), -diff[0]*Math.sin(ak), 0] }
        },
        rightward:(diff,ak)=>{
            return { position: [ diff[0]*Math.cos(ak), diff[0]*Math.sin(ak), 0] }
        },
        rise:(diff,ak)=>{
            return { position: [ 0,0, diff[0]] }
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
            return {rotation:[diff[1],0,0]};
            //{cos:[++d,+-d,-+d,--d],sin:[++d,+-d,-+d,--]}
            //return {rotation:[ -diff[1]*Math.sin(ak), 0, -diff[1]*Math.sin(ak)]};

        },
        down:(diff,ak)=>{
            //return {rotation:[-diff[1],0,0]};
            return {rotation:[-diff[1],0,0]};
        },
        left:(diff,ak)=>{
            return {rotation:[0,diff[1],0]};
        },
        right:(diff,ak)=>{
            return {rotation:[0,-diff[1],0]};
        },
    },
    test:()=>{
        console.log(player);
    },
}

export default vbw_movement;