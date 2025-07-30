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
        const renderer=new THREE.WebGLRenderer(cfg);

        if(cfg.shadow){
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        renderer.setSize(cfg.width, cfg.height);
        return renderer;
    },
}

export default Renderer;