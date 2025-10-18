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

const reg = {
    name: "rd_observe",
    type: 'render',
    desc: "Ovserve renderer to show single block.",
    version: "1.0.0",
    events: ["ready", "done"],
}

const config = {
    container: "observe_container",
    camera: {

    },
    extend:0,
};

const env = {
    player: null,
    controller: null,
    camera:null,
    renderer:null,
    scene:null,
    container:"",
};

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
    },
    //get center of the range for setting lookat point
    getCenter: (blocks) => {

    },
    calculateBlockBounds: (blocks,border) => {
        const ext=!border?0:parseInt(border);
        if (!blocks || blocks.length === 0) return {error:"Invalid block array."}

        // 1. calc the range
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const [x, y] of blocks) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        // 2. Center block
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerBlock = [ Math.round(centerX), Math.round(centerY)];

        // 3. Corner Coordinates
        const cornerCoordinates = [
            [minX-ext, minY-ext],   //Left-Bottom
            [maxX+ext, minY-ext],   //Right-Bottom
            [maxX+ext, maxY+ext],   //Right-Top
            [minX-ext, maxY+ext]    //Left-Top
        ];

        return {
            center: centerBlock,
            corner: cornerCoordinates
        };
    },
    loadObjects: (scene, blocks) => {
        const bks = !blocks ? [env.player.location.block] : blocks;
        const boundy=self.calculateBlockBounds(bks,config.extend);
    
    },
    loadLight: (scene) => {
        //new THREE.DirectionalLight( 0xffffff, 5 );
        const light = ThreeObject.get("light", "direct", { intensity: 5, color: 0xffffff });
        light.position.set(- 2, 5, - 3);
        light.castShadow = true;
        const cam = light.shadow.camera;
        cam.top = cam.right = 2;
        cam.bottom = cam.left = - 2;
        cam.near = 3;
        cam.far = 8;
        light.shadow.mapSize.set(1024, 1024);
        scene.add(light);
    },
    loadOrbit: (camera, renderer) => {
        const PI90 = Math.PI / 2;

        const cfg = {
            type: "orbit",
            params: { camera: camera, renderer: renderer },
        }
        const orbitControls = ThreeObject.get("basic", "controller", cfg);

        orbitControls.target.set(0, 1, 0);
        orbitControls.enableDamping = true;
        orbitControls.enablePan = false;
        orbitControls.maxPolarAngle = PI90 - 0.05;
        orbitControls.update();
        return orbitControls;
    },

    animate: () => {
        
        env.renderer.render(env.scene, env.camera);
    },
};

const renderer = {
    hooks: self.hooks,
    construct: (width, height, dom_id, cfg) => {
        console.log(`Construct:`,dom_id);
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) {
            const cfg_scene = {}
            const scene = ThreeObject.get("basic", "scene", cfg_scene);

            const cfg_render = { width: width, height: height, shadow: (cfg.shadow === undefined ? false : cfg.shadow) }
            const render = ThreeObject.get("basic", "render", cfg_render);

            const cfg_camera = { width: width, height: height, fov: 50, near: 0.1, far: 1000000 };
            const camera = ThreeObject.get("basic", "camera", cfg_camera);

            VBW.cache.set(chain, { render: render, camera: camera, scene: scene });

            env.camera=camera;
            env.renderer=render;
            env.scene=scene;
        }

        if (env.player === null) env.player = VBW.cache.get(["env", "player"]);
        if (!env.container) env.container=dom_id;

        const dt = VBW.cache.get(chain);
        return dt.render.domElement;
    },
    show: (container, blocks) => {
        console.log("Show:",container);
        //0. set basic env
        const chain = ["active", "containers", container];
        if (!VBW.cache.exsist(chain)) {
            const dt = VBW.detect.check(container);
            const dom_render = renderer.construct(dt.width, dt.height, container, {});
            const target = document.getElementById(container);
            target.appendChild(dom_render);
        }
        const data = VBW.cache.get(chain);
        const { render, scene, camera } = data;

        const info = render.info.render;
        const first = info.frame === 0 ? true : false;

        //1. load objects
        const center = self.loadObjects(scene, blocks);

        //2. add light
        self.loadLight(scene);
        env.controller = self.loadOrbit(camera, render);

        render.setAnimationLoop(self.animate);
    },

    clean: (dom_id, world, x, y) => {

    },
}

export default renderer;