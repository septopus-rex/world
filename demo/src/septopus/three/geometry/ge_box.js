/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create box.
 *
 * @author Fuu
 * @date 2025-04-23
 */

import * as THREE from "three";

const self={
    get:(size)=>{
        //const geometry = new THREE.BoxGeometry( 1, 1, 1 ); 
        const gg= new THREE.BoxGeometry(size[0], size[1], size[2]);
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

const geometry_box={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {size} = params;
        return self.get(size);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_box;