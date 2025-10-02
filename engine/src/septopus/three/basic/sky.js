/**
 * Three.js sky function 
 * @there.js R175
 * 
 * @fileoverview:
 *  1. create different kind of sky.
 * 
 * @author Fuu
 * @date 2025-06-03
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
                skyUniforms['turbidity'].value = 10;            //Turbidity (can be lowered at night)
                skyUniforms['rayleigh'].value = 2;              //Rayleigh scattering (keep it low)
                skyUniforms['mieCoefficient'].value = 0.005;    //Mie scattering coefficient
                skyUniforms['mieDirectionalG'].value = 0.8;     //Mie scattering directionality (high values ​​simulate lunar halos or faint halos)
                
                const sun = new THREE.Vector3();
                const phi = THREE.MathUtils.degToRad(90-0);     //sun rising setting 
                const theta = THREE.MathUtils.degToRad(90);     //sun rising setting
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