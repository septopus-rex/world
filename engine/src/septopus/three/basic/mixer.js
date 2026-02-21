/**
 * Three.js animitionMixer function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create new animation mixer
 *
 * @author Fuu
 * @date 2025-10-01
 */

import * as THREE from "three";

const Mixer={
    create:(cfg)=>{
        return new THREE.AnimationMixer(cfg.model);
    },
}

export default Mixer;