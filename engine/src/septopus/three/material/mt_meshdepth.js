/**
 * Three.js material function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create meshdepth material
 *
 * @author Fuu
 * @date 2025-05-21
 */

import * as THREE from "three";

const self={
    valid:(params)=>{

        return true;
    },
};

const material_meshdepth={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create MeshDepth material."};
        const cfg={

        };
        return new THREE.MeshDepthMaterial(cfg);
    }
};

export default material_meshdepth;