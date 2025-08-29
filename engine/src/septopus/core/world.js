/**
 * Septopus World Entry
 *
 * group functions here.
 *
 * @fileoverview
 *   1. Start Septopus World from 0.
 *   2. Set to edit module.
 *   3. Modify the block or adjuncts.
 *   4. Load component dynamic in the furture.
 *   5. Exposed events 
 *
 * @author Fuu
 * @date 2025-04-25
 */

import UI from "../io/io_ui";
import actions from "../io/actions";

import VBW from "./framework";

import vbw_sky from "./sky";
import vbw_time from "./time";
import vbw_weather from "./weather";
import vbw_block from "./block";
import vbw_detect from "./detect";
import vbw_player from "./player";
import vbw_movement from "./movement";
import vbw_event from "./event";
import vbw_bag from "./bag";
import API from "../io/api";

import render_3d from "../render/render_3d";
import render_2d from "../render/render_2d";
import render_observe from "../render/render_observe";

import control_fpv from "../control/control_fpv";
import control_2d from "../control/control_2d";
import control_observe from "../control/control_observe";

import adj_wall from "../adjunct/adjunct_wall";
import adj_water from "../adjunct/adjunct_water";

import basic_box from "../adjunct/basic_box";
import basic_module from "../adjunct/basic_module";
import basic_light from "../adjunct/basic_light";
import basic_stop from "../adjunct/basic_stop";
import basic_trigger from "../adjunct/basic_trigger";

import plug_link from "../plugin/plug_link";
import Toolbox from "../lib/toolbox";
import TriggerBuilder from "../lib/builder";

const regs = {
    core: [vbw_detect, vbw_sky, vbw_time, vbw_weather, vbw_block, vbw_player, vbw_movement, vbw_event, vbw_bag, API],
    render: [render_3d, render_2d, render_observe],
    controller: [control_fpv, control_2d, control_observe],
    adjunct: [basic_stop, basic_trigger, basic_light, basic_box, basic_module, adj_wall, adj_water],
    plugin: [plug_link],
};

const config = {
    render: "rd_three",
    controller: "con_first",
    debug: true,
    queue: {
        block: "block_loading",
        resource: "resource_loading",
        trigger: "trigger_runtime",
    },
    hook: {
        register: "reg",
        initialize: "init",
        definition: "def",
    },
    menu: {},
};

const runtime = {
    start: true,         //system start
    counter: {
        block: 0,
        texture: 0,          //texture counter
        module: 0,           //module counter
    },
}

const self = {
    /**
     * world component register management
     * !important, group components here, can load dynamic in the furture.
     * @functions
     * 1. reg all components and init
     * @returns void
     */
    register: () => {
        const regKey = config.hook.register;
        const initKey = config.hook.initialize;
        for (let cat in regs) {
            const coms = regs[cat];
            for (let i = 0; i < coms.length; i++) {
                const component = coms[i];
                if (component.hooks === undefined) continue;

                //1.load Septopus World components to Framework
                if (component.hooks[regKey] !== undefined) {
                    const cfg = component.hooks[regKey]();
                    const result = VBW.component.reg(cfg, component);
                    if (result.error !== undefined) UI.show("toast", result.error, { type: "error" });
                }

                //2.init the parts component
                if (component.hooks[initKey] !== undefined) {
                    const res = component.hooks[initKey]();
                    if (!res || !res.chain || !res.value) {
                        UI.show("toast", `Invalid init data from "${cat}" category component.`, { type: "error" });
                    } else {
                        VBW.cache.set(res.chain, res.value);
                    }
                }
            }
        }
    },

    /**
     * DOM struct function
     * @functions
     * 1. detect device;
     * 2. clean DOM already exsist;
     * 3. create DOM needed;
     * @param {string}  container   - container DOM id
     * @param {object}  cfg         - {shadow:true}
     * @return {boolean}
     */
    struct: (container, cfg) => {
        if (VBW.block === undefined) return UI.show("toast", `No more component.`, { type: "error" });

        //0.device detect
        const dt = VBW.detect.check(container);
        const dev_chain = ["block", container, "basic"];
        VBW.cache.set(dev_chain, dt);

        //1.1.struct dom for render
        const dom_render = VBW[config.render].construct(dt.width, dt.height, container, cfg);

        //1.2.struct dom for controller
        const dom_controller = VBW[config.controller].construct();

        //2.construct the DOM
        const target = document.getElementById(container);

        //FIXME, need to clean all DOM to avoid new screen of system
        //2.1.clean DOM already exsist

        //2.2.add new DOM needed
        target.appendChild(dom_render);
        target.appendChild(dom_controller);

        //2.3.add state DOM
        const status = VBW.cache.get(["active", "containers", container, "status"]);
        target.appendChild(status.dom);

        return true;
    },

    /**
     * Save the data of world and block from Datasource ( API )
     * @functions
     * 1. save world data;
     * 2. save blocks raw data;
     * @param {string}  dom_id  - container DOM id
     * @param {number}  world   - world index
     * @param {object}  map     - blocks map, `${x}_${y}` --> BLOCK_RAW_DATA
     * @param {object}  world_info  - world information object
     * @return {boolean}    - whether saved successful
     */
    save: (dom_id, world, map, world_info) => {

        const fun = VBW.cache.set;
        //1.save the world data;
        if (world_info !== undefined) {
            const w_chain = ["env", "world"];
            if (!VBW.cache.exsist(w_chain)) {
                world_info.index = world;
                const wd = self.formatWorld(world_info);
                fun(w_chain, wd);
            }
        }

        //1.1.set `modified` cache key
        const m_chain = ["task", dom_id, world];
        if (!VBW.cache.exsist(m_chain)) {
            fun(m_chain, []);
        }

        //2.deal with the block raw data
        let failed = false;
        for (let k in map) {
            const chain = ["block", dom_id, world, k, "raw"];
            const res = fun(chain, map[k]);
            if (res !== true && res.error) {
                UI.show("toast", res.error, { type: "error" })
                failed = true;
            } else {

                //set recover data
                const recover_chain = ["block", dom_id, world, k, "recover"];
                const dt = fun(recover_chain, Toolbox.clone(map[k]));
                if (dt !== true && dt.error) {
                    UI.show("toast", dt.error, { type: "error" });
                }
            }
        }
        return failed;
    },

    /**
     * format basic world setting
     * @param {object}   wd     - world setting
     * @return void
     */
    formatWorld: (wd) => {
        wd.side = [
            wd.block.limit[0] * wd.accuracy,
            wd.block.limit[1] * wd.accuracy,
        ];
        return wd;
    },

    /**
     * fetch module data from network
     * @param {integer[]}   arr     - module IDs
     * @param {function}    ck      - callback function
     * @callback
     * @param {integer[]}   failed  - failed IDs
     */
    fetchModules: (arr, ck) => {
        if (!VBW.datasource || !VBW.datasource.module) {
            return { eror: "No datasource method for module loading." };
        }
        const failed = [];
        //1.get data from IPFS
        VBW.datasource.module(arr, (map) => {
            for (let id in map) {
                const row = map[id];
                const chain = ["resource", "module", id];
                if (VBW.cache.exsist(chain)) continue;
                VBW.cache.set(chain, row);
            }
            return ck && ck(failed);
        })
    },

    /**
     * fetch texture data from network
     * @param {integer[]}   arr     - texture IDs
     * @param {function}    ck      - callback function
     * @callback
     * @param {integer[]}   failed  - failed IDs
     */
    fetchTextures: (arr, ck) => {
        if (!VBW.datasource || !VBW.datasource.texture) {
            return { eror: "No datasource method for texture loading." };
        }
        const failed = [];
        VBW.datasource.texture(arr, (map) => {
            for (let id in map) {
                const chain = ["resource", "texture", id];
                VBW.cache.set(chain, map[id]);
            }
            return ck && ck(failed);
        });
    },

    /**
     * fetch texture and module data from network
     * @param {integer[]}   txs     - texture IDs
     * @param {integer[]}   mds     - module IDs
     * @param {function}    ck      - callback function
     * @callback
     * @param {object} failed  - {texture:[],module:[]}, failed IDs
     */
    prefetch: (txs, mds, ck) => {
        const failed = { module: [], texture: [] };
        self.fetchTextures(txs, (tx_failed) => {
            failed.texture = tx_failed;
            self.fetchModules(mds, (md_failed) => {
                failed.module = md_failed;
                return ck && ck(failed);
            });
        });
    },

    /**
     * check wether all data need to load successful
     * @param {integer[]}     txs     - texture IDs
     * @param {integer[]}     mds     - module IDs
     * @return {boolean}
     */
    checkLoaded: (txs, mds) => {
        const exsist = VBW.cache.exsist;
        for (let i = 0; i < txs.length; i++) {
            const id = txs[i];
            const chain = ["resource", "texture", id];
            if (!exsist(chain)) return false;
        }

        for (let i = 0; i < mds.length; i++) {
            const id = mds[i];
            const chain = ["resource", "module", id];
            if (!exsist(chain)) return false;
        }

        return true;
    },

    /**
     * resource queue of on loading
     * @param {object}      pre     - {texture:[],module:[]}, resource IDs for frefetch
     * @param {integer}     x       - block X
     * @param {integer}     y       - block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM ID
     * @return void
     */
    loadingResourceQueue: (pre, x, y, world, dom_id) => {
        //1. set resource queue;
        const name = config.queue.resource;
        const push = VBW.queue.push;
        push(name, {
            x: x,
            y: y,
            world: world,
            container: dom_id,
            preload: pre,
        });

        //2. start to load resource
        self.prefetch(pre.texture, pre.module, (failed) => {

        });
        return true;
    },

    /**
     * block queue of on loading
     * @param {object}      map      - {`${x}_${y}`:BLOCK_HOLDER_RAW_DATA}
     * @param {string}      dom_id   - container DOM ID
     * @return void
     */
    loadingBlockQueue: (map, dom_id) => {
        //{"2023_617":{"x":2023,"y":617,"world":0,"data":[0.2,1,[]],"owner":"DEFAULT_DATA_NO_OWNER","loading":true}}
        const name = config.queue.block;
        const push = VBW.queue.push;
        for (let key in map) {
            push(name, {
                key: key,
                world: map[key].world,
                container: dom_id,
            });
        }
        return true;
    },

    menu:()=>{
        //1.here to add block_out event
        // const player=VBW.cache.get(["env","player"]);
        // const [x,y]=player.location.block;
        // const world=player.location.world;
        // const target = { x: x, y: y, world: world, adjunct: "block", index: 0 };
        // VBW.event.on("block","out",(ev)=>{

        //     VBW.event.on("block","out",(ev)=>{

        //     },target);

        // },target);

        const buttons = actions.buttons;
        const arr = [
                buttons.news,
                buttons.manual,
                buttons.buy,
                buttons.edit,
                buttons.normal,
                buttons.mint,
                buttons.world,
                buttons.stop,
                buttons.start,
                buttons.clean,
            ];
        return arr;
    },

    /**
     * setup the UI of system
     * @return void
     */
    layout: () => {
        //1. expand & close function
        const close = (ev) => {
            UI.show("menu", [], {});
            //expanding=true;

            const el = document.getElementById(cfg.id);
            el.innerHTML=ctx[0];
            el.removeEventListener("click",close);
            el.addEventListener("click",expand);
        }
        const expand = (ev) => {
            const buttons = self.menu();
            const btn_cfg = {
                events:{
                    click:()=>{
                        console.log(`Here to close menu`)
                        close();
                    },
                }
            }
            UI.show("menu", buttons, btn_cfg);

            const el = document.getElementById(cfg.id);
            el.innerHTML=ctx[1];
            el.removeEventListener("click",expand);
            el.addEventListener("click",close);
        }

        //2. show folder
        const ctx = ["Menu ⬇️", "Menu ⬆️"];
        const cfg = {
            id: "menu_folder",
            auto: () => {
                const el = document.getElementById(cfg.id);
                el.addEventListener("click",expand);
                //setInterval(,3000);
            },
        }
        UI.show("fold", ctx, cfg);
    },

    /**
     * subcribe network data update.
     * @function
     * 1. subcribe the block height update.
     * 2. calculate time and weather to update system
     * @return void
     */
    subcribe: () => {
        const target = "height";
        const key = "getSlot"
        API.subcribe(target, key, (data) => {
            VBW.time.calc(data);
            VBW.weather.calc(data);
        });
    },

    /**
     * get trigger functions from adjuncts
     * @return {object}  - {adjunct:{}}, return the functions of adjunct for trigger
     */
    getAdjunctTriggerFuns: () => {
        const map = VBW.component.map();
        const funs = {};
        for (let name in map) {
            if (!isNaN(parseInt(name))) continue;
            if (!VBW[name] || !VBW[name].task) continue;
            funs[name] = VBW[name].task;
        }
        return funs;
    },

    /**
     * setup trigger runtime, definition from network
     * @function
     * 1. set definition of system.
     * 2. set trigger functions. [sysetem,adjunct,player,bag]
     * 3. create trigger runtime queue.
     * @param {object}      def      - trigger definition from network
     * @return void
     */
    setupTrigger: (def) => {
        //console.log(def);
        //1. set trigger definition
        TriggerBuilder.definition(def);
        const adjs = self.getAdjunctTriggerFuns();

        //2. set functions
        //2.1. component task functions
        const funs = [
            {
                ui: UI.task(),
                weather: VBW.weather.task(),
                router: ["ui", "weather"],
            },
            adjs,
            VBW.player.task(),
            VBW.bag.task(),
        ];

        //2.2. VBW system function
        const system = {
            get: VBW.cache,
            push: self.pushRuntime,
        };
        //2.3. set to builder
        TriggerBuilder.set(funs, system);

        //2. create trigger runtime queue
        VBW.queue.init(config.queue.trigger);
    },

    /**
     * world setting run once
     * @function
     * 1. set UI
     * 2. start listener to get data.
     * 3. set contract methods
     * @param {string}      dom_id   - container DOM ID
     * @param {object}      cfg      - {contract:{}}
     * @return void
     */
    runOnce: (dom_id, cfg) => {
        //0.set current active dom_id
        const current_chain = ["active", "current"];
        VBW.cache.set(current_chain, dom_id);

        //0.1. set UI layout
        self.layout();

        //0.2. start listener.
        self.subcribe();

        //0.3. set contract requests.
        if (cfg && cfg.contract && VBW.datasource && VBW.datasource.contract) {
            VBW.datasource.contract.set(cfg.contract);
        }
    },
    /**
     * setup system by basic world setting
     * @function
     * 1. create adjunct map
     * 2. set definition to adjunct, for decoding.
     * 3. set trigger runtime env
     * @param {object}      wd   - basic world setting
     * @return void
     */
    setup: (wd) => {
        //1.create adjunct map;
        if (!wd.adjunct) UI.show("toast", `Adjunct definition missing.`, { type: "error" });
        const map = {}, def = {};
        for (let adj in wd.adjunct) {
            const row = wd.adjunct[adj];
            def[adj] = row.definition;
            if (adj === `common`) continue;
            if (row.short === undefined) continue;

            map[adj] = row.short;
            map[row.short] = adj;
        }
        VBW.cache.set(["map"], map);
        VBW.cache.set(["def"], def);

        //2.save world info
        self.saveWorld(wd);

        //3.set definition to adjunct
        const key = config.hook.definition;
        for (let adj in def) {
            if (adj === `common`) continue;
            //console.log(adj,VBW[adj],);
            if (!VBW[adj] || !VBW[adj].hooks || !VBW[adj].hooks[key]) continue;
            VBW[adj].hooks[key](Toolbox.clone(def[adj]));
        }

        //4.group trigger definition
        self.setupTrigger(def);
    },

    /**
     * initialize the runtime of world, run once
     * @function
     * 1. get the world setting from network
     * 2. format player data and calculat the capacity.
     * 3. start event system of septopus world
     * 4. set the frame-loop functions
     * @param {string}      dom_id  - container DOM ID
     * @param {function}    ck      - callback function
     * @callback 
     * @param {object}      world  - basic world setting
     * @param {integer[]}   limit  - world size limit
     */
    initEnv: (dom_id, ck) => {
        //{"block":[2025,502],"world":0,"position":[7.326341784000396,12.310100473087282,0],"rotation":[0,0.3875731999042833,0],"stop":-1,"extend":2}
        //1. get player location
        VBW.player.start(dom_id, (start) => {
            //console.log(JSON.stringify(start));
            const world = start.world;

            //2. get world setting
            VBW.datasource.world(world, (wd) => {
                //2.1. setup world parameters
                self.setup(wd);
                //console.log(JSON.stringify(VBW.cache.get(["def"])))

                //2.2. format player data and calc capacity
                const local = VBW.player.format(start, wd.data.player);
                VBW.player.initial(local, dom_id);

                //2.3. add listener
                VBW.event.start(world, dom_id);

                //2.4. set checker
                self.setChecker(dom_id, world);
                return ck && ck(world, wd.common.world.range);
            })
        });
    },

    /**
     * save world setting
     * @param {object}    info    - basic world information
     * @return void
     */
    saveWorld: (info) => {
        //1.save the world data;
        if (info !== undefined) {
            const w_chain = ["env", "world"];
            if (!VBW.cache.exsist(w_chain)) {
                const wd = self.formatWorld(info);
                VBW.cache.set(w_chain, wd);
            }
        }
    },

    /**
     * push function to trigger queue.
     * @param {function}    fun         - function need to push
     * @param {integer}     n           - number of frames to run of the function
     * @param {boolean}     onetime     - wether just run onetime.
     * @param {string}      key         - key of trigger function
     * @return void
     */
    pushRuntime: (fun, n, onetime, key) => {
        console.log(key);
        const run = {
            auto: fun,
            left: n,
            onetime: onetime,
            key: key,
        }

        if (onetime) {
            const qu = VBW.queue.get(config.queue.trigger);
            console.log(`Here to check unique call`, qu);
            for (let i = 0; i < qu.length; i++) {
                const row = qu[i];
                if (row.key === run.key) return false;
            }
        }

        VBW.queue.push(config.queue.trigger, run);
    },

    /**
     * Frame-loop function to run trigger.
     * @functions
     * 1.check wether trigger queue.
     * 2.run all functions in trigger queue and remove function from queue.
     * @return void
     */
    runTrigger: () => {
        const queue = VBW.queue.get(config.queue.trigger);
        if (!queue || queue.length === 0) return false;

        for (let i = 0; i < queue.length; i++) {
            const row = queue[i];
            if (row.left < 1) {
                VBW.queue.drop(config.queue.trigger, i);
                i--;
            } else {
                row.left--;
                row.auto(row.left);
            }
        }
    },

    outofRange: (x, y) => {
        const player = VBW.cache.get(["env", "player"]);
        const [px, py] = player.location.block;
        const ext = player.location.extend;
        if (px > x + ext || px < x - ext) return true;
        if (py > y + ext || py < y - ext) return true;
        return false;
    },

    /**
     * Frame-loop function to check blocks loaded status.
     * @functions
     * 1.check wether block data loaded from network.
     * 2.if loaded, construct the block one by one.
     * @return void
     */
    checkBlock: () => {
        //1. get the block loading queue.
        const name = config.queue.block;
        const queue = VBW.queue.get(name);
        if (queue.error || queue.length === 0) return false;

        //2. check the first whether loaded
        const todo = queue[0];
        const world = todo.world, dom_id = todo.container;
        const dt = VBW.cache.get(["block", dom_id, world, todo.key, "raw"]);
        if (dt.error) return false;

        //3. if loaded, deal with the restruct and get the resource list
        if (!dt.loading) {
            //3.1. add the resource to loading queue.
            const arr = todo.key.split("_");
            const x = parseInt(arr[0]), y = parseInt(arr[1]);
            const range = { x: x, y: y, world: world, container: dom_id };
            VBW.load(range, (pre) => {

                //4.after loaded, update system

                //4.1. trigger `block.loaded` event
                //!important, `block.loaded` event trigger 
                const target = {
                    x: x, y: y, world: world, index: 0, adjunct: "block",
                    stamp: Toolbox.stamp(),
                };
                const evt = { x: x, y: y, world: world }
                VBW.event.trigger("block","loaded", evt, target);

                //4.2. loading resource needed.
                self.loadingResourceQueue(pre, x, y, world, dom_id);

                //4.3. set game mode buttons.
                if (pre.game && pre.game.length !== 0) {
                    self.updateGame(pre.game);
                }

                //5. fresh render, need to check wether out of range
                if (!self.outofRange(x, y)) {
                    VBW[config.render].show(dom_id, [x, y, world]);
                }
            }, {});

            queue.shift();      //remove frame-loop task

            //6. check counter 
            runtime.counter.block--;
            if (runtime.counter.block === 0) {
                //!important, `system.done` event trigger 
                VBW.event.trigger("system", "launch", { stamp: Toolbox.stamp() });
            }
        }
    },

    /**
     * Frame-loop function to check resource loaded status.
     * @functions
     * 1.check wether resource loaded from network.
     * 2.if loaded, construct the resource one by one.
     * @return void
     */
    checkResource: () => {
        const name = config.queue.resource;
        const queue = VBW.queue.get(name);
        if (queue.error || queue.length === 0) return false;

        const todo = queue[0];
        const { x, y, world, container, preload } = todo;
        if (self.checkLoaded(preload.texture, preload.module)) {
            //rebuild 3D data then render
            const range = { x: x, y: y, world: world, container: container };
            VBW.load(range, (pre) => {
                VBW[config.render].show(container, [x, y, world]);
            }, {});

            queue.shift();      //remove frame-loop task
        }
    },

    /**
     * set frame loop queue.
     * @param {string}  dom_id  - container DOM ID
     * @param {integer} world   - world index
     * @return void
     */
    setChecker: (dom_id, world) => {
        const chain = ["block", dom_id, world, "loop"];
        const queue = VBW.cache.get(chain);
        queue.push({ name: "block_checker", fun: self.checkBlock });
        queue.push({ name: "resource_checker", fun: self.checkResource });
        queue.push({ name: "trigger_runtime", fun: self.runTrigger });
    },

    /**
     * binding game mode event, in block to trigger
     * @functions
     * @param {string}  dom_id  - container DOM ID
     * @param {integer} x       - block X
     * @param {integer} y       - block Y
     * @param {integer} ext     - block extend amount
     * @param {integer} world   - world index
     * @return void
     */
    updateGame: (games) => {
        for (let i = 0; i < games.length; i++) {
            const { x, y, world, setting } = games[i];
            const target = { x: x, y: y, world: world, adjunct: "block", index: 0 };
            //console.log(JSON.stringify(target));

            //1. get game mode data from chain.
            ((id, world) => {
                VBW.datasource.game(id, (data) => {
                    //console.log(data);
                    const chain = ["resource", "game", `${world}_${id}`];
                    VBW.cache.set(chain, data);
                });
            })(setting, world);


            //2. binding block-in event to trigger mode button  
            VBW.event.on("block", "in", (ev) => {
                //b. show buttons.
                const buttons = actions.buttons;
                const menus = [
                    buttons.detail,
                    buttons.game,
                ];
                UI.show("mode", menus, {});
            }, target);

            VBW.event.on("block", "out", (ev) => {
                UI.show("mode", [], {});
            }, target);
        }

        //3. trigger directly to check game
        const player = VBW.cache.get(["env", "player"]);
        const [x, y] = player.location.block;
        const world = player.location.world;
        const current = { x: x, y: y, world: world, adjunct: "block", index: 0 }
        VBW.event.trigger("block", "in", { stamp: Toolbox.stamp() }, current);
    },

    /**
     * launch blocks, showing holder when loading
     * @functions
     * 1. show holder of block before actual data loaded.
     * 2. preload data and save them.
     * @param {string}  dom_id  - container DOM ID
     * @param {integer} x       - block X
     * @param {integer} y       - block Y
     * @param {integer} ext     - block extend amount
     * @param {integer} world   - world index
     * @param {integer} limit   - world range limit, [4096,4096]   
     * @param {function}    ck      - callback function
     * @param {object}      cfg     - reverse for more setting.
     * @return void
     */
    launch: (dom_id, x, y, ext, world, limit, ck, cfg) => {
        //set launch counter
        if (runtime.start) {
            const n = ext + ext + 1;
            runtime.counter.block = n * n;
        }

        VBW.datasource.view(x, y, ext, world, (map) => {
            if (map.loaded !== undefined) {
                if (!map.loaded) {
                    //1. add loading queue
                    delete map.loaded;
                    self.loadingBlockQueue(map, dom_id);    //showing block holder

                    const failed = self.save(dom_id, world, map);
                    if (failed) return UI.show("toast", `Failed to set cache, internal error, abort.`, { type: "error" });
                    //2. struct holder
                    const range = { x: x, y: y, ext: ext, world: world, container: dom_id };

                    VBW.load(range, (pre) => {
                        //UI.show("toast", `Struct all components, ready to show.`);
                        self.prefetch(pre.texture, pre.module, (failed) => {
                            UI.show("toast", `Fetch texture and module successful.`);
                            runtime.start = false;
                            return ck && ck(true);
                        });

                        //set resource load counter
                        // if(runtime.start){
                        //     runtime.counter.texture=pre.texture.length;
                        //     runtime.counter.module=pre.module.length;
                        // }

                        //3. filter out game mode support
                        //console.log(pre);
                        //self.checkGame(dom_id, x, y, ext, world);
                    }, cfg);
                } else {
                    delete map.loaded;
                    //UI.show("toast", `Load block data successful.`);
                    const failed = self.save(dom_id, world, map);
                    if (failed) return UI.show("toast", `Failed to set cache, internal error, abort.`, { type: "error" });
                }
            }
        }, limit);
    },

    /**
     * set mode automatically.
     * @param {string}  dom_id  - container dom ID
     * @return void
     */
    autoMode: (dom_id) => {
        const player = VBW.cache.get(["env", "player"]);
        const def = VBW.cache.get(["def", "common"]);
        if (!player.address) {
            //no player address, set to GHOST mode
            VBW.mode(def.MODE_GHOST, { container: dom_id }, () => {

            });
        } else {
            //got player address, set to NORMAL mode
            VBW.mode(def.MODE_NORMAL, { container: dom_id }, () => {

            });
        }
    },
}

const World = {
    /**
     * Septopus World system initalization
     * @return {boolean} - whether init successful
     * */
    init: async (cfg) => {
        //1.register all components;
        self.register();

        //!important, `system.init` event trigger 
        VBW.event.trigger("system", "init", { stamp: Toolbox.stamp() });

        UI.show("toast", `Septopus World running env done.`, {});
        //if (config.debug) VBW.cache.dump();   //dump when debug
        return true;
    },

    /**
     * Load block[x,y], for block adjunct request
    */
    load: (dom_id, world, x, y) => {

        const chain = ["block", dom_id, world, `${x}_${y}`];
        if (VBW.cache.exsist(chain)) {
            //1.if loaded before, show single block
            VBW[config.render].show(dom_id, [x, y, world]);

        } else {
            //1.if not loaded, load first
            const ext = 0;
            const limit = VBW.cache.get(["env", "world", "common", "world", "range"]);
            self.launch(dom_id, x, y, ext, world, limit, (done) => {
                VBW[config.render].show(dom_id);
            });
        }
    },

    /**
     * clean the target block[x,y] in render
    */
    unload: (dom_id, world, x, y) => {
        VBW[config.render].clean(dom_id, world, x, y);
    },

    /**
     * Stop render, needed in UI mode
     * @param   {string}    dom_id  - container DOM id
     * @void
     * */
    stop: (dom_id) => {
        const { render } = VBW.cache.get(["active", "containers", dom_id]);
        render.setAnimationLoop(null);

        //!important, `system.stop` event trigger 
        VBW.event.trigger("system", "stop", { stamp: Toolbox.stamp() });
    },

    /**
     * start render, needed in UI mode
     * @param   {string}    dom_id  - container DOM id
     * @void
     * */
    start: (dom_id) => {
        const { render } = VBW.cache.get(["active", "containers", dom_id]);
        render.setAnimationLoop(VBW.loop);

        //!important, `system.stop` event trigger 
        VBW.event.trigger("system", "restart", { stamp: Toolbox.stamp() });
    },

    /**
     * Jump to target block
     * @param   {string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {number}    x       - coordination X
     * @param   {number}    y       - coordination y
     * @param   {function}  ck      - callback function
     * @param   {number[]}  [pos]   - [x,y,z], block position
     * @callback - when jump to target block
     * @param {boolean} result
     * */
    teleport: (dom_id, world, x, y, ck, pos) => {
        console.log(`Now, jump to `, dom_id, world, x, y, pos);
        const player = VBW.cache.get(["env", "player"]);

        //1.launch area
        const limit = [4096, 4096];
        const ext = player.location.extend;
        World.stop(dom_id);
        self.launch(dom_id, x, y, ext, world, limit, (done) => {
            //2. set player position

            VBW.player.teleport(x, y, world, pos);

            //VBW.player.teleport({position:{},rotation:{}});
            World.start(dom_id);
        });
    },

    /**
     * Septopus World entry, start from 0 to start the 3D world
     * @param   {string}    id      - container DOM id
     * @param   {function}  ck      - callback when loaded
     * @param   {object}    [cfg]   - {contract:methods,fullscreen:false,shadow:true}, config setting
     * @return  {boolean}   - whether load successful
     * */
    first: (dom_id, ck, cfg) => {
        if (!self.struct(dom_id, cfg)) return UI.show("toast", `Failed to struct html dom for running.`, { type: "error" });
        if (!VBW.datasource) return UI.show("toast", `No datasource for the next step.`, { type: "error" });
        UI.show("toast", `Start to struct world. Framework:`, VBW);

        self.runOnce(dom_id, cfg);
        self.initEnv(dom_id, (world, limit) => {
            UI.show("toast", `World data load from network successful.`);
            const pos = VBW.cache.get(["env", "player", "location"]);
            const [x, y] = pos.block;
            const ext = !pos.extend ? 1 : pos.extend;

            self.autoMode(dom_id);
            self.launch(dom_id, x, y, ext, world, limit, (done) => {
                VBW[config.controller].start(dom_id);
                VBW[config.render].show(dom_id);
                return ck && ck();
            }, cfg);
        });
    },

    /**
     * set block to edit mode
     * @param   {string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {number}    x       - coordination X
     * @param   {number}    y       - coordination y
     * @param   {function}  ck      - callback function
     * @callback - whether done callback
     * @param {boolean} result
     * */
    edit: (dom_id, world, x, y, ck) => {
        //1.create edit temp data
        const chain = ["block", dom_id, world, "edit"];
        VBW.cache.set(chain, {
            x: x, y: y, world: world,
            border: [],          //threeObject of block border
            //raycast:[],       //threeObjects need to check selection status
            stop: [],            //stop to show
            helper: [],          //helper of all object
            grid: {
                raw: null,       //grid raw parameters,
                line: [],        //
                points: [],      //location points here
            },
            selected: {          //selection information
                adjunct: "",     //selected adjunct
                index: 0,        //selected adjunct index
                face: "",        //selected adjunct face ["x","y","z","-x","-y","-z"]
            },
            objects: {           //objects in scene, easy for cleaning from scene
                stop: null,
                helper: null,
                grid: null,
            }
        });

        //2.create three objects
        const target = { x: x, y: y, world: world, container: dom_id };
        const def = VBW.cache.get(["def", "common"]);
        const mode = def.MODE_EDIT;
        VBW.mode(mode, target, (pre) => {
            if (pre.error) {
                UI.show("toast", pre.error, { type: "error" });
                return ck && ck(false);
            }
            self.prefetch(pre.texture, pre.module, (failed) => {
                VBW[config.render].show(dom_id, [x, y, world]);
                return ck && ck(true);
            });
        });
    },

    /**
     * set block back to normal mode
     * @param   {string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {function}  ck      - callback function
     * @callback - whether done callback
     * @param {boolean} result
     * */
    normal: (dom_id, world, ck) => {
        //0.check edit mode
        const chain = ["block", dom_id, world, "edit"];
        const cur = VBW.cache.get(chain);
        if (cur.error) return ck && ck(cur);

        //1.remove edit data
        const x = cur.x, y = cur.y;
        const target = { x: x, y: y, world: world, container: dom_id }

        const def = VBW.cache.get(["def", "common"]);
        const mode = def.MODE_NORMAL;

        VBW.mode(mode, target, () => {
            VBW[config.render].show(dom_id, [x, y, world]);
        });

        return ck && ck(true);
    },

    /**
     * select single adjunct in a editing block
     * @param   {string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {number}    x       - coordination X
     * @param   {number}    y       - coordination y
     * @param   {string}    name    - selected adjunct name
     * @param   {number}    index   - selected adjunct index
     * @param   {number}    face    - selected adjunct face in ["x","y","z","-x","-y","-z"]
     * @param   {function}  ck      - callback function
     * @callback - whether done callback
     * @param {boolean} result
     * */
    select: (dom_id, world, x, y, name, index, face, ck) => {
        //1. set selected adjunct
        const chain = ["block", dom_id, world, "edit", "selected"];
        const selected = VBW.cache.get(chain);
        selected.adjunct = name;
        selected.index = index;
        selected.face = face;

        //2. fresh 
        const target = { x: x, y: y, world: world, container: dom_id }
        const cfg = { selected: true };
        VBW.mode("edit", target, (pre) => {
            if (pre.error) {
                UI.show("toast", pre.error, { type: "error" });
                return ck && ck(false);
            }
            VBW[config.render].show(dom_id, [x, y, world]);
            return ck && ck(true);
        }, cfg);
    },

    /**
     * excute modify tasks entry
     * @param   {object[]}  tasks   - modify tasks need to do
     * @param   {string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {function}  ck      - callback function
     * @callback - whether done callback
     * @param {boolean} result
     * */
    modify: (tasks, dom_id, world, ck) => {
        const chain = ["block", dom_id, world, "edit"];
        const active = VBW.cache.get(chain);
        const x = active.x, y = active.y;

        const queue = VBW.cache.get(["task", dom_id, world]);
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            task.x = x;
            task.y = y;
            queue.push(task);
        }
        VBW.update(dom_id, world, (done) => {
            VBW.event.trigger("system", "update", { stamp: Toolbox.stamp(), container: dom_id, world: world });
        });

        const target = { x: x, y: y, world: world, container: dom_id }
        VBW.load(target, (pre) => {
            console.log(pre);
            VBW[config.render].show(dom_id, [x, y, world]);
            return ck && ck(true);
        });
    },
}

export default World;