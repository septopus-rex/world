/* 
*  Three.js group function 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-06-07
*  @there.js R175
*  @functions
*  1. create group.
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