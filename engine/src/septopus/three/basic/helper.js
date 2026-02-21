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
    plane:(cfg)=>{
        return new THREE.PlaneHelper(cfg.object,cfg.color);
    },
    arrow:(cfg)=>{
        return new THREE.ArrowHelper(cfg.dir, cfg.origin, cfg.length, cfg.color, cfg.headLength, cfg.headWidth);
    },
    camera:(cfg)=>{
        return new THREE.CameraHelper(cfg.camera,cfg.size,cfg.color);
    },
    grid:(cfg)=>{
        return new THREE.GridHelper(cfg.size,cfg.division,cfg.color[0],cfg.color[1]);
    },
    point:(cfg)=>{
        return new THREE.PointLightHelper(cfg.light,cfg.size,cfg.color);
    },
    direct:(cfg)=>{
        return new THREE.DirectionalLightHelper(cfg.light,cfg.size,cfg.color);
    },
    hemisphere:(cfg)=>{
        return new THREE.HemisphereLightHelper(cfg.light,cfg.size,cfg.color);
    },
    spot:(cfg)=>{
        return new THREE.SpotLightHelper(cfg.light,cfg.size,cfg.color);
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