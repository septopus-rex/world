/**
 * Core - sky
 *
 * @fileoverview
 *  1. struct sky by time and weather
 *
 * @author Fuu
 * @date 2025-04-23
 */

import VBW from "./framework";
import Toolbox from "../lib/toolbox";

const reg={
    name:"sky",
    category:'system',
    events:["change"],
}
const config={
    frequency: 300,      //frames to update
};

const env={
    sky:null,
    light:null,
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
    getLight:(scene)=>{
        for(const obj of scene.children){
            if(!obj.isMesh && obj.userData && obj.userData.type && obj.userData.type==="sun"){
                //console.log(obj);
                return obj;
            }
        }
        return null;
    },
    // update_test:()=>{
    //     const sky=env.sky;
    //     const light=env.light;
    //     const max=360;
    //     if (sky.counter === undefined) sky.counter = 0;
    //     if (sky.angle === undefined) sky.angle = 0;
    //     if (sky.angle > max) sky.angle = 0;

    //     const deg = Math.PI / 180;
    //     sky.material.uniforms['sunPosition'].value.setFromSphericalCoords(1, (90 - sky.angle) * deg, 90 * 0.5);
    //     sky.angle++;
    //     const i_step=0.05;
    //     light.intensity = i_step * sky.angle;
    // },
    update:()=>{
        const sky=env.sky;
        if (sky.counter === undefined) sky.counter = 0;
        if (sky.angle === undefined) sky.angle = 0;
        if (sky.angle > 180) sky.angle = 0;

        if (sky.counter > config.frequency) {
            const deg = Math.PI / 180;
            sky.material.uniforms['sunPosition'].value.setFromSphericalCoords(1, (90 - sky.angle) * deg, 90 * 0.5);
            sky.counter = 0;
            sky.angle++;

            const evt={
                from:"sky",
                stamp:Toolbox.stamp(),
            }
            VBW.event.trigger("sky","change",evt);
        } else {
            sky.counter++;
        }

        const light=env.light;
        //console.log(light);
        //light.intensity -= 0.01;
    },
}

const vbw_sky={
    hooks:self.hooks,
    check:()=>{
        //1. init sky
        if(env.sky===null || env.light===null){
            const dom_id = VBW.cache.get(["active", "current"]);
            const player = VBW.cache.get(["env", "player"]);
            const world = player.location.world;
            const chain = ["block", dom_id, world, "sky"];
            env.sky= VBW.cache.get(chain);

            const scene=VBW.cache.get(["active","containers",dom_id,"scene"]);
            //console.log(scene);
            env.light=self.getLight(scene);
        }
        //2. update sky
        self.update();
    },
    task:()=>{
        return {
            set:()=>{

            },
            night:()=>{

            },
            router: [
                { method:"set", gameonly:true},
                { method:"night", gameonly:true},
            ],
        }
    }
}

export default vbw_sky;