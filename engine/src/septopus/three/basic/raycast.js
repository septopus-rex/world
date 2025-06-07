/**
 * Three.js raycast function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create raycast.
 *
 * @author Fuu
 * @date 2025-06-07
 */

import * as THREE from "three";

const Raycast={
    create:(cfg)=>{
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        return {checker:raycaster,mouse:mouse};
    },
}

export default Raycast;