/**
 * Three.js material function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create linedashed material
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

const material_linedashed={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const cfg={

        };
        return new THREE.LineDashedMaterial(cfg);
    }
};

export default material_linedashed;