/**
 * Render - 3D texture Render
 *
 * @fileoverview
 *  1. 3D render from texture
 *  2. set texture parameters to get best showing
 *
 * @author Fuu
 * @date 2025-10-29
 */


import VBW from "../core/framework";
import ThreeObject from "../three/entry";
import Toolbox from "../lib/toolbox";

const reg = {
    name: "rd_texture",
    type: 'render',
    desc: "Preveiw texture in 3D model.",
    version: "1.0.0",
    events: ["ready", "done"],
}

const config = {
    container: "texture_container",
    camera: {

    },
    extend: 0,
};

const env = {
    controller: null,
    camera: null,
    renderer: null,
    scene: null,
    followGroup:null,
    container: "",
};

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
    },
    loadTarget:(box,texture)=>{
        console.log(box,texture);
        const ge=ThreeObject.get("geometry","box",{size:box});
        
        console.log(ge);
    },
    loadAx:(scene)=>{
        console.log(scene);
    },
    loadLight:(scene)=>{

        const pos=[10,10,10 ];
        const light = ThreeObject.get("light", "direct", { intensity: 3, color: 0xffffff });
        light.castShadow = true;
        const cam = light.shadow.camera;
        cam.top = cam.right = 10;
        cam.bottom = cam.left = 10;
        cam.near = 1;
        cam.far = 40;

        env.followGroup.add( light );
		env.followGroup.add( light.target );
        env.followGroup.position.set(pos[0], pos[2], -pos[1]);
        scene.add(env.followGroup);

        env.camera.position.set(pos[0], pos[2], -pos[1]);
    },
    loadOrbit: (camera, renderer,center) => {
        console.log(camera, renderer,center);
        // const side=self.getSide();
        // const PI90 = Math.PI / 2;
        // const cfg = {
        //     type: "orbit",
        //     params: { camera: camera, renderer: renderer },
        // }
        // const orbitControls = ThreeObject.get("basic", "controller", cfg);
        // orbitControls.target.set((center[0]-0.5)*side[0],0, -(center[1]-0.5)*side[1]);
        // orbitControls.enableDamping = true;
        // orbitControls.enablePan = false;
        // orbitControls.maxPolarAngle = PI90 - 0.05;
        // orbitControls.update();
        // return orbitControls;
    },

    animate: () => {
        //2. update scene
        env.renderer.render(env.scene, env.camera);
    },
};

const renderer={
    hooks:self.hooks,
    construct:(width, height, dom_id, cfg)=>{
        console.log(width, height, dom_id, cfg);
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) {

            const cfg_scene = {}
            const scene = ThreeObject.get("basic", "scene", cfg_scene);

            const cfg_render = { width: width, height: height, shadow: (cfg.shadow === undefined ? false : cfg.shadow) }
            const render = ThreeObject.get("basic", "render", cfg_render);

            const cfg_camera = { width: width, height: height, fov: 35, near: 1, far: 10  };
            const camera = ThreeObject.get("basic", "camera", cfg_camera);
            camera.rotation.order="ZYX";

            VBW.cache.set(chain, { render: render, camera: camera, scene: scene });

            env.camera = camera;
            env.renderer = render;
            env.scene = scene;
            if (!env.container) env.container = dom_id;
            env.followGroup=ThreeObject.get("basic","group");

            const dt = VBW.cache.get(chain);
            return dt.render.domElement;
        }
    },
    show:(container, param)=>{
        console.log(container, param);

        const chain = ["active", "containers", container];
        if (!VBW.cache.exsist(chain)) {
            const dt = VBW.detect.check(container);
            const dom_render = renderer.construct(dt.width, dt.height, container, {shadow:true});
            const target = document.getElementById(container);
            target.appendChild(dom_render);
        }

        self.loadTarget(param.box,param.source);

        self.loadLight(env.scene);
    },
    clean:(dom_id)=>{
        console.log(dom_id)
    },
}

export default renderer;