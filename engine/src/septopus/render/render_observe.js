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
import Toolbox from "../lib/toolbox";

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
    extend: 0,
};

const env = {
    player: null,
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
    getSide: () => {
        return VBW.cache.get(["env", "world", "side"]);
    },
    getConvert: () => {
        return VBW.cache.get(["env", "world", "accuracy"]);
    },
    /** entry of getting 3D meshes
     * @functions
     * 1. create 3D object from `STD 3D` raw data
     * 2. calc the position of new mesh
     * 3. add userData to tag the 3D object
     * @param {object}      single  - single standard 3D object
     * @param {integer}     world   - index of world
     * @param {integer[]}   side    - side size of single block
     * @param {string}      dom_id  - container DOM id
     * @return {object[]}   - 3D object array
     * */
    getThree: (single, world, dom_id, side) => {
        const arr = [];
        //1. get geometry to show
        if (single.geometry && single.material) {
            const { geometry } = single;
            const { rotation, position } = geometry.params;
            //console.log(single.material);
            const material = self.checkMaterial(single.material, world, dom_id);

            //1.set position of 3D object
            position[0] += (single.x - 1) * side[0];
            position[1] += (single.y - 1) * side[1];

            const res = ThreeObject.mesh(geometry, material, position, rotation);

            //2.set mesh useData before adding to scene for searching.
            const mesh = res.mesh;
            const data = {
                x: parseInt(single.x),
                y: parseInt(single.y),
                name: single.adjunct
            }
            if (single.index !== undefined) data.index = single.index;
            mesh.userData = data;

            arr.push(mesh);
        }

        return arr;
    },
    calculateBlockBounds: (blocks, border) => {
        const ext = !border ? 0 : parseInt(border);
        if (!blocks || blocks.length === 0) return { error: "Invalid block array." }

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
        const centerBlock = [Math.round(centerX), Math.round(centerY)];

        // 3. Corner Coordinates
        const cornerCoordinates = [
            [minX - ext, minY - ext],   //Left-Bottom
            [maxX + ext, minY - ext],   //Right-Bottom
            [maxX + ext, maxY + ext],   //Right-Top
            [minX - ext, maxY + ext]    //Left-Top
        ];

        return {
            center: centerBlock,
            corner: cornerCoordinates
        };
    },
    /** create different type of material
     * @param {object}      cfg     - {color:0x334455,texture:13}
     * @param {integer}     world   - index of world
     * @param {string}      dom_id  - container DOM id
     * @return {object}     - standard 3D format to create material
     * */
    checkMaterial: (cfg, world, dom_id) => {
        if (cfg.texture) {
            if (Array.isArray(cfg.texture)) {
                //console.log(cfg.texture);
                const cube = { type: "meshstandard", params: { texture: [] } };
                for (const tid of cfg.texture) {
                    const chain = ["block", dom_id, world, "texture", tid];
                    const dt = VBW.cache.get(chain);
                    if (dt !== undefined && !dt.error) {
                        cube.params.texture.push(dt);
                    }
                }

                if (cube.params.texture.length !== 0) {
                    return cube;
                } else {
                    return {
                        type: "meshbasic",
                        params: {
                            color: cfg.color,
                            opacity: !cfg.opacity ? 1 : cfg.opacity,
                        }
                    };
                }

            } else {
                const chain = ["block", dom_id, world, "texture", cfg.texture];
                const dt = VBW.cache.get(chain);
                if (dt !== undefined && !dt.error) {
                    //return { type: "meshphong", params: { texture: dt } };
                    return { type: "meshstandard", params: { texture: dt } };
                }
            }
        }

        if (cfg.color) {
            return {
                type: "meshbasic",
                params: {
                    color: cfg.color,
                    opacity: !cfg.opacity ? 1 : cfg.opacity,
                }
            };
        }

        return { type: "linebasic", params: { color: config.color, opacity: 1 } };
    },
    /** 
     *construct STD data to render data.
     * @functions
     * 1. filter out texture and module.
     * 2. filter animation
     * 3. convert data to 3D_STD format, for the next step
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @param {number}      world   - world index
     * @param {object[]}    dt      - STD[], STD array
     * @return void
     */
    singleBlock: (x, y, world, dt) => {
        const result = { object: [], module: [], texture: [], animate: [] };
        for (let name in dt) {
            const list = dt[name];
            for (const row of list) {
                //1.filter out texture and material for preload
                if (row.material && row.material.texture) {
                    if (Array.isArray(row.material.texture)) {
                        for (const tid of row.material.texture) {
                            if (!result.texture.includes(tid)) {
                                result.texture.push(tid);
                            }
                        }
                    } else {
                        if (!result.texture.includes(row.material.texture)) {
                            result.texture.push(row.material.texture);
                        }
                    }
                }

                //2.filter out module for preload
                if (row.module) {
                    if (!result.module.includes(row.module)) {
                        result.module.push(row.module);
                    }
                }

                //3.create ThreeObject format data from STD data.
                const obj3 = {
                    x: x,
                    y: y,
                    adjunct: name,
                    geometry: {
                        type: row.type,
                        params: Toolbox.clone(row.params),  //!importrant, need to clone, when calc the position, will effect `raw data`
                    },
                }
                if (row.material !== undefined) obj3.material = row.material
                if (row.index !== undefined) obj3.index = row.index;
                if (row.module !== undefined) obj3.module = row.module;
                if (row.animate !== undefined) obj3.animate = row.animate;
                result.object.push(obj3);
            }
        }
        return result;
    },

    loadObjects: (scene, blocks) => {
        const bks = !blocks ? [env.player.location.block] : blocks;
        const boundy = self.calculateBlockBounds(bks, config.extend);

        const dom_id = VBW.cache.get(["active", "current"]);
        const world = env.player.location.world;
        console.log(dom_id, world);

        let mds = [], txs = [], objs = [], ans = [];
        for (const [x, y] of bks) {
            const data_chain = ["block", dom_id, world, `${x}_${y}`, "three"];
            const tdata = VBW.cache.get(data_chain);
            const data = self.singleBlock(x, y, world, tdata);
            if (data.texture.length !== 0) txs = txs.concat(data.texture);
            if (data.module.length !== 0) mds = mds.concat(data.module);
            objs = objs.concat(data.object);
            ans = ans.concat(data.animate);
        }

        const side = self.getSide();
        for (const single of objs) {
            const ms = self.getThree(single, world, dom_id, side);
            for(const mesh of ms) scene.add(mesh);
        }

        return boundy;
    },
    calcPosition:(block)=>{
        const side=self.getSide();
        const [x,y]=block;
        return [
            (x-1)*side[0],
            (y-1)*side[1],
            side[0]+side[0],
        ];
    },
    setShadow:(scene)=>{
        for(const obj of scene.children){
            if(obj.isMesh){
                obj.castShadow = true;
                if(obj.userData && obj.userData.name && obj.userData.name==="block"){
                    obj.receiveShadow=true;
                }
            }
        }
    },
    loadLight: (scene,corner, shadow) => {
        if(shadow) self.setShadow(scene);

        const side=self.getSide();
        const pos=self.calcPosition(corner[2]);

        //1.set direct light
        const light = ThreeObject.get("light", "direct", { intensity: 3, color: 0xffffff });
        light.castShadow = true;
        const cam = light.shadow.camera;
        cam.top = cam.right = side[0]*2;
        cam.bottom = cam.left = -side[0]*2;
        cam.near = 3;
        cam.far = side[0]*4;

        env.followGroup.add( light );
		env.followGroup.add( light.target );
        env.followGroup.position.set(pos[0], pos[2], -pos[1]);
        scene.add(env.followGroup);

        //2. set camera position
        console.log(`Before`,JSON.stringify(env.camera.position));
        env.camera.position.set(pos[0], pos[2], -pos[1]);
        console.log(`After`,JSON.stringify(env.camera.position));
    },
    loadOrbit: (camera, renderer,center) => {

        const side=self.getSide();
        const PI90 = Math.PI / 2;
        const cfg = {
            type: "orbit",
            params: { camera: camera, renderer: renderer },
        }
        const orbitControls = ThreeObject.get("basic", "controller", cfg);
        orbitControls.target.set((center[0]-0.5)*side[0],0, -(center[1]-0.5)*side[1]);
        orbitControls.enableDamping = true;
        orbitControls.enablePan = false;
        orbitControls.maxPolarAngle = PI90 - 0.05;
        orbitControls.update();
        return orbitControls;
    },

    animate: () => {
        //2. update scene
        env.renderer.render(env.scene, env.camera);
    },
};

const renderer = {
    hooks: self.hooks,

    construct: (width, height, dom_id, cfg) => {
        console.log(`Construct:`, dom_id);
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) {
            //const cvt=self.getConvert();
            const side=self.getSide();
            const cfg_scene = {}
            const scene = ThreeObject.get("basic", "scene", cfg_scene);

            const cfg_render = { width: width, height: height, shadow: (cfg.shadow === undefined ? false : cfg.shadow) }
            const render = ThreeObject.get("basic", "render", cfg_render);

            const cfg_camera = { width: width, height: height, fov: 35, near: 1, far: 10 * side[0] };
            const camera = ThreeObject.get("basic", "camera", cfg_camera);
            camera.rotation.order="ZYX";

            VBW.cache.set(chain, { render: render, camera: camera, scene: scene });

            env.camera = camera;
            env.renderer = render;
            env.scene = scene;
            env.followGroup=ThreeObject.get("basic","group");
        }

        if (env.player === null) env.player = VBW.cache.get(["env", "player"]);
        if (!env.container) env.container = dom_id;

        const dt = VBW.cache.get(chain);
        return dt.render.domElement;
    },

    show: (container, blocks) => {
        console.log("Show:", container);
        //0. set basic env
        const chain = ["active", "containers", container];
        if (!VBW.cache.exsist(chain)) {
            const dt = VBW.detect.check(container);
            const dom_render = renderer.construct(dt.width, dt.height, container, {shadow:true});
            const target = document.getElementById(container);
            target.appendChild(dom_render);
        }

        const info = env.renderer.info.render;
        const first = info.frame === 0 ? true : false;

        //1. load objects
        const boundy = self.loadObjects(env.scene, blocks);

        //2. add light
        self.loadLight(env.scene,boundy.corner, true);

        //3. set controller
        env.controller = self.loadOrbit(env.camera, env.renderer, boundy.center);

        env.renderer.setAnimationLoop(self.animate);

        console.log(env);
    },

    clean: (dom_id, world, x, y) => {
        env.renderer.setAnimationLoop(null);
        env.scene = null;
        env.camera = null;
        env.scene = null;

        const chain = ["active", "containers", dom_id];
        VBW.cache.remove(chain);
    },
}

export default renderer;