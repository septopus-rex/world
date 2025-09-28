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

import * as THREE from "three";

import VBW from "../core/framework";
import ThreeObject from "../three/entry";
import UI from "../io/io_ui";
import Toolbox from "../lib/toolbox";
import Effects from "../effects/entry";

const reg = {
    name: "rd_three",
    type: 'render',
    desc: "three.js renderer. Create three.js 3D objects here.",
    version:"1.0.0",
    events:["ready","done"],
}

const config = {
    fov: 50,
    color: 0xff0000,
    speed:60,               //frame update rate to calc time
}

const env={
    player:null,
    animation:null,
}

const demo={
    light:(scene,dom_id)=>{
        const cvt=self.getConvert();
        const bk=[2025,620],side=16000;

        //1. PointLight demo
        const cfg={convert:cvt,distance:cvt*100,intensity:200,color:0xff0000};
        const pointLight=ThreeObject.get("light","point",cfg);
        pointLight.position.set(
            (bk[0]-1)*side+0.5*side,
            side*0.1,
            -bk[1]*side+0.5*side,
        );
        scene.add(pointLight);

        const lightHelper = new THREE.PointLightHelper(pointLight, 200);
        scene.add(lightHelper);

        //2. SpotLight demo
        const target=[
            (bk[0]-1)*side+0.5*side,
            side*0.5,
            -bk[1]*side+0.5*side
        ]
        const s_cfg={convert:cvt,distance:cvt*8,intensity:200,color:0x00ff00,target:target,angle:Math.PI / 6};
        const spotLight=ThreeObject.get("light","spot",s_cfg);
        spotLight.position.set(
            (bk[0]-1)*side+0.2*side,
            side*0.1,
            -bk[1]*side+0.2*side,
        );
        scene.add(pointLight);

        const helper = new THREE.SpotLightHelper(spotLight);
        scene.add(helper);
    },
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
    getAnimateQueue: (world, dom_id) => {
        const ani_chain = ["block", dom_id, world, "queue"];
        const ans = VBW.cache.get(ani_chain);
        return ans;
    },
    getAnimateMap: (world, dom_id) => {
        const ani_chain = ["block", dom_id, world, "animate"];
        const ans = VBW.cache.get(ani_chain);
        return ans;
    },

    //coordination convert to satisfy to Three.js system
    transform: (arr) => {
        return [arr[0], arr[2], -arr[1]];
    },

    /** 
     * parse texture data
     * @functions
     * 1. parse module data and cache
     * @param {integer[]}   arr         - texture id array
     * @param {number}      world       - world index
     * @param {string}      dom_id      - container DOM id
     * @param {function}    ck          - callback function
     * @callback  - callback failed to parse texture IDs.
     */
    parseTexture: (arr, world, dom_id, ck) => {
        const failed = []
        const set = VBW.cache.set;
        const get = VBW.cache.get;
        for (let i = 0; i < arr.length; i++) {
            const index = arr[i];
            const chain = ["block", dom_id, world, "texture", index];

            //1.check wether loaded
            const s_chain = ["resource", "texture", index];
            const tx = get(s_chain);
            if (tx.error) {
                failed.push(index);
                set(chain, { error: "No resource to parse." });
                continue;
            }

            //2.cache for use
            const dt = ThreeObject.get("texture", "basic", { image: tx.raw, repeat: tx.repeat });
            if (dt.error) {
                failed.push(index);
                set(chain, { error: "Failed to create 3D object." });
                continue;
            }
            set(chain, dt);
        }
        return ck && ck(failed);
    },

    /** 
     * parse modules data
     * @functions
     * 1. parse module data and cache
     * @param {integer[]}   arr         - module id array
     * @param {number}      world       - world index
     * @param {string}      dom_id      - container DOM id
     * @param {function}    ck          - callback function
     * @callback  - callback failed to parse module IDs.
     */
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
                //2. parse module and storage
                const row=VBW.cache.get(orgin);
                if(row.type && row.three === undefined){
                    //!important, set null to avoid multi decoding
                    row.three = null;    
                    const type = row.format.toLocaleLowerCase();
                    const cfg={
                        type:type,
                        target:row.raw,
                        callback:((id)=>{
                            return (obj)=>{
                                //2.1. save to resource 
                                const o_chain = ["resource", "module", parseInt(id)];
                                const row=VBW.cache.get(o_chain);
                                row.three=obj;

                                //3.replace module in active scene;
                                setTimeout(()=>{
                                    const ev={id:id,stamp:Toolbox.stamp()}
                                    VBW.event.trigger("module","parsed",ev);
                                },1000);
                            };
                        })(index),
                    }
                    ThreeObject.get("basic","loader",cfg);
                }else{
                    if(row.three!==null){
                        console.log(`Module ${row.index} is already parsed.`);

                        //FIXME, here to wait 300ms to wait the holder of module is ready.
                        setTimeout(()=>{
                            const ev={id:row.index,stamp:Toolbox.stamp()}
                            VBW.event.trigger("module","parsed",ev);
                        },300)
                        
                    }else{
                        UI.show("toast", `Parsing failed module, id: ${row.index}`, { type: "error" });
                    }
                }
            }
        }
        return ck && ck(failed);
    },

    /** 
     * parse resource needed by 3D renderer
     * @functions
     * 1. parse texture data.
     * 2. parse module data.
     * @param {integer[]}   texture     -  texture id array
     * @param {integer[]}   module      - module id array
     * @param {number}      world       - world index
     * @param {string}      dom_id      - container DOM id
     * @param {function}    ck          - callback function
     * @callback  - callback failed to parse IDs of module and texture
     */
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
        //console.log(`Construct block: #${world} world [${x},${y}]`);
        //console.log(JSON.stringify(dt));
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

    /** create different type of material
     * @param {object}      cfg     - {color:0x334455,texture:13}
     * @param {integer}     world   - index of world
     * @param {string}      dom_id  - container DOM id
     * @return {object}     - standard 3D format to create material
     * */
    checkMaterial: (cfg, world, dom_id) => {
        if (cfg.texture) {
            const chain = ["block", dom_id, world, "texture", cfg.texture];
            const dt = VBW.cache.get(chain);
            if (dt !== undefined && !dt.error) {
                //return { type: "meshphong", params: { texture: dt } };
                return { type: "meshstandard", params: { texture: dt } };
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

    /** filter out the mesh for replacing
     * @param {object}      target  - {x:100,y:201,world:0,adjunct:"module",index:0,module:19}
     * @param {object}      scene   - 3D scene
     * @return {false | object}     - false or 3D mesh for replacing
     * */
    filterMeshes:(target,scene)=>{
        for(let i=0;i<scene.children.length;i++){
            const data=scene.children[i].userData;
            if(data.x===undefined || 
                data.y===undefined || 
                data.name===undefined ||
                !scene.children[i].isMesh
            ) continue;
            if(data.x===target.x && 
                data.y===target.y && 
                data.name===target.adjunct) return scene.children[i];
        }
        return false;
    },

    /** 3D module autoreplace function creator
     * @functions
     * 1. filter out the module mesh 
     * 2. add parsed module to scene and remove holder mesh
     * @param {object}      target  - {x:100,y:201,world:0,adjunct:"module",index:0,module:19}
     * @return void
     * */
    replaceFun:(target)=>{
        return ((adj)=>{
            return (ev)=>{
                
                if(adj.module!==ev.id) return false;
                //console.log(target,ev);

                //1. get module mesh
                const active=VBW.cache.get(["active"]);
                const dom_id=active.current;
                const scene=active.containers[dom_id].scene;
                const mesh=self.filterMeshes(target,scene);
                if(mesh===false) return false;

                //2. get parsed module
                const chain=["resource","module",ev.id,"three"];
                //console.log(chain,JSON.stringify(adj));
                const obj=VBW.cache.get(chain);
                if(obj.error) return false;

                //3. manage mesh in scene;
                //3.1. add module to scene
                const md=obj.clone();
                md.position.copy(mesh.position);
                md.rotation.copy(mesh.rotation);
                md.userData=Toolbox.clone(mesh.userData);
                
                const cvt=VBW.cache.get(["env", "world", "accuracy"]);
                md.scale.set(cvt,cvt,cvt);
                md.rotation.set(md.rotation.x - Math.PI * 0.5, md.rotation.y,md.rotation.z);
    
                scene.add(md);

                //3.2. remove replaced mesh
                scene.remove(mesh);
                if (mesh.material.map) {
                    mesh.material.map.dispose();
                }
                mesh.geometry.dispose();
                mesh.material.dispose();
            };
        })(target);
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
        //console.log(JSON.stringify(single));
        const arr = [];

        //1. get module to show
        if (single.module) {
            const target={
                x:single.x,
                y:single.y,
                world:world,
                index:single.index,
                adjunct:single.adjunct,
                module:single.module
            }
            VBW.event.on("module","parsed",self.replaceFun(target),target);
        }

        //2. get geometry to show
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
        
    /** set the sun of septopus world, run once at start point
     * @functions
     * 1. create the sunlight and add to scene
     * 2. create directlight as shadow maker and add to the scene
     * @param {object}      scene  - 3D scene
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
    setSunLight: (scene, dom_id) => {
        const player = env.player;
        const [x, y] = player.location.block;
        const side = self.getSide();
        const cvt = self.getConvert();

        //1.set sun
        const sun = ThreeObject.get("light", "sun", { colorSky: 0xffffff, colorGround: 0xeeeeee, intensity: 0.5 });
        sun.position.set(
            x * side[0],
            y * side[1],
            20 * cvt,
        )
        scene.add(sun);

        //2.set directlight to create shadow
        const light = ThreeObject.get("light", "direct", { color: 0xffffff,intensity:0.2 });
        light.position.set(
            x * side[0],
            y * side[1],
            20 * cvt,
        )
        scene.add(light);
    },

    /** set the sky of septopus world, run once at start point
     * @functions
     * 1. create the sky object and add to scene.
     * 2. add frame-loop function to update the sky.
     * @param {object}      scene  - 3D scene
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
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

    /** make the HELPER of special block visualable, in EDIT mode majoyly.
     * @functions
     * 1. get helper array.
     * 2. create stop 3D objects and add to scene
     * @param {object}      scene  - 3D scene
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
    showHelper: (scene, x, y, world, dom_id) => {
        console.log(`Here to show helper on edit mode.`);
    },

    /** make the STOP of special block visualable, in EDIT mode majoyly.
     * @functions
     * 1. get stop array.
     * 2. create stop 3D objects and add to scene
     * @param {object}      scene  - 3D scene
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
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


    //FIXME, player can go out of editing block, this can effect the active block 
    //!important, in edit mode, player can go out the editing block, so the info of editing is isolated.
    /** load the 3D object for EDIT mode
     * @functions
     * 1. load the border 3D objects.
     * 2. load the helper grid.
     * 3. load `stop` and `helper` of the block
     * @param {object}      scene  - 3D scene
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
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

    /** fresh blocks by player status
     * @param {object}      scene  - 3D scene
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
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

    /** fresh target block
     * @functions
     * 1. get all block 3D data and add to scene.
     * 2. fresh animation queue for this block.
     * @param {object}      scene  - 3D scene
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
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
                    const obj=ms[i];
                    if (obj.error) {
                        UI.show("toast", ms[i].error, { type: "error" });
                        continue;
                    }

                    //!important, here to set shadow
                    if(obj.userData && obj.userData.name && obj.userData.name==="block"){
                        obj.receiveShadow=true;   
                    }else{
                        obj.castShadow=true;
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

    /** clean target block data from scene
     * @functions
     * 1. remove meshes in scene.
     * 2. remove animate objects.
     * @param {object}      scene  - 3D scene
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
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
    },

    //3D animation entry
    animate:()=>{
        if(env.animation===null) return false;

        env.animation.frame++;
        for(let key in env.animation.queue){
            //1. run animation function;
            const fn=env.animation.queue[key];
            const n=env.animation.frame;
            fn(env.animation.meshes[key],env.animation.frame);

            //2. check point to remove animation from queue;
            // if(env.animation.checkpoint[n]){

            // }
        }
    },
    structEffects:(world,dom_id)=>{
        if(!env.animation.meshes){
            env.animation.meshes=self.getAnimateMap(world,dom_id);
        }

        const list=self.getAnimateQueue(world,dom_id);
        for(let i=0;i<list.length;i++){
            const row=list[i];
            const key=`${row.x}_${row.y}_${row.adjunct}_${row.index}`;
            if(!env.animation.meshes[key]) continue;            //check meshes is ready
            //console.log(row,env.animation.frame);
            //1. get SDT animation format from adjunct
            if(!VBW[row.adjunct] || !VBW[row.adjunct].hooks || !VBW[row.adjunct].hooks.animate) continue;
            
            //console.log(row);
            const std=VBW[row.adjunct].hooks.animate(row.effect.router,row.effect.param);

            const cat=!std.category?"mesh":std.category;
            const fn=Effects.decode(std,cat);

            //3. attatch to animation queue
            env.animation.queue[key]=fn;
        }
    },
};

const renderer={
    hooks: self.hooks,

    /** struct the renderer env
     * @functions
     * 1. create basic 3D components [ scene, renderer, camera ]
     * 2. cache player status
     * @param   {integer}   width       - container width
     * @param   {integer}   heigth      - container height
     * @param   {string}    dom_id      - container DOM id
     * @param   {object}    [cfg]       - more setting for 3D env.
     * @return  {domElement}       - domElement for 3D renderer.
     * */
    construct: (width, height, dom_id, cfg) => {
        //console.log(cfg);

        //1.prepare 3D objects
        const chain = ["active", "containers", dom_id];
        if (!VBW.cache.exsist(chain)) {

            const cfg_scene={}
            const scene = ThreeObject.get("basic", "scene", cfg_scene);

            const cfg_render={ width: width, height: height,shadow:(cfg.shadow===undefined?false:cfg.shadow)}
            const render = ThreeObject.get("basic", "render", cfg_render);

            const cfg_camera = { width: width, height: height, fov: 50, near: 0.1, far: 1000000 };
            const camera = ThreeObject.get("basic", "camera", cfg_camera);
            camera.rotation.order="ZYX";

            const cfg_status={
                left:"130px",
                top:"20px",
                zindex:44,
            }
            const status = ThreeObject.get("basic", "status", cfg_status);

            VBW.cache.set(chain, { render: render, camera: camera, scene: scene,status:status });
        }

        //2. set env
        if(env.player===null) env.player= VBW.cache.get(["env", "player"]);
        const dt = VBW.cache.get(chain);

        return dt.render.domElement;
    },

    /** 3D renderer entry to fresh scene
     * @functions
     * 1. check wether the first time to run, if so, set the env
     * 2. if parameter `block` is set, reload it as editing block.
     * 3. load DEMO test for 3D objects. [ for debug ]
     * @param   {string}    dom_id      - container DOM id
     * @param   {number[]}  [block]     - block coordinaration,[ x,y,world ]
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
            self.setSunLight(scene, dom_id);        //1.1. set sun light
            self.setSky(scene, dom_id);     //1.1. set cube sky
            self.loadBlocks(scene, dom_id); //1.3.load range of blocks

            //2.set the frame-loop to support animation
            render.setAnimationLoop(VBW.loop);
            UI.show("toast", `Start framework.loop() to support "Frame Synchronization".`);

            //3. add system.launch event to start aniamation
            VBW.event.on("system","launch",(ev)=>{
                //4.1. get raw animation data;
                const world=env.player.location.world;
                env.animation={
                    queue:{},               //animation map, can be removed by key directly
                    checkpoint:{},          //checkpoint to stop animation
                    frame:0,                //frame counter                      
                    start:ev.stamp,         //start point of 3D animation
                };
                console.log("Animation:",env.animation);

                //4.2. construct animation data;
                self.structEffects(world,dom_id);

                //4.3. start the animation by frame-loop way
                const chain = ["block", dom_id, world, "loop"];
                const queue = VBW.cache.get(chain);
                if(!queue.error) queue.push({ name: "three_animation", fun: self.animate});
                        
            },"three_animate");

            //4. demo code to test 3D object
            demo.light(scene, dom_id);
        }

        //2.update target block and fresh scene
        if (block !== undefined) {
            const [x, y, world] = block;
            self.clean(scene, x, y, world, dom_id);
            self.fresh(scene, x, y, world, dom_id);
            self.loadEdit(scene, dom_id);
        }
    },

    /** clean target block data in scene
     * @functions
     * 1. remove meshes in scene.
     * 2. remove animate objects.
     * @param {string}      dom_id  - container DOM id
     * @param {integer}     world   - world index
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @return void
     * */
    clean: (dom_id, world, x, y) => {
        //1. clean scene
        const chain = ["active", "containers", dom_id];
        const data = VBW.cache.get(chain);
        const scene = data.scene;
        self.clean(scene, x, y, world, dom_id);

        //2. clean animation
    },
}

export default renderer;