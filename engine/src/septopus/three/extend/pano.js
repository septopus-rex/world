/**
 * Three.js extend function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create pano;
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
            size:[],
        }
    },
}

const extend_pano={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {size} = params;
        return null;
    },
    standard:()=>{
        return self.sample();
    },
};

export default extend_pano;