/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create line.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";
const self={
    get:(pa,pb,color)=>{
        const points = [];
        points.push( new THREE.Vector3( pa[0], pa[1], pa[2]) );
        points.push( new THREE.Vector3( pb[0], pb[1], pb[2]) );
        const geometry = new THREE.BufferGeometry().setFromPoints( points );
        const material = new THREE.LineBasicMaterial({ color: color});
        const line=new THREE.Line(geometry,material);
        return line;
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

const geometry_line={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create LINE."};
        return self.get(params);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_line;