/**
 * Three.js controller function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create different kind of controller.
 *
 * @author Fuu
 * @date 2025-06-07
 */

import * as THREE from "three";

const self={
    get:(type,params)=>{
        switch (type) {
            case "orbit":
                const render={};
                const camera={};
                return new THREE.OrbitControls(camera, render.domElement);
                break;
        
            default:
                break;
        }
    },
    valid:(params)=>{

        return true;
    },
};

const material_linedashed={
    create:(input)=>{
        if(!self.valid(input)) return {error:"Invalid parameters to create BOX."};
        const cfg={

        };
        return self.get(input.type,input.params);
    }
};

export default material_linedashed;