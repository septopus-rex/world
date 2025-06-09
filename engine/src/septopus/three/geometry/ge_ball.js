/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create ball.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const self={
    get:(radius)=>{
        const seg_v=32;
        const seg_h=32;
        const geo= new THREE.SphereGeometry(radius, seg_v, seg_h);
        return geo;
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

const geometry_ball={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BALL."};
        const {size} = params;

        const radius=0.5*size[0];

        return self.get(radius);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_ball;