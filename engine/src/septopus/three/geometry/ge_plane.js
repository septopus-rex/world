/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create plane.
 *
 * @author Fuu
 * @date 2025-04-29
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

const geometry_plane={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create PLANE."};
        const {size} = params;
        return new THREE.PlaneGeometry(size[0],size[1]);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_plane;