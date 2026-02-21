/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create cylinder.
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

    sample:()=>{
        return {
            size:[],
        }
    },
}

const geometry_cylinder={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create CYLINDER."};
        const {size} = params;
        return new THREE.BoxGeometry(size[0], size[1], size[2]);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_cylinder;