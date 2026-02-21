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
        //console.log(params);
        if(Array.isArray(params.texture)){
            const ms=[];
            for(let i=0;i<params.texture.length;i++){
                const tx=params.texture[i];
                const cfg={
                    color: 0xFFFFFF,
                    map:tx,
                    transparent: true,
                    shininess: 50,          //hightlight instensity
                };
                const cube_mt=new THREE.MeshPhongMaterial(cfg);
                cube_mt.opacity=0.6;
                ms.push(cube_mt);
            }
            return ms;
        }else{
            const cfg={
                color: 0xFFFFFF,
                map:params.texture,
                transparent: true,
            };
            return new THREE.MeshStandardMaterial(cfg);
        }
    },
    standard:()=>{
        return self.sample();
    },
};

export default material_meshstandard;