/**
 * Three.js light function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create point light.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const self={
    
    valid:(params)=>{
        if(!params.convert) return false;

        return true;
    },

    sample:()=>{
        return {
            size:[],
        }
    },
}

const light_point={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create PointLight."};

        const color=!params.color?0xffffff:params.color;
        const intensity=!params.intensity?1:params.intensity;
        const distance=!params.distance?10*params.convert:params.distance;
        const light=new THREE.PointLight(color, intensity, distance);

        light.castShadow=true;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 100;
        
        return light;
    },
    standard:()=>{
        return self.sample();
    },
};

export default light_point;