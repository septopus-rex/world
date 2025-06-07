/**
 * Three.js mesh function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create mesh by geometry and meterial.
 *
 * @author Fuu
 * @date 2025-04-26
 */

import * as THREE from "three";

const self={

}

const Mesh={
    create:(cfg)=>{
        const mesh = new THREE.Mesh(cfg.geometry, cfg.material);

        if(cfg){

        }

        return mesh
    },
}
export default Mesh;