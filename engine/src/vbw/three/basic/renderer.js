/* 
*  Three.js rednerder function 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-26
*  @there.js R175
*  @functions
*  1. create different kind of renderer.
*/


import * as THREE from "three";
const Renderer={
    create:(cfg)=>{
        const rd=new THREE.WebGLRenderer({
                antialias: true // 开启抗锯齿
            });
        rd.setSize(cfg.width, cfg.height);
        return rd;
    },
}

export default Renderer;