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

    //提供standard的数据输出，可以进行比较处理，也供valid来使用
    sample: () => {
        return {
            size: [],
        }
    },
}

const light_sun = {
    create: (params) => {
        if (!self.valid(params)) return { error: "Invalid parameters to create BOX." };
        const { colorSky, colorGround, intensity } = params;
        const light = new THREE.HemisphereLight(colorSky, colorGround, intensity);
        //light.castShadow = true;
        light.userData = { type: 'sun' };
        return light
    },
    standard: () => {
        return self.sample();
    },
};

export default light_sun;