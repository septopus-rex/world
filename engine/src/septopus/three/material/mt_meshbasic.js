/**
 * Three.js material function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create meshbasic material
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

const material_meshbasic={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        if(!params.side) params.side=THREE.DoubleSide;
        //console.log(params);
        const mm=new THREE.MeshBasicMaterial(params)
        if(params.opacity) mm.opacity=params.opacity;
        return mm;
    },
    standard:()=>{
        return self.sample();
    },
};

export default material_meshbasic;