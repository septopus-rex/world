/**
 * Septopus World Framework
 *
 * A core module managing components, resources, and workflows
 * in the Septopus decentralized operating system.
 *
 * @fileoverview
 *   1. Component lifecycle
 *   2. Resource registration and usage control
 *   3. Workflow execution and editing
 *   4. Settings and configuration
 *
 * @author Fuu
 * @date 2025-04-23
 */

import CONFIG from "./config";
import Toolbox from "../lib/toolbox";

const cache = {
    setting:CONFIG
};

const config = {
    keys: [             //keys of cache
        "component",    //component keyname
        "resource",     //module and texture large file
        "queue",        //queue for whole system, keyname
        "block",        //block data keyname
        "map",          //component map keyname,short --> component name
        "env",          //runtime keyname
        "active",       //edit active status keyname
        "task",         //task list keyname
        "modified",     //modified block data keyname
    ],
}

const self = {
    getActive: (dom_id) => {
        const chain = ["active", "containers", dom_id];
        const active = self.cache.get(chain);
        if (active.error !== undefined) return false;
        return active;
    },
    getAnimateQueue: (world, dom_id) => {
        const ani_chain = ["block", dom_id, world, "queue"];
        const ans = self.cache.get(ani_chain);
        return ans;
    },
    getAnimateMap: (world, dom_id) => {
        const ani_chain = ["block", dom_id, world, "animate"];
        const ans = self.cache.get(ani_chain);
        return ans;
    },
    getLoopQueue: (world, dom_id) => {
        const queue_chain = ["block", dom_id, world, "loop"];
        return self.cache.get(queue_chain);
    },
    getNameByShort: (short) => {
        //console.log(cache.map)
        if (cache.map[short] === undefined) return false;
        return cache.map[short];
    },
    getConvert: () => {
        return self.cache.get(["env", "world", "accuracy"]);
    },
    getSide: () => {
        return self.cache.get(["env", "world", "side"]);
    },
    getElevation: (x, y, world, dom_id) => {
        return self.cache.get(["block", dom_id, world, `${x}_${y}`, "elevation"]);
    },
    getRawByName:(name,list)=>{
        //console.log(name,list);
        if(!cache.map[name]) return {error:"Invalid adjunct name"};
        const short=cache.map[name];
        for(let i=0;i<list.length;i++){
            const row=list[i];
            if(row[0]===short) return row[1];
        }
        return {error:"No adjunct raw data."};
    },
    clone: (obj) => {
        return JSON.parse(JSON.stringify(obj));
    },
    component: {
        //component registion
        reg: (cfg, component) => {
            if (!cache.component) return { error: "Framework is not init yet." };
            if (!cfg.name) return { error: "Invalid component register information." };

            cache.component[cfg.name] = cfg;
            //cache.component[cfg.name].func=component;

            //1.attatch to cache,and create map
            if (cfg.short !== undefined) {
                if (cache.map[cfg.short] !== undefined) return { error: `Componet "${cfg.name}" short name conflict with "${cache.map[cfg.short]}", ignore it.` };
                cache.map[cfg.short] = cfg.name;

                if (cache.map[cfg.name] !== undefined) return { error: `Componet "${cfg.name}" short name exsist", ignore it.` };
                cache.map[cfg.name] = cfg.short;
            }

            //2.attatch component functions to root
            if (Framework[cfg.name] !== undefined) return { error: `Invalid name "${cfg.name}" to add to framework.` };
            Framework[cfg.name] = component;

            //3.filter out datasource API
            if(cfg.type==="datasource"){
                Framework.datasource=component;
                cache.env.datasource={
                    pending:false,       //set to `true`, when loading the data from network
                    map:{},              //data need to load
                };
            }

            return true;
        },

        // short --> name relationship
        map: () => {
            return self.clone(cache.map);
        },
    },
    cache: {
        get: (chain, clone) => {
            if (!Array.isArray(chain)) return { error: "Invalid path chain." };
            let tmp = cache;
            for (let i = 0; i < chain.length; i++) {
                if (tmp[chain[i]] === undefined) return { error: "Invalid data" };
                tmp = tmp[chain[i]]
            }
            return !clone ? tmp : self.clone(tmp);
        },
        exsist: (chain) => {
            if (!Array.isArray(chain)) return false;
            let tmp = cache;
            for (let i = 0; i < chain.length; i++) {
                if (tmp[chain[i]] === undefined) return false;
                tmp = tmp[chain[i]]
            }
            return true;
        },
        set: (chain, value) => {
            if (!Array.isArray(chain)) return { error: "Invalid path chain." };
            if (cache[chain[0]] === undefined) return { error: `Invalid root key "${chain[0]}" to set value` };
            Toolbox.extend(chain, value, true, cache);
            return true;
        },
        remove: (chain) => {
            if (!Array.isArray(chain)) return false;
            let tmp = cache;
            for (let i = 0; i < chain.length - 1; i++) {
                if (tmp[chain[i]] === undefined) return false;
                tmp = tmp[chain[i]]
            }
            if (tmp[chain[chain.length - 1]] === undefined) return false;
            delete tmp[chain[chain.length - 1]];
            return true;
        },

        clean: (chain, ignor) => {

        },
        dump: (copy) => {
            if (!copy) return console.log(cache);
            return console.log(self.clone(cache));
        },
    },
    queue: {
        get: (qu) => {
            const chain = ["queue", qu];
            return self.cache.get(chain);
        },
        init: (qu) => {
            const chain = ["queue", qu];
            self.cache.set(chain, []);
        },
        clean: (qu) => {
            const chain = ["queue", qu];
            self.cache.set(chain, []);
        },
        push: (qu, val) => {
            const chain = ["queue", qu];
            if (!self.cache.exsist(chain)) self.queue.init(qu);
            const arr = self.cache.get(chain);
            arr.push(val);
        },
        insert: (qu, val) => {
            const chain = ["queue", qu];
            if (!self.cache.exsist(chain)) self.queue.init(qu);
            const arr = self.cache.get(chain);
            if (!arr.includes(val)) arr.push(val);
        },
        remove: (qu, val) => {
            const chain = ["queue", qu];
            const arr = self.cache.get(chain);
            arr.splice(arr.indexOf(val), 1);
        },

    },
    fresh: () => {
        console.log(`ticktok, fresh system.`);
    },
    
    structCache: () => {
        const keys = config.keys;
        for (let k in keys) {
            const key = keys[k];
            cache[key] = {};
        }
        return true;
    },
    initActive: () => {
        cache.active = {
            world: 0,           // default world
            containers: {},     // dom_id -->  raw data and structed data here
            current: "",        // current active render
            mode:1,             // [1.normal; 2.edit; 3.game; ]
        }
        return true;
    },

    /**
     * construct sinlge block raw data to STD data
     * @param {integer} x       //block X
     * @param {integer} y       //block Y
     * @param {integer} world   //world index
     * @param {string}  dom_id  //container dom ID
     * @returns 
     * void
     * 1.attatch formatted STD data to BLOCK_KEY.std
     * 2.set block parameters, such as elevation
     */
    structSingle: (x, y, world, dom_id) => {
        //1.check wether constructed block;
        const key = `${x}_${y}`;
        const cvt = self.getConvert();
        const std_chain = ["block", dom_id, world, key, "std"];
        // if (self.cache.exsist(std_chain)) return true;

        const raw_chain = ["block", dom_id, world, key, "raw"];
        const bk = self.cache.get(raw_chain);

        const std = {};

        //1.construct block data;
        const side = self.getSide();
        std.block = Framework.block.transform.raw_std(bk.data, cvt, side);

        //1.1.set block elevation;
        const va = std.block[0].z;
        const va_chain = ["block", dom_id, world, key, "elevation"];
        self.cache.set(va_chain, va);

        //2.construct all adjuncts;
        const adjs = bk.data[2];
        for (let i = 0; i < adjs.length; i++) {
            const [short, list] = adjs[i];
            const name = self.getNameByShort(short);
            std[name] = Framework[name].transform.raw_std(list, cvt);
        }
        self.cache.set(std_chain, std);
        return true;
    },

    structRenderData: (x, y, world, dom_id) => {
        //1.get STD map from cache
        const key = `${x}_${y}`;
        const std_chain = ["block", dom_id, world, key, "std"];
        const map = self.cache.get(std_chain);

        const rdata = {};
        const stops=[];
        const preload = {module: [],texture: []};

        //2.filter out special components
        const va = self.getElevation(x, y, world, dom_id);
        for (let name in map) {
            const data = Framework[name].transform.std_3d(map[name], va);
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);
                if (row.stop){
                    const obj=self.clone(row.params);
                    obj.orgin={
                        adjunct:name,
                        index:i,
                        type:row.type,
                    }
                    stops.push(obj);
                }
            }
            rdata[name] = data;
        }
        //3.save stop data;
        //3.1.set THREE data;
        const render_chain = ["block", dom_id, world, key, "three"];
        self.cache.set(render_chain, rdata);

        //3.2.set STOP data
        const stop_chain = ["block", dom_id, world, key, "stop"];
        self.cache.set(stop_chain, stops);

        return preload;
    },
    structEntire: (x, y, ext, world, dom_id, ck, cfg) => {

        //1.construct all blocks data
        //FIXME, get the limit by world not setting.
        const limit = self.cache.get(["setting", "limit"]);
        const fun_single = self.structSingle;
        for (let i = -ext; i < ext + 1; i++) {
            for (let j = -ext; j < ext + 1; j++) {
                const cx = x + i, cy = y + j
                if (cx < 1 || cy < 1) continue;
                if (cx > limit[0] || cy > limit[1]) continue;
                fun_single(cx, cy, world, dom_id);
            }
        }

        //2.construct render data
        const fun_render = self.structRenderData;
        const prefetch = { module: [], texture: [] };
        for (let i = -ext; i < ext + 1; i++) {
            for (let j = -ext; j < ext + 1; j++) {
                const cx = x + i, cy = y + j
                if (cx < 1 || cy < 1) continue;
                if (cx > limit[0] || cy > limit[1]) continue;
                const sub = fun_render(cx, cy, world, dom_id);
                if (sub.module.length !== 0) prefetch.module = prefetch.module.concat(sub.module);
                if (sub.texture.length !== 0) prefetch.texture = prefetch.texture.concat(sub.texture);
            }
        }

        //3.unique module and texture IDs
        prefetch.module = Toolbox.unique(prefetch.module);
        prefetch.texture = Toolbox.unique(prefetch.texture);
        return ck && ck(prefetch);
    },
    toEdit:(x,y,world,dom_id)=>{
        const preload={module:[],texture:[]};

        const raw_chain = ["block", dom_id, world, `${x}_${y}`, "std"];
        const map = self.cache.get(raw_chain);
        if(map.error) return map;
        //console.log(map);

        //0.prepare basic parameters
        const stds = {};
        const cvt = self.getConvert();
        const va = self.getElevation(x, y, world, dom_id);

        //1. block data
        //1.1. filter out module or texture for preload
        const bk=Framework.block.transform.std_active(map.block, va, cvt);
        const edit_chain = ["block", dom_id, world, "edit"];
        const edit=self.cache.get(edit_chain);
        if(bk.helper && bk.helper.length!==0){
            edit.border.length=0;
            for (let i = 0; i < bk.helper.length; i++) {
                const row = bk.helper[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);

                //1.2. attatch border objects
                edit.border.push(row);
            }
        }

        //2.restruct block adjunct, including the active highlight
        for (let name in map) {
            const data = Framework[name].transform.std_active(map[name], va);

            //2.isolate basic component stop
            if(data.stop && data.stop.length!==0){
                console.log(data.stop);
                edit.stop.push(...data.stop);
            }   

            //3.isolate object helper
            if(data.helper && data.helper.length!==0){
                edit.stop.push(...data.helper);
            }
        }

        return preload;
    },
    toSelect:(x,y,world,dom_id)=>{
        const s_chain=["block",dom_id,world,"edit","selected"];
        if(!self.cache.exsist(s_chain)) return ck && ck({error:"No selected adjuct to highlight."});
        const prefetch = { module: [], texture: [] };

        const selected = self.cache.get(s_chain);
        const raw_chain = ["block", dom_id, world, `${x}_${y}`, "std", selected.adjunct, selected.index];
        if(!self.cache.exsist(raw_chain)) return ck && ck({error:"Invalid adjunct to highlight."});
        const obj=self.cache.get(raw_chain);
        if(obj.error) return console.error(`Invalid object to select, ${JSON.stringify(raw_chain)}`);

        const va = self.getElevation(x, y, world, dom_id);
        const act=Framework[selected.adjunct].transform.std_active(obj, va);
        const edit=self.cache.get(["block", dom_id, world, "edit"]);
        if(act.helper && act.helper.length!==0){
            for (let i = 0; i < bk.helper.length; i++) {
                const row = bk.helper[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);

                //1.2. attatch to `helper` key
                edit.helper.push(row);
            }
        }

        //2.create grid raw data, used to create grid helper. Attatch to `grid` key
        edit.grid.raw={
            x:x,
            y:y,
            elevation:va,
            adjunct:{
                x:obj.x,
                y:obj.y,
                z:obj.z
            },
            offset:{
                ox:obj.ox,
                oy:obj.oy,
                oz:obj.oz,
            },
            face:selected.face,
            side:self.getSide(),
        }

        return prefetch;
    },

    //modify task entry. Change the "raw" data then rebuild all data.
    excute:(arr, dom_id, world, ck, failed) => {
        if(failed===undefined) failed=[];
        if (arr.length === 0){
            //before exit, clean all blocks need  fresh.
            const modified_chain = ["modified",dom_id,world];
            const ups = self.cache.get(modified_chain);
            if (!ups.error && !Toolbox.empty(ups)) {
                console.log(`Modified block.`, ups);
            }
            return ck && ck(failed);
        }
        const task = arr.pop();

        //1.block task
        if(task.block!==undefined){
            if(Framework.block.attribute && Framework.block.attribute[task.action]);
            const [x,y]=task.block;
            Framework.block.attribute[task.action](x,y,!task.param?{}:task.param,world,dom_id);
            return self.excute(arr, dom_id, world, ck, failed);
        }
        //console.log(`Not block, ready to adjunct modification.`)

        //2.adjunct task;
        if(!Framework[task.adjunct] ||
            !Framework[task.adjunct].attribute ||
            !Framework[task.adjunct].attribute[task.action]
        ){  
            failed.push({error:`Todo task failed, raw: ${JSON.stringify(task)}`});
            return self.excute(arr, dom_id, world, ck, failed); 
        }
        const fun=Framework[task.adjunct].attribute[task.action];

        //2.1. get raw data of adjunct
        //console.log(`Ready to get adjunct data.`)
        const key=`${task.x}_${task.y}`;
        const d_chain=["block",dom_id,world,key,"raw","data"];
        //console.log(d_chain);
        if(!self.cache.exsist(d_chain)){
            return self.excute(arr, dom_id, world, ck, failed);
        }

        //2.2. backup the old raw data.
        // console.log(`Ready to backup`);
        // const backuped=self.block.attribute.backup(task.x,task.y,{},world,dom_id);
        // if(backuped!==true){
        //     return self.excute(arr, dom_id, world, ck, failed);
        // }

        //2.3. get new raw data
        //console.log(`Ready to get raw`)
        const block_raw=self.cache.get(d_chain);
        const raw_index=2;
        const raw=self.getRawByName(task.adjunct,block_raw[raw_index]);
        //console.log(`Raw data of wall`,raw);
        task.limit!==undefined?fun(task.param,raw,task.limit):fun(task.param,raw);
        

        //3.remove related block
        //self.block.attribute.unload([[task.x,task.y]],world, dom_id);

        //4.save modified block
        const m_chain=["modified",dom_id,world];
        if(!self.cache.exsist(m_chain)) self.cache.set(m_chain,{});
        const md_map=self.cache.get(m_chain);
        md_map[key]=Toolbox.stamp();

        return self.excute(arr, dom_id, world, ck, failed);
    },
}

const Framework = {
    /** 
     * basic init function, run this before any actions.
     * @returns 
     * void
     */
    init: () => {
        self.structCache();
        self.initActive();
        window.requestAnimationFrame(self.fresh);
        return true;
    },

    /** 
     * functions of component
     */
    component: self.component,

    /** 
     * functions of cache
     */
    cache: self.cache,

    /** 
     * functions of queue
     */
    queue: self.queue,

    /** 
     * get setting function
     * @param {key}   string   - config key
     * @returns
     * @return  {object}    - the setting result
     * @return  {boolean}   - false, failed to get the setting
     */
    setting: (key) => {
        if (key === undefined) return cache.setting;
        if (cache.setting[key] === undefined) return false;
        return cache.setting[key];
    },

    /** 
     * struct data entry
     * @param {string}   mode   - rebuild mode, ["edit","init","active"]
     * @param {object}   range  - {x:2051,y:1247,ext:2,world:0,container:"DOM_ID"}
     * @param {object}   cfg    - more setting for rebuild
     * @param {function} ck     - callback function
     * @returns
     * @return void
     */
    load: (range,cfg,ck) => {
        const {x, y, ext,world, container} = range;
        self.structEntire(x, y, ext,world, container,ck,cfg);
    },

    /** 
     * set range mode
     * @param {string}   mode   - block mode, ["edit","normal","game"]
     * @param {object}   target - {x:2051,y:1247,world:0,container:"DOM_ID"}
     * @param {object}   cfg    - more setting for rebuild
     * @param {function} ck     - callback function
     * @returns
     * @return void
     */
    mode:(mode,target,ck,cfg)=>{
        //console.log(mode,target);
        const {x,y,world,container}=target;
        switch (mode) {
            case "normal":
                cache.active.mode=1;
                if(cache.block[container] &&
                    cache.block[container][world] && 
                    cache.block[container][world].edit
                ){
                    delete cache.block[container][world].edit;
                }
                ck && ck();
                break;

            case "edit":
                cache.active.mode=2;
                const pre=self.toEdit(x,y,world,container);
                if(cfg && cfg.selected){
                    const more=self.toSelect(x,y,world,container);
                }
                ck && ck(pre);
                
                break;

            case "game":
                cache.active.mode=3;

                break;
            default:
                break;
        }
    },

    /**
     * force to fresh block data from RAW
     * @param {object}   target     - {x:100,y:200,world:0,container:DOM_ID}, spectial block to prepair
     * @param {function} ck         - callback function
     * @param {object}   [cfg]      - setting for fresh
     * @returns
     * @return void
     */
    prepair:(target,ck,cfg)=>{
        //1.struct data from RAW to STD
        const {x, y,world, container} = target;
        const limit = self.cache.get(["setting", "limit"]);
        self.structSingle(x,y,world,container);

        //2.struct render data, filter out resource IDs
        const prefetch = { module: [], texture: [] };
        const sub = self.structRenderData(x, y, world, container);
        if (sub.module.length !== 0) prefetch.module = prefetch.module.concat(sub.module);
        if (sub.texture.length !== 0) prefetch.texture = prefetch.texture.concat(sub.texture);

        prefetch.module = Toolbox.unique(prefetch.module);
        prefetch.texture = Toolbox.unique(prefetch.texture);
        return ck && ck(prefetch);
    },

    /** 
     * main entry for update, any change then call this function
     * @param {string}  dom_id  - container DOM id
     * @param {number}  world   - world index
     * @returns
     * @callback - wether update successful
     * @param {boolean} - update result
     */
    update: (dom_id, world) => {

        //1.check modify task
        const tasks = self.cache.get(["task", dom_id, world]);
        if (!tasks.error && tasks.length !== 0) {
            //console.log(`Todo list:`, JSON.stringify(tasks));
            self.excute(tasks, dom_id, world, (done) => {

            });
        }
    },

    /** 
     * loop function for setAnimationLoop , then Frame Synchronization
     * @functions
     * 1.animation here
     * 2.frame synchronization queue
     * @returns
     * @return void
     */
    loop: () => {
        //1.get the active scene
        const current_chain = ["active", "current"];
        if (!self.cache.exsist(current_chain)) return false;

        const dom_id = self.cache.get(current_chain);
        const active = self.getActive(dom_id);

        //2.group cache.block.id.world.animate
        const world = self.cache.get(["active", "world"]);

        const ans = self.getAnimateQueue(world, dom_id);
        const map = self.getAnimateMap(world, dom_id);         

        //3.animate here. scene as parameters to functions
        // `x_y_adj_index` --> ThreeObject[]
        for (let i = 0; i < ans.length; i++) {
            const row = ans[i];
            const name = row.adjunct;
            if (!Framework[name] || !Framework[name].hooks || !Framework[name].hooks.animate) continue;
            const key = `${row.x}_${row.y}_${name}_${row.index}`;
            if (map[key] === undefined) continue;

            Framework[name].hooks.animate(map[key]);      //给定threeObject的列表，处理动画效果
        }

        //4.frame synchronization queue
        const list = self.getLoopQueue(world, dom_id);
        if (!list.error) {
            for (let i = 0; i < list.length; i++) {
                if (list[i].fun) list[i].fun();
            }
        }

        //4.fresh scene
        //FIXME, need to fresh all active renders.
        active.render.render(active.scene, active.camera);
    },
}

export default Framework;