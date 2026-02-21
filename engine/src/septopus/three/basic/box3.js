/**
 * Three.js box3 function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create new box3
 *
 * @author Fuu
 * @date 2025-09-30
 */

import * as THREE from "three";

const Box={
    create:(cfg)=>{
        return new THREE.Box3();
    },
}

export default Box;