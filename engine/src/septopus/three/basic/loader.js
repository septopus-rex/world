/**
 * Three.js loader function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. loader entry, manage different type of 3D object from other applications.
 *
 * @author Fuu
 * @date 2025-07-21
 */

import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const router={
    fbx:FBXLoader,
    obj:OBJLoader,
}
const instances={
    fbx:null,

}

const self={
    valid:(params)=>{
        if(!params.callback) return false;
        return true;
    },
};

const Loader={
    create:(cfg)=>{
        //console.log(cfg);
        if(!cfg.type) return {error:"Invalid parameters."};
        if(!self.valid(cfg)) return {error:"Invalid parameters to create Helper."};
        const type=cfg.type;
        if(!router[type]) return {error:`File type "${type}" is not support yet.`};
        if(instances[type]===null) instances[type]=new router[type];
        if(!instances[type].load) return {error:"Interner error, three.js loader error."};

        instances[type].load(cfg.target,(obj)=>{
            cfg.callback && cfg.callback(obj);
        });
    },
    animate:()=>{

    },
}

export default Loader;