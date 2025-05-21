/* 
*  Three.js geometry 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-29
*  @there.js R175
*  @functions
*  1. create ball.
*/


import * as THREE from "three";

const self={
    get:(size,position,rotation,material)=>{

    },
    valid:(params)=>{

        return true;
    },

    //提供standard的数据输出，可以进行比较处理，也供valid来使用
    sample:()=>{
        return {
            size:[],
        }
    },
}

const geometry_ball={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {size} = params;
        return new THREE.BoxGeometry(size[0], size[1], size[2]);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_ball;