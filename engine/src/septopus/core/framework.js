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

import Toolbox from "../lib/toolbox";
import Event from "./event";

const cache = {};       //global cache
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
        "def",          //world and adjunct definition
        "setting",      //system setting
    ],
    common:{
        "INDEX_OF_ELEVATION":0,
        "INDEX_OF_ADJUNCT":2,
        "INDEX_OF_GAME_SETTING":3,
    },
}

const self = {
    getActive: (dom_id) => {
        const chain = ["active", "containers", dom_id];
        const active = self.cache.get(chain);
        if (active.error !== undefined) return false;
        return active;
    },
    // getAnimateQueue: (world, dom_id) => {
    //     const ani_chain = ["block", dom_id, world, "queue"];
    //     const ans = self.cache.get(ani_chain);
    //     return ans;
    // },
    // getAnimateMap: (world, dom_id) => {
    //     const ani_chain = ["block", dom_id, world, "animate"];
    //     const ans = self.cache.get(ani_chain);
    //     return ans;
    // },
    getLoopQueue: (world, dom_id) => {
        const queue_chain = ["block", dom_id, world, "loop"];
        return self.cache.get(queue_chain);
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
        if(!cache.map[name]) return {error:"Invalid adjunct name"};
        const short=cache.map[name];
        for(let i=0;i<list.length;i++){
            const row=list[i];
            if(row[0]===short) return row[1];
        }
        return {error:"No adjunct raw data."};
    },
    getNameByShort: (short) => {
        if (cache.map[short] === undefined) return false;
        return cache.map[short];
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
            containers: {},     // dom_id -->  raw data and structed data here
            current: "",        // current active render
        }
        return true;
    },

    component: {
        //component registion
        reg: (cfg, component) => {
            //console.log(cfg, component);
            if (!cache.component) return { error: "Framework is not init yet." };
            if (!cfg.name) return { error: "Invalid component register information." };

            cache.component[cfg.name] = cfg;

            //1.attatch component functions to root
            if (Framework[cfg.name] !== undefined) return { error: `Invalid name "${cfg.name}" to add to framework.` };
            Framework[cfg.name] = component;

            //2. register events;
            if(cfg.events){
                //console.log(`Component ${cfg.name}`, cfg.events);
                if(cfg.type!=="datasource"){
                    Event.reg(cfg.name,cfg.events);
                }
            }

            //3.filter out datasource API
            if(cfg.type==="datasource"){
                Framework.datasource={};
                for(let k in component){
                    if(typeof component[k] === "function"){
                        Framework.datasource[k]=self.middle(component[k]);
                    }else{
                        Framework.datasource[k]={};
                        for(let kk in component[k]){
                            Framework.datasource[k][kk]=self.middle(component[k][kk]);
                        }
                    }
                }

                cache.env.datasource={
                    pending:false,       //set to `true`, when loading the data from network
                    map:{},              //data need to load
                };
            }

            return true;
        },

        // short --> name relationship
        map: () => {
            return Toolbox.clone(cache.map);
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
            return !clone ? tmp : Toolbox.clone(tmp);
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
            console.log("VBW:",Framework);
            if (!copy) return console.log("Cache:",cache);
            return console.log("Cache:",Toolbox.clone(cache));
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
            return true;
        },
        clean: (qu) => {
            const chain = ["queue", qu];
            self.cache.set(chain, []);
            return true;
        },
        push: (qu, val) => {
            const chain = ["queue", qu];
            if (!self.cache.exsist(chain)) self.queue.init(qu);
            const arr = self.cache.get(chain);
            if(arr.error) return arr;
            arr.push(val);
            return true;
        },
        insert: (qu, val) => {
            const chain = ["queue", qu];
            if (!self.cache.exsist(chain)) self.queue.init(qu);
            const arr = self.cache.get(chain);
            if(arr.error) return arr;
            if (!arr.includes(val)) arr.push(val);
            return true;
        },
        remove: (qu, val) => {
            const chain = ["queue", qu];
            const arr = self.cache.get(chain);
            if(arr.error) return arr;
            const index=arr.indexOf(val);
            if(index<0) return false;
            arr.splice(index, 1);
            return true;
        },
        drop:(qu,index)=>{
            const chain = ["queue", qu];
            const arr = self.cache.get(chain);
            if(arr.error) return arr;
            arr.splice(index, 1);
            return true;
        },
    },

    /**
     * middle controller of datasource
     * @functions
     * 1.stop the request of datasource in game mode
     * @param {function} fun       - datasource API function
     * @return {function}   - new function of datasource
     */
    middle:(fun)=>{
        return ((fun)=>{
            return (...args)=>{
                const dom_id=cache.active.current;
                if(!dom_id || !cache.active.containers[dom_id] || !cache.def.common || !cache.def.common.MODE_GAME) return fun(...args);
                const mode=cache.active.containers[dom_id].mode;
                if(mode!==cache.def.common.MODE_GAME) return fun(...args); 
                console.log("Stop requesting in game mode.");
                return {error:"In game mode, failed to get data from network."}
            }
        })(fun)
    },

    /**
     * construct render data, from STD to `three` (3D data format)
     * @functions
     * 1.attatch formatted THREE data to BLOCK_KEY.three
     * 2.filter out stop
     * 3.filter out trigger
     * @param {integer} x       - block X
     * @param {integer} y       - block Y
     * @param {integer} world   - world index
     * @param {string}  dom_id  - container DOM ID
     * @return void
     */
    structRenderData: (x, y, world, dom_id) => {
        //1.get STD map from cache
        const key = `${x}_${y}`;
        const std_chain = ["block", dom_id, world, key, "std"];
        const map = self.cache.get(std_chain);

        const rdata = {};
        const stops=[];
        const triggers=[];
        const preload = {module: [],texture: []};

        //2.filter out special components
        const va = self.getElevation(x, y, world, dom_id);
        for (let name in map) {
            //2.1 construct standard 3D object;
            const std=map[name];
            const data = Framework[name].transform.std_3d(std, va);
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);
                if (row.stop){
                    const obj=Toolbox.clone(row.params);
                    obj.material=row.stop;
                    obj.orgin={
                        adjunct:name,
                        index:i,
                        type:row.type,
                    }
                    stops.push(obj);
                }
                
                if(name==="trigger"){
                    const tgr=Toolbox.clone(row.params);
                    tgr.material=row.material;
                    tgr.orgin={
                        type:row.type,
                        index:i,
                        adjunct:name,
                    }
                    triggers.push(tgr);
                }
            }
            rdata[name] = data;

            if(name==="trigger"){
                for(let i=0;i<std.length;i++){
                    const single=std[i];
                    if(!single.event || !single.event.type || !single.event.fun) continue;
                    const target={x:x,y:y,world:world,index:i,adjunct:"trigger"}
                    Framework.event.on("trigger",single.event.type,single.event.fun,target);
                }
            }
        }

        //3.save stop data;
        //3.1.set THREE data;
        const render_chain = ["block", dom_id, world, key, "three"];
        self.cache.set(render_chain, rdata);

        //3.2.set STOP data
        const stop_chain = ["block", dom_id, world, key, "stop"];
        self.cache.set(stop_chain, stops);

        //3.3.set TRIGGER data
        const trigger_chain = ["block", dom_id, world, key, "trigger"];
        self.cache.set(trigger_chain, triggers);

        return preload;
    },

    /**
     * construct sinlge block raw data to STD data
     * @functions
     * 1. attatch formatted STD data to BLOCK_KEY.std
     * 2. set block parameters, such as elevation
     * @param {integer} x       - block X
     * @param {integer} y       - block Y
     * @param {integer} world   - world index
     * @param {string}  dom_id  - container DOM ID
     * @return void
     */
    structSingle: (x, y, world, dom_id) => {
        
        //1.check whether constructed block;
        const key = `${x}_${y}`;
        const cvt = self.getConvert();
        const std_chain = ["block", dom_id, world, key, "std"];
        // if (self.cache.exsist(std_chain)) return true;

        const raw_chain = ["block", dom_id, world, key, "raw"];
        const bk = self.cache.get(raw_chain);
        const std = {};

        //1.construct block data;
        const side = self.getSide();
        //console.log(raw_chain);
        //console.log(bk, cvt, side);
        std.block = Framework.block.transform.raw_std(bk.data, cvt, side);

        //1.1.set block elevation;
        const ELEVATION_INDEX = cache.def.block.BLOCK_INDEX_ELEVACATION===undefined?config.common.INDEX_OF_ELEVATION:cache.def.block.BLOCK_INDEX_ELEVACATION;
        const va = std.block[ELEVATION_INDEX].elevation;
        const va_chain = ["block", dom_id, world, key, "elevation"];
        self.cache.set(va_chain, va);

        //2.construct all adjuncts;
        const ADJUNCT_INDEX = cache.def.block.BLOCK_INDEX_ADJUNCTS===undefined?config.common.INDEX_OF_ADJUNCT:cache.def.block.BLOCK_INDEX_ADJUNCTS;
        const adjs = bk.data[ADJUNCT_INDEX];
        for (let i = 0; i < adjs.length; i++) {
            const [short, list] = adjs[i];
            const name = self.getNameByShort(short);
            std[name] = Framework[name].transform.raw_std(list, cvt);
        }
        self.cache.set(std_chain, std);

        //3.cache game setting
        const GAME_INDEX = cache.def.block.BLOCK_INDEX_GAME_SETTING===undefined?config.common.INDEX_OF_GAME_SETTING:cache.def.block.BLOCK_INDEX_GAME_SETTING;
        if(bk.data[GAME_INDEX]!==undefined){
            //console.log(bk);
            return {x:bk.x,y:bk.y,world:world,setting:bk.data[GAME_INDEX]};
        }

        return null;
    },

    /**
     * construct blocks and filter out preload
     * @functions
     * 1. construct blocks of formatted STD data.
     * 2. filter out module and texture for preloading.
     * @param {integer}     x       - center block X
     * @param {integer}     y       - center block Y
     * @param {integer}     ext     - block extend amount from center
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM ID
     * @param {function}    ck      - callback function
     * @param {object}      cfg     - reverse for more setting.
     * @return void
     */
    structEntire: (x, y, ext, world, dom_id, ck, cfg) => {

        const prefetch = { module: [], texture: [],game:[] };

        //1.construct all blocks data
        //FIXME, get the limit by world not setting.
        const limit = self.cache.get(["setting", "limit"]);
        const fun_single = self.structSingle;
        for (let i = - ext; i < ext + 1; i++) {
            for (let j = - ext; j < ext + 1; j++) {
                const cx = x + i, cy = y + j
                if (cx < 1 || cy < 1) continue;
                if (cx > limit[0] || cy > limit[1]) continue;
                const res = fun_single(cx, cy, world, dom_id);
                if(res!== null) prefetch.game.push(res);
            }
        }

        //2.construct render data, && 
        const fun_render = self.structRenderData;
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

    /**
     * set block to edit mode
     * @functions
     * 1. filter out module and texture for preloading.
     * 2. restruct block adjuncts, including the active and hightlight.
     * @param {integer}     x       - center block X
     * @param {integer}     y       - center block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM ID
     * @return void
     */
    toEdit:(x,y,world,dom_id)=>{
        const preload={module:[],texture:[]};

        const raw_chain = ["block", dom_id, world, `${x}_${y}`, "std"];
        const map = self.cache.get(raw_chain);
        if(map.error) return map;

        //0.prepare basic parameters
        const stds = {};
        const cvt = self.getConvert();
        const va = self.getElevation(x, y, world, dom_id);

        //1. block data
        //1.1. filter out module or texture for preload
        const bk=Framework.block.transform.std_border(map.block, va, cvt);
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
            const data = Framework[name].transform.std_active(map[name], va, cvt);

            //2.isolate basic component stop, orginal stop.
            // if(data.stop && data.stop.length!==0){
            //     edit.stop.push(...data.stop);
            // }   

            //3.isolate object helper
            if(data.helper && data.helper.length!==0){
                //edit.stop.push(...data.helper);
            }
        }

        return preload;
    },

    /**
     * set selected adjunct, hightlight and show gtid
     * @functions
     * 1. hightlight selected adjunct.
     * 2. create helper grid.
     * @param {integer}     x       - center block X
     * @param {integer}     y       - center block Y
     * @param {integer}     world   - world index
     * @param {string}      dom_id  - container DOM ID
     * @return void
     */
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
        const cvt = self.getConvert();
        const act=Framework[selected.adjunct].transform.std_active(obj, va, cvt);

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

    /** 
     * modify task entry. Change the "raw" data then rebuild all data.
     * @functions
     * 1. loop to excute tasks of modification.
     * 2. save data for updating.
     * 3. save data for recovering.
     * @param {object[]}    arr     - task array.
     * @param {string}      dom_id  - container DOM id.
     * @param {number}      world   - world index
     * @param {function}    ck      - callback function
     * @param {object[]}    failed  - failed task array.
     * @returns
     * @return {object[]}    - failed task list, should be empty.
     */
    excute:(arr, dom_id, world, ck, failed) => {
        if(failed===undefined) failed=[];
        if (arr.length === 0){
            //before exit, clean all blocks need to fresh.
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
        const key=`${task.x}_${task.y}`;
        const d_chain=["block",dom_id,world,key,"raw","data"];
        if(!self.cache.exsist(d_chain)){
            return self.excute(arr, dom_id, world, ck, failed);
        }

        //2.2. backup the old raw data.
        // const backuped=self.block.attribute.backup(task.x,task.y,{},world,dom_id);
        // if(backuped!==true){
        //     return self.excute(arr, dom_id, world, ck, failed);
        // }

        //2.3. get new raw data
        const block_raw=self.cache.get(d_chain);
        const index=cache.def.INDEX_OF_RAW_ON_CHAIN_DATA;
        const raw=self.getRawByName(task.adjunct,block_raw[index]);
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
     * @return void
     */
    init: () => {
        self.structCache();
        self.initActive();
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
     * set range mode
     * @param {string}   mode   - block mode, ["edit","normal","game"]
     * @param {object}   target - {x:2051,y:1247,world:0,container:"DOM_ID"}
     * @param {function} ck     - callback function
     * @param {object}   cfg    - more setting for rebuild
     * @return void
     */
    mode:(mode,target,ck,cfg)=>{
        const {x,y,world,container}=target;
        const def=cache.def.common;

        switch (mode) {
            case def.MODE_NORMAL:
                cache.active.containers[container].mode=def.MODE_NORMAL;
                if(cache.block[container] &&
                    cache.block[container][world] && 
                    cache.block[container][world].edit
                ){
                    delete cache.block[container][world].edit;
                }

                //TODO,here to check wether back to normal from game mode
                //recover all trigger 

                ck && ck();
                break;

            case def.MODE_EDIT:
                //cache.active.mode=def.MODE_EDIT;
                cache.active.containers[container].mode=def.MODE_EDIT;
                const pre=self.toEdit(x,y,world,container);
                if(cfg && cfg.selected){
                    const more=self.toSelect(x,y,world,container);

                }
                ck && ck(pre);
                
                break;

            case def.MODE_GAME:
                //cache.active.mode=def.MODE_GAME;
                cache.active.containers[container].mode=def.MODE_GAME;

                break;

            case def.MODE_GHOST:
                //cache.active.mode=def.MODE_GHOST;
                if(!cache.active.containers[container].mode)
                cache.active.containers[container].mode=def.MODE_GHOST;

                break;
            default:
                break;
        }
    },

    /** 
     * struct data entry
     * @param {object}   range  - {x:2051,y:1247,ext:2,world:0,container:"DOM_ID"}
     * @param {object}   cfg    - more setting for rebuild
     * @param {function} ck     - callback function
     * @return void
     */
    load: (range,ck,cfg) => {
        const {x, y, world, container} = range;
        const ext=!range.ext?0:range.ext;
        self.structEntire(x, y, ext,world, container,ck,cfg);
    },

    /** 
     * main entry for update, any change then call this function
     * @param {string}  dom_id  - container DOM id
     * @param {number}  world   - world index
     * @param {function} ck     - callback function
     * @returns
     * @callback - whether update successful
     * @param {boolean} - update result
     */
    update: (dom_id, world, ck) => {

        //1.check modify task
        const tasks = self.cache.get(["task", dom_id, world]);
        if (!tasks.error && tasks.length !== 0) {
            //console.log(`Todo list:`, JSON.stringify(tasks));
            self.excute(tasks, dom_id, world, (done) => {
                return ck && ck(done);
            });
        }
    },

    /** 
     * loop function for setAnimationLoop , then Frame Synchronization
     * @functions
     * 1.animation here
     * 2.frame synchronization queue
     * @return void
     */
    loop: (ev) => {

        //1.get the active scene
        const current_chain = ["active", "current"];
        if (!self.cache.exsist(current_chain)) return false;

        const dom_id = self.cache.get(current_chain);
        const active = self.getActive(dom_id);
        const world = self.cache.get(["env","player","location","world"]);

        //2.group cache.block.id.world.animate
        //TODO, need to think about this carefully, how to get default world.
        
                 

        //3.animate here. scene as parameters to functions
        //const ans = self.getAnimateQueue(world, dom_id);
        //const map = self.getAnimateMap(world, dom_id);
        // `x_y_adj_index` --> ThreeObject[]
        // for (let i = 0; i < ans.length; i++) {
        //     const row = ans[i];
        //     const name = row.adjunct;
        //     if (!Framework[name] || !Framework[name].hooks || !Framework[name].hooks.animate) continue;
        //     const key = `${row.x}_${row.y}_${name}_${row.index}`;
        //     if (map[key] === undefined) continue;
        //     const effects = Framework[name].hooks.animate(map[key],row);
        // }
        if(Framework.rd_three.animate) Framework.rd_three.animate(world,dom_id);

        //4.frame synchronization queue
        const list = self.getLoopQueue(world, dom_id);
        if (!list.error) {
            for (let i = 0; i < list.length; i++) {
                if (list[i].fun) list[i].fun();
            }
        }

        //5.fresh scene
        active.render.render(active.scene, active.camera);
        active.status.update();
    },
}

export default Framework;