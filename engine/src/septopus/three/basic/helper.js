/**
 * Three.js helper function 
 * @there.js R175
 * 
 * @fileoverview:
 *  1. create different kind of helper.
 * 
 * @author Fuu
 * @date 2025-06-10
 */

import * as THREE from "three";

const helps={
    ax:(cfg)=>{
        return new THREE.AxesHelper(cfg.size);
    },
    box:(cfg)=>{
        return new THREE.BoxHelper(cfg.object,cfg.color);
    },
    direct:(cfg)=>{
        return new THREE.DirectionalLightHelper(cfg.light,cfg.size,cfg.color);
    },
}

const self={
    get:(type,cfg)=>{
        if(!helps[type]) return {error:`"${type}" helper is not support yet.`};
        return helps[type](cfg);
    },
    valid:(params)=>{

        return true;
    },
};

const Helper={
    create:(cfg)=>{
        if(!cfg.type) return {error:"Invalid parameters."};
        if(!self.valid(params)) return {error:"Invalid parameters to create Helper."};
        const help=self.get(cfg.type,cfg);
        return help;
    },
}

export default Helper;