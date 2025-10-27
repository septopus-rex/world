/**
 * Three.js group function 
 * @there.js R175
 * 
 * @fileoverview
 *  1. create group.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const Group={
    create:(cfg)=>{
        let group=new THREE.Group();

        return group
    },
}

export default Group;