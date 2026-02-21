/**
 * Three.js light function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create sun light.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const self = {

    valid: (params) => {
        if (!params.colorSky) return false;
        if (!params.colorGround) return false;
        if (!params.intensity) return false;
        return true;
    },
    sample: () => {
        return {
            size: [],
        }
    },
}

const light_sun = {
    create: (params) => {
        if (!self.valid(params)) return { error: "Invalid parameters to create SunLight." };
        const { colorSky, colorGround, intensity } = params;
        const light = new THREE.HemisphereLight(colorSky, colorGround, intensity);
        light.userData = {type:'sun'};
        return light
    },
    standard: () => {
        return self.sample();
    },
};

export default light_sun;