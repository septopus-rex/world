/* 
*  Three.js basic texture 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-29
*  @there.js R175
*  @functions
*  1. create texture from image.
*/


import * as THREE from "three";

const self={
    
    valid:(params)=>{

        return true;
    },

    //提供standard的数据输出，可以进行比较处理，也供valid来使用
    sample:()=>{
        return {
            size:[],
        }
    },
}

const texture_basic={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {image,repeat}=params;
        //const texture = new THREE.TextureLoader().load( "textures/water.jpg" );
        const texture = new THREE.TextureLoader().load(image);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set( repeat[0],repeat[1]);

        return texture;
    },
    standard:()=>{
        return self.sample();
    },
};

export default texture_basic;