/**
 * Three.js light function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create direct light.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const self={
    
    valid:(params)=>{

        return true;
    },

    sample:()=>{
        return {
            size:[],
        }
    },
}

const light_direct={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create DirectLight."};
        const {size} = params;
        const color=!params.color?0xffffff:params.color;
        const intensity=!params.intensity?1:params.intensity;
        return new THREE.DirectionalLight(color, intensity);
    },
    standard:()=>{
        return self.sample();
    },
};

export default light_direct;