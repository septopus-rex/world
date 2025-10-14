/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create cone.
 *
 * @author Fuu
 * @date 2025-10-14
 */

import * as THREE from "three";

const self={
    get:(size)=>{
        //const geometry = new THREE.BoxGeometry( 1, 1, 1 ); 
        const radius=size[0];
        const height=size[1];
        const gg= new THREE.ConeGeometry(radius, height);
        return gg;
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

const geometry_cone={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {size} = params;
        return self.get(size);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_cone;