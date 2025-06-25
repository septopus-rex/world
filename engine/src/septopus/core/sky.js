/**
 * Core - sky
 *
 * @fileoverview
 *  1. struct sky by time and weather
 *
 * @author Fuu
 * @date 2025-04-23
 */

import VBW from "../core/framework";

const reg={
    name:"sky",
    category:'system',
}
const config={
    frequency:300,      //frames to update
};

const env={
    sky:null,
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","sky"],
                value:{
                    source:"",
                    type:"",
                }
            };
        },
    },
}

const vbw_sky={
    hooks:self.hooks,
    check:()=>{
        if(env.sky===null){
            const dom_id = VBW.cache.get(["active", "current"]);
            const player = VBW.cache.get(["env", "player"]);
            const world = player.location.world;
            const chain = ["block", dom_id, world, "sky"];
            env.sky= VBW.cache.get(chain);
        }

        const sky=env.sky;
        if (sky.counter === undefined) sky.counter = 0;
        if (sky.angle === undefined) sky.angle = 0;
        if (sky.angle > 180) sky.angle = 0;

        if (sky.counter > config.frequency) {
            const deg = Math.PI / 180;
            sky.material.uniforms['sunPosition'].value.setFromSphericalCoords(1, (90 - sky.angle) * deg, 90 * 0.5);
            sky.counter = 0;
            sky.angle++;
        } else {
            sky.counter++;
        }
    },
}

export default vbw_sky;