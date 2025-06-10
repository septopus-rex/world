/**
 * Three.js rednerder function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create different kind of renderer.
 *
 * @author Fuu
 * @date 2025-04-26
 */

import * as THREE from "three";

const Renderer={
    create:(cfg)=>{
        if(!cfg.antialias) cfg.antialias=true;
        const rd=new THREE.WebGLRenderer(cfg);
        rd.setSize(cfg.width, cfg.height);
        return rd;
    },
}

export default Renderer;