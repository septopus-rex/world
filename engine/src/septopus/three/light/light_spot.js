/**
 * Three.js light function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create spot light.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import * as THREE from "three";

const self = {

    valid: (params) => {

        return true;
    },

    sample: () => {
        return {
            size: [],
        }
    },
}

const light_spot = {
    create: (params) => {
        if (!self.valid(params)) return { error: "Invalid parameters to create SpotLight." };
        const color = !params.color ? 0xffffff : params.color;
        const intensity = !params.intensity ? 1 : params.intensity;
        const light = new THREE.SpotLight(color, intensity);

        const distance = !params.distance ? 10 * params.convert : params.distance;
        light.distance=distance;

        light.angle=!params.angle?Math.PI/3:params.angle;

        light.castShadow = true;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 100;

        light.target.position.set(...params.target);

        return light;
    },
    standard: () => {
        return self.sample();
    },
};

export default light_spot;