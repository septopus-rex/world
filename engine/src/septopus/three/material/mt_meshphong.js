/**
 * Three.js material function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create meshphong material
 *
 * @author Fuu
 * @date 2025-05-21
 */

import * as THREE from "three";

const self={
    get:(size,position,rotation,material)=>{

    },
    valid:(params)=>{

        return true;
    },
    sample:()=>{
        return {
            color:"#ffffff",
        }
    },
}

const material_meshphong={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create MeshPhong material."};
        const cfg={
            color: 0xFFFFFF,
            map:params.texture
        };
        return new THREE.MeshPhongMaterial(cfg);
    },
    standard:()=>{
        return self.sample();
    },
};

export default material_meshphong;