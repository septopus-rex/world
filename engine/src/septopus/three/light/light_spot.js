/**
 * Three.js light function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create spot light.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const self={
    
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

const light_spot={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {size} = params;
        return new THREE.BoxGeometry(size[0], size[1], size[2]);
    },
    standard:()=>{
        return self.sample();
    },
};

export default light_spot;