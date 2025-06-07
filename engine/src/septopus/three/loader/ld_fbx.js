/**
 * Three.js loader function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create FBX loader.
 *
 * @author Fuu
 * @date 2025-06-07
 */

import * as THREE from "three";

const self={
    valid:(params)=>{

        return true;
    },
};

const loader_fbx={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const cfg={

        };
        return new THREE.Loader(cfg);
    }
};

export default loader_fbx;