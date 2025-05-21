/* 
*  Three.js mesh function 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-26
*  @there.js R175
*  @functions
*  1. create mesh by geometry and meterial.
*/


import * as THREE from "three";
const self={

}

const Mesh={
    create:(cfg)=>{
        return new THREE.Mesh(cfg.geometry, cfg.material);
    },
}
export default Mesh;