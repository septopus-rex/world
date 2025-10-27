/**
 * Three.js clock function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create clock of three.js
 *
 * @author Fuu
 * @date 2025-09-30
 */

import * as THREE from "three";

const Clock={
    create:(cfg)=>{
        return new THREE.Clock();
    },
}

export default Clock;