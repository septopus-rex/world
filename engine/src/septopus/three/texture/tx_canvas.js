/**
 * Three.js texture function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create canvas texture for fresh.
 *
 * @author Fuu
 * @date 2025-10-20
 */


import * as THREE from "three";

const self={
    
    valid:(params)=>{

        return true;
    },
    sample:()=>{
        return {
            size:[],
        }
    },
}

const texture_canvas={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create basic texture."};

        // const {image,repeat}=params;
        const texture = new THREE.TextureLoader().load(image);
        // texture.wrapS = THREE.RepeatWrapping;
        // texture.wrapT = THREE.RepeatWrapping;
        // texture.repeat.set( repeat[0],repeat[1]);

        return texture;
    },
    standard:()=>{
        return self.sample();
    },
};

export default texture_canvas;