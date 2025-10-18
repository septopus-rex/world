/**
 * Three.js material function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create meshphong material
 *
 * @author Fuu
 * @date 2025-05-21
 */

import * as THREE from "three";

const self={
    get:(size,position,rotation,material)=>{

    },
    valid:(params)=>{

        return true;
    },
    sample:()=>{
        return {
            color:"#ffffff",
        }
    },
}

const material_meshstandard={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create MeshPhong material."};
        if(Array.isArray(params.texture)){
            //console.log(params.texture);
            const ms=[];
            for(let i=0;i<params.texture.length;i++){
                const tx=params.texture[i];
                const cfg={
                    color: 0xFFFFFF,
                    map:tx,
                    shininess: 50,          //hightlight instensity
                };
                ms.push(new THREE.MeshPhongMaterial(cfg))
            }
            return ms;
        }else{
            const cfg={
                color: 0xFFFFFF,
                map:params.texture,
            };
            return new THREE.MeshStandardMaterial(cfg);
        }
    },
    standard:()=>{
        return self.sample();
    },
};

export default material_meshstandard;