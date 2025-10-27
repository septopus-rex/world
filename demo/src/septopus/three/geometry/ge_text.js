/**
 * Three.js geometry function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create text to show information.
 *
 * @author Fuu
 * @date 2025-06-10
 */

import * as THREE from "three";

const self={
    get:(text,cfg)=>{
        //FIXME, not support?
        //return new THREE.TextGeometry( text, cfg )
    },
    valid:(params)=>{

        return true;
    }
}

const geometry_text={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create TEXT."};
        

        return self.get(params);
    }
};

export default geometry_text;