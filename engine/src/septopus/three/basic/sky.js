/**
 * Three.js sky function 
 *
 * @fileoverview:
 *  1. create different kind of sky.
 * 
 * @author Fuu
 * @date 2025-04-23
 */

import * as THREE from "three";
import { Sky } from 'three/addons/objects/Sky.js';

const config={
    scale:10000,
}

const Space={
    create:(cfg)=>{
        const type=!cfg.type?"basic":cfg.type;

        let sky=null;
        switch (type) {
            case "basic":
                sky = new Sky();
                sky.scale.setScalar(!cfg.scale?config.scale:cfg.scale);

                const skyUniforms = sky.material.uniforms;
                skyUniforms['turbidity'].value = 10;
                skyUniforms['rayleigh'].value = 2;
                skyUniforms['mieCoefficient'].value = 0.005;
                skyUniforms['mieDirectionalG'].value = 0.8;
                
                const sun = new THREE.Vector3();
                const phi = THREE.MathUtils.degToRad(90 - 10);
                const theta = THREE.MathUtils.degToRad(180);
                sun.setFromSphericalCoords(1, phi, theta);
                sky.material.uniforms['sunPosition'].value.copy(sun);
                break;
        
            default:
                break;
        }

        if(sky===null) return {error:"Invalid sky type."};

        return sky
    },
}

export default Space;