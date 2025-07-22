/**
 * 3D Render for Septopus World
 *
 * @fileoverview
 *  1. parse resource such as texture and 3D module from other application.
 *  2. create 3D objects from `three` standard json.
 *  3. manage 3D objects in scene. 
 *
 * @author Fuu
 * @date 2025-04-23
 */

import VBW from "../core/framework";
import ThreeObject from "../three/entry";
import UI from "../io/io_ui";
import Toolbox from "../lib/toolbox";

const reg = {
    name: "rd_three",
    type: 'render',
    desc: "three.js renderer. Create three.js 3D objects here."
}

const config = {
    fov: 50,
    color: 0xff0000,
}

const env={
    player:null,
}

const self = {
    hooks: {
        reg: () => { return reg },
    },
    getConvert: () => {
        return VBW.cache.get(["env", "world", "accuracy"]);
    },
    getSide: () => {
        return VBW.cache.get(["env", "world", "side"]);
    },

    //convert to satisfy the Three.js system
    transform: (arr) => {
        return [arr[0], arr[2], -arr[1]];
    },

    parseTexture: (arr, world, dom_id, ck) => {
        const failed = []
        const set = VBW.cache.set;
        const get = VBW.cache.get;
        for (let i = 0; i < arr.length; i++) {
            const index = arr[i];
            const chain = ["block", dom_id, world, "texture", index];

            //1.看下资源是不是在
            const s_chain = ["resource", "texture", index];
            const tx = get(s_chain);
            if (tx.error) {
                failed.push(index);
                set(chain, { error: "No resource to parse." });
                continue;
            }

            //2.生成three的object，挂载到对应位置
            const dt = ThreeObject.get("texture", "basic", { image: tx.image, repeat: tx.repeat });
            if (dt.error) {
                failed.push(index);
                set(chain, { error: "Failed to create 3D object." });
                continue;
            }
            set(chain, dt);
        }
        return ck && ck(failed);
    },

    parseModule: (arr, world, dom_id, ck) => {
        const failed = []
        const set = VBW.cache.set;
        for (let i = 0; i < arr.length; i++) {
            const index = arr[i];
            const chain = ["block", dom_id, world, "module", index];

            const orgin = ["resource","module",index];
            if(!VBW.cache.exsist(orgin)){
                set(chain, { error: "No module resource" });
            }else{
                const row=VBW.cache.get(orgin);
                if(row.type && row.three === undefined){
                    row.three=null;    //set null to avoid multi decoding
                    const type=row.type.toLocaleLowerCase();
                    const cfg={
                        type:type,
                        target:row.raw,
                        callback:((id,chain)=>{
                            return (obj)=>{
                                //console.log(obj,parseInt(id));
                                const o_chain = ["resource", "module", parseInt(id)];
                                const row=VBW.cache.get(o_chain);
                                row.three=obj;

                                //set to world
                                VBW.cache.set(chain,obj.clone());
                            };
                        })(index,chain),
                    }
                    ThreeObject.get("basic","loader",cfg);
                }
            }
        }

        return ck && ck(failed);
    },
    parse: (texture, module, world, dom_id, ck) => {
        const failed = { module: [], texture: [] };
        //console.log(`3D Render to parse: ${JSON.stringify(texture)}, ${JSON.stringify(module)}`);
        self.parseTexture(texture, world, dom_id, (tx_failed) => {
            //console.log(`Texture parsed.`);
            failed.texture = tx_failed;
            self.parseModule(module, world, dom_id, (md_failed) => {
                //console.log(`Module parsed.`);
                failed.module = md_failed;
                return ck && ck(failed);
            });
        });
    },

    //construct STD data to render data.
    singleBlock: (x, y, world, dt) => {
        const result = { object: [], module: [], texture: [], animate: [] };
        for (let name in dt) {
            const list = dt[name];
            for (let i = 0; i < list.length; i++) {
                const row = list[i];

                //1.filter out texture and material for preload
                if (row.material && row.material.texture) {
                    if (!result.texture.includes(row.material.texture)) {
                        result.texture.push(row.material.texture);
                    }
                }

                //2.filter out module for preload
                if (row.module) {
                    if (!result.module.includes(row.module)) {
                        result.module.push(row.module);
                    }
                }

                //3.filter out animation
                if (row.animate !== undefined) {
                    result.animate.push({
                        x: x, y: y, world: world, index: row.index,
                        adjunct: name, effect: row.animate
                    });
                }

                //4.create ThreeObject format data from STD data.
                const obj3 = {
                    x: x,
                    y: y,
                    adjunct: name,
                    geometry: {
                        type: row.type,
                        //!importrant, need to clone, when calc the position, will effect `raw data`
                        params: Toolbox.clone(row.params),
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

    checkMaterial: (cfg, world, id) => {
        if (cfg.texture) {
            const chain = ["block", id, world, "texture", cfg.texture];
            const dt = VBW.cache.get(chain);
            if (dt !== undefined && !dt.error) {
                return { type: "meshphong", params: { texture: dt } };
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

    getThree: (single, world, id, side) => {
        //console.log(JSON.stringify(single));
        const arr = [];
        if (single.geometry && single.material) {
            const { geometry } = single;
            const { rotation, position } = geometry.params;
            //console.log(single.material);
            const material = self.checkMaterial(single.material, world, id);

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

        //TODO, add parsed module to scene
        if (single.module) {
            //console.log(`Load module.`);
        }

        return arr;
    },
    setSunLight: (scene, dom_id) => {
        const player = env.player;
        const [x, y] = player.location.block;
        const side = self.getSide();
        const cvt = self.getConvert();

        const sun = ThreeObject.get("light", "sun", { colorSky: 0xfffff, colorGround: 0xeeeee, intensity: 1 });
        sun.position.set(
            x * side[0],
            y * side[1],
            20 * cvt,
        )
        scene.add(sun);
    },
    setSky: (scene, dom_id) => {
        const player = env.player;
        const [x, y] = player.location.block;
        const world = player.location.world;
        const side = self.getSide();
        const cvt = self.getConvert();

        //1.get sky raw data.
        const sky = ThreeObject.get("basic", "sky", { scale: side[0] * 20 * cvt });
        sky.position.set(
            x * side[0],
            y * side[1],
            0
        );
        const chain = ["block", dom_id, world, "sky"];
        VBW.cache.set(chain, sky);

        //3.add sky to scene
        scene.add(sky);

        //4.add frame loop to update sky
        const frame_chain = ["block", dom_id, world, "loop"];
        const queue = VBW.cache.get(frame_chain);
        queue.push({ name: "sky_checker", fun: VBW.sky.check });
    },

    //FIXME, player can go out of editing block, this can effect the active block 
    //!important, in edit mode, player can go out the editing block, so the info of editing is isolated.
    loadEdit: (scene, dom_id) => {

        const world=env.player.location.world;
        const chain = ["block", dom_id, world, "edit"];
        if (!VBW.cache.exsist(chain)) return false;

        UI.show("toast", `Ready to show edit data.`);
        const edit = VBW.cache.get(chain);

        //1.get related helper
        let objs = [];
        if (edit.selected.adjunct) {
            if (edit.helper.length !== 0) {
                objs = objs.concat(edit.helper);
            }
        }

        //2.load border
        objs = objs.concat(edit.border);
        const data = self.singleBlock(
            edit.x,
            edit.y,
            world,
            { editor: objs }
        );
        const side = self.getSide();
        for (let i = 0; i < data.object.length; i++) {
            const single = data.object[i];
            //console.log(single);
            const ms = self.getThree(single, world, dom_id, side);
            for (let j = 0; j < ms.length; j++) {
                if (ms[j].error) {
                    UI.show("toast", ms[j].error, { type: "error" });
                    continue;
                }
                scene.add(ms[j]);
            }
        }

        //3.load grid
        if (edit.grid && edit.grid.raw !== null) {
            const params = Toolbox.clone(edit.grid.raw);
            //TODO, the parameters for grid can be modified and load dynamic
            params.density = {
                offsetX: 1000,
                offsetY: 1000,
                limitZ: 12000,
            }
            const gs = ThreeObject.get("extend", "grid", params);

            edit.grid.line = gs;
            gs.position[0] += (edit.x - 1) * side[0];
            gs.position[1] += (edit.y - 1) * side[1];
            gs.userData = {
                x: edit.x,
                y: edit.y,
                name: "grid",
            }
            scene.add(gs);
        }

        self.showHelper(scene, edit.x, edit.y, world, dom_id);
        self.showStop(scene, edit.x, edit.y, world, dom_id);
    },
    showHelper: (scene, x, y, world, dom_id) => {
        console.log(`Here to show helper on edit mode.`);
    },
    showStop: (scene, x, y, world, dom_id) => {
        const stops = VBW.cache.get(["block", dom_id, world, `${x}_${y}`, "stop"]);
        console.log(`Here to show stops on edit mode.`);
        for (let i = 0; i < stops.length; i++) {
            const row = stops[i];
            const obj = {
                geometry: {
                    type: row.orgin.type,
                    params: {
                        size: row.size,
                        position: row.position,
                        rotation: row.rotation,
                    },
                },
                material: row.material,
                x: x,
                y: y,
                adjunct: `${row.orgin.adjunct}_stop`,
            }

            const side = self.getSide();
            const ms = self.getThree(obj, world, dom_id, side);
            for (let j = 0; j < ms.length; j++) {
                if (ms[j].error) {
                    UI.show("toast", ms[j].error, { type: "error" });
                    continue;
                }
                scene.add(ms[j]);
            }
        }
    },
    loadBlocks: (scene, dom_id) => {
        const player = env.player;
        const limit = VBW.setting("limit");
        
        const ext = player.location.extend;
        const [x, y] = player.location.block;
        const world = player.location.world;

        for (let i = -ext; i < ext + 1; i++) {
            for (let j = -ext; j < ext + 1; j++) {
                const cx = x + i, cy = y + j
                if (cx < 1 || cy < 1) continue;
                if (cx > limit[0] || cy > limit[1]) continue;
                self.fresh(scene, cx, cy, world, dom_id);
            }
        }
    },

    fresh: (scene, x, y, world, dom_id) => {
        let mds = [], txs = [], objs = [], ans = [];
        const data_chain = ["block", dom_id, world, `${x}_${y}`, "three"];
        const tdata = VBW.cache.get(data_chain);

        //1.get data of target block[x,y]
        const data = self.singleBlock(x, y, world, tdata);
        if (data.texture.length !== 0) txs = txs.concat(data.texture);
        if (data.module.length !== 0) mds = mds.concat(data.module);
        objs = objs.concat(data.object);
        ans = ans.concat(data.animate);

        //2.parse texture and module for 3D renders
        self.parse(txs, mds, world, dom_id, (failed) => {

            //3.create ThreeObject, then add to scene
            const exsist = VBW.cache.exsist;
            for (let i = 0; i < objs.length; i++) {

                //3.1.create three object via three.js lib
                const single = objs[i];
                //console.log(single);
                const side = self.getSide();
                const ms = self.getThree(single, world, dom_id, side);

                //3.3. if there is animation, create the relasionship as `x_y_adj_index` --> ThreeObject[]
                if (single.animate !== undefined) {
                    const key = `${single.x}_${single.y}_${single.adjunct}_${single.index}`;
                    const chain = ["block", dom_id, world, "animate"];
                    if (!exsist(chain)) VBW.cache.set(chain, {});
                    const map = VBW.cache.get(chain);
                    if (map[key] === undefined) map[key] = [];
                    for (let i = 0; i < ms.length; i++) {
                        if (ms[i].error) continue;
                        map[key].push(ms[i]);
                    }
                }

                //3.4.add threeObjects to scene
                for (let i = 0; i < ms.length; i++) {
                    if (ms[i].error) {
                        UI.show("toast", ms[i].error, { type: "error" });
                        continue;
                    }
                    scene.add(ms[i]);
                }
            }

            //4.2.group animation queue
            const ani_chain = ["block", dom_id, world, "queue"];
            const ani_queue = VBW.cache.get(ani_chain);
            if (!ani_queue.error) {
                for (let i = 0; i < ans.length; i++) {
                    ani_queue.push(ans[i]);
                }
            }
        });

    },
    clean: (scene, x, y, world, dom_id) => {
        //1. remove related objects from scene
        //1.1. filter out Mesh to remove
        const todo = [];
        scene.children.forEach((row) => {
            if (row.userData.x === x && row.userData.y === y) {
                todo.push(row);
            }
        });

        //1.2. remove Meshes
        //!important, if remove mesh in `scene.children.forEach`,
        //!important, the length will change, then miss Meshes what needed to remove.
        if (todo.length !== 0) {
            todo.forEach((row) => {
                scene.remove(row);
                if (row.isMesh) {
                    if (row.material.map) {
                        row.material.map.dispose();
                    }
                    row.geometry.dispose();
                    row.material.dispose();
                }
            });
        }

        //2.remove related animate object from scene and aniamte queue
        const ani_chain = ["block", dom_id, world, "queue"];
        const map_chain = ["block", dom_id, world, "animate"];
        const list = VBW.cache.get(ani_chain);
        const map = VBW.cache.get(map_chain);
        const arr = [];
        for (let i = 0; i < list.length; i++) {
            const row = list[i];

            //2.1.remove animate object from map
            if (row.x === x && row.y === y) {
                const key = `${x}_${y}_${row.adjunct}_${row.index}`;
                delete map[key];
                continue;
            }

            //2.2. add not related to new queue
            arr.push(row);
        }
        VBW.cache.set(ani_chain, arr);
    }
};

const renderer={
    hooks: self.hooks,

    construct: (width, height, dom_id) => {
        //1.prepare 3D objects
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) {
            const scene = ThreeObject.get("basic", "scene", {});
            const render = ThreeObject.get("basic", "render", { width: width, height: height });
            const cfg = { width: width, height: height, fov: 50, near: 0.1, far: 1000000 };
            const camera = ThreeObject.get("basic", "camera", cfg);
            VBW.cache.set(chain, { render: render, camera: camera, scene: scene });
        }

        //2. set env
        if(env.player===null) env.player= VBW.cache.get(["env", "player"]);
        const dt = VBW.cache.get(chain);
        return dt.render.domElement;
    },

    /**  renderer entry
     * @param{string}    dom_id//container dom id
     * @param   {number[]}  block       //block coordinaration,[ x,y,world ]
     * */
    show: (dom_id, block) => {
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) return UI.show(`Construct the renderer before rendering.`, { type: "error" });

        const data = VBW.cache.get(chain);
        const { render, scene } = data;

        const info = render.info.render;
        const first = info.frame === 0 ? true : false;  //check frames to confirm whether first running.

        //first running functions
        if (first) {
            UI.show("toast", `Start 3D renderer.`);
            //1.load basic component
            //1.1. set sun light
            self.setSunLight(scene, dom_id);

            //1.1. set cube sky
            self.setSky(scene, dom_id);

            //1.3.load range of blocks
            self.loadBlocks(scene, dom_id);

            //2.set the loop to support animation
            render.setAnimationLoop(VBW.loop);

            UI.show("toast", `3D renderer is loaded.`);
        }

        //update target block and fresh scene
        if (block !== undefined) {
            const [x, y, world] = block;
            self.clean(scene, x, y, world, dom_id);
            self.fresh(scene, x, y, world, dom_id);
            self.loadEdit(scene, dom_id);
        }
    },

    clean: (dom_id, world, x, y) => {
        const chain = ["active", "containers", dom_id];
        const data = VBW.cache.get(chain);
        const { render, scene, camera } = data;

        self.clean(scene, x, y, world, dom_id);
    },
}

export default renderer;