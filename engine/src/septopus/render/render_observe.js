/**
 * Render - 3D Render
 *
 * @fileoverview
 *  1. 3D render from `3D STD` data for observing
 *
 * @author Fuu
 * @date 2025-04-23
 */


import VBW from "../core/framework";
import ThreeObject from "../three/entry";

const reg={
    name:"rd_observe",
    type:'render',
    desc: "Ovserve renderer to show single block.",
    version:"1.0.0",
    events:["ready","done"],
}

const config={
    container:"observe_container",
    camera:{

    },
};

const env = {
    camera:null,
    block:[0,0],
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
    },
    
};

const renderer={
    hooks:self.hooks,
    construct:(width, height, dom_id, cfg)=>{
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) {
            const cfg_scene={}
            const scene = ThreeObject.get("basic", "scene", cfg_scene);

            const cfg_render={ width: width, height: height,shadow:(cfg.shadow===undefined?false:cfg.shadow)}
            const render = ThreeObject.get("basic", "render", cfg_render);

            const cfg_camera = { width: width, height: height, fov: 50, near: 0.1, far: 1000000 };
            const camera = ThreeObject.get("basic", "camera", cfg_camera);

            VBW.cache.set(chain, { render: render, camera: camera, scene: scene });
        }

        const dt = VBW.cache.get(chain);
        return dt.render.domElement;
    },
    show:(container,blocks)=>{
        const chain = ["active", "containers", container];
        if (!VBW.cache.exsist(chain)){
            const dt = VBW.detect.check(container);
            renderer.construct(dt.width,dt.height,container,{});
        }

        const dom_id= VBW.cache.get(["active","current"]);

        console.log(`Container ID`,container);
        console.log(`Dom ID`,dom_id);

    },
    clean:(dom_id, world, x, y)=>{

    },
}

export default renderer;