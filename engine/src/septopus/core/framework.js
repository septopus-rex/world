/* 
*  Septopu World Framework
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.resource control
*  2.running workflow
*  3.setting manage
*  4.edit workflow
*/

import Toolbox from "../lib/toolbox";
import CONFIG from "./config";

const cache = { setting: CONFIG };

const config = {
    keys: [
        "component",    //挂载所有注册组件的信息
        "resource",     //module和texture等大型资源挂载位置
        "queue",        //通用的队列方法
        "block",        //原始数据挂载点
        "map",          //short --> name
        "env",          //整体运行环境
        "active",       //编辑的活跃状态
        "task",         //编辑的待处理列表
        "modified",     //编辑后待保存的内容
    ],
    workflow: [
        "update",       //修改数据，处理todo的部分
        "struct",       //struct，重新构建数据，根据todo的结果来处理
        "render"        //渲染数据，调用对应渲染器来实现
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
        console.log(name,list);
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
        //注册组件
        reg: (cfg, component) => {
            if (!cache.component) return { error: "Framework is not init yet." };
            if (!cfg.name) return { error: "Invalid component register information." };

            cache.component[cfg.name] = cfg;
            //cache.component[cfg.name].func=component;

            //1.全部加载到cache下,生成map
            if (cfg.short !== undefined) {
                if (cache.map[cfg.short] !== undefined) return { error: `Componet "${cfg.name}" short name conflict with "${cache.map[cfg.short]}", ignore it.` };
                cache.map[cfg.short] = cfg.name;

                if (cache.map[cfg.name] !== undefined) return { error: `Componet "${cfg.name}" short name exsist", ignore it.` };
                cache.map[cfg.name] = cfg.short;
            }

            //2.挂载组件的方法
            if (Framework[cfg.name] !== undefined) return { error: `Invalid name "${cfg.name}" to add to framework.` };
            Framework[cfg.name] = component;
            return true;
        },

        // short --> name 的映射关系
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

        //清理掉除ignore（string[]类型）之外的数据
        clean: (chain, ignor) => {

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
    },
    initWorkflow: () => {
        cache.workflow = {
            modified: false,
            todo: [],
            block: [0, 0],
        }
    },
    initActive: () => {
        cache.active = {
            world: 0,
            block: [2025, 423],   //默认启动的block
            containers: {},      //3D实例挂载的地方
            current: "",         //当前活动的主窗口实例
        }
    },
    

    //TODO,需要处理好time和weather的关系
    structSky: (world, dom_id) => {
        console.log(`Here to struct sky by weather and time`);
        const sky_chain = ["block", dom_id, world, "sky"];
        const sky = { desc: "Already run Framework self.structSky, but no real three object yet" };
        self.cache.set(sky_chain, sky);
    },

    structSingle: (x, y, world, dom_id) => {
        //1.检测数据是否已经处理了, 更新都是单块数据更新的
        const key = `${x}_${y}`;
        const cvt = self.getConvert();
        const std_chain = ["block", dom_id, world, key, "std"];
        if (self.cache.exsist(std_chain)) return true;

        const raw_chain = ["block", dom_id, world, key, "raw"];
        const bk = self.cache.get(raw_chain);

        const std = {};
        //1.构建block的数据;
        const side = self.getSide();
        std.block = Framework.block.transform.raw_std(bk.data, cvt, side);

        //1.1.设置elevation高度
        const va = std.block[0].z;
        const va_chain = ["block", dom_id, world, key, "elevation"];
        self.cache.set(va_chain, va);

        //2.构建所有的组件
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
        const key = `${x}_${y}`;
        const std_chain = ["block", dom_id, world, key, "std"];
        const map = self.cache.get(std_chain);

        const rdata = {};
        const preload = { module: [], texture: [] };

        const va = self.getElevation(x, y, world, dom_id);
        for (let name in map) {
            const data = Framework[name].transform.std_3d(map[name], va);
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);
            }
            rdata[name] = data;
        }

        const render_chain = ["block", dom_id, world, key, "three"];
        self.cache.set(render_chain, rdata);
        return preload;
    },
    
    editBlock:(x,y,world,dom_id)=>{
        const preload={module:[],texture:[]};

        const raw_chain = ["block", dom_id, world, `${x}_${y}`, "std"];
        const map = self.cache.get(raw_chain);
        //console.log(map);

        //0.准备基础的参数
        const stds = {};
        const cvt = self.getConvert();
        const va = self.getElevation(x, y, world, dom_id);

        //1. block部分的数据
        //1.1. 拆分出模型和材质
        const bk=Framework.block.transform.std_active(map.block, va, cvt);
        const edit_chain = ["block", dom_id, world, "edit"];
        const edit=self.cache.get(edit_chain);
        if(bk.helper && bk.helper.length!==0){
            for (let i = 0; i < bk.helper.length; i++) {
                const row = bk.helper[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);

                //1.2. 挂载到对应
                edit.border.push(row);
            }
        }

        //2.构建block上的adjunct数据;
        for (let name in map) {
            const data = Framework[name].transform.std_active(map[name], va);

            //2.构建stop的数据
            if(data.stop && data.stop.length!==0){

            }

            //3.构建helper的数据(灯光等);
            if(data.helper && data.helper.length!==0){
                
            }
        }

        return preload;
    },
    structEntire: (x, y, ext, world, dom_id, cfg, ck) => {
        //1.处理编辑的内容，删除修改过的block的数据
        const modified_chain = ["cache", "task", world];
        const ups = self.cache.get(modified_chain);
        if (!ups.error && !Toolbox.empty(ups)) {
            console.log(`Modified block.`, ups);
            self.cleanBlocks(ups, world, dom_id);
        }

        //2.构建sky,根据weather和time
        self.structSky(world, dom_id);

        //3.构建所有的block上的数据
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

        //4.构建渲染器需要的数据
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

        //5.去重module和texture的id
        prefetch.module = Toolbox.unique(prefetch.module);
        prefetch.texture = Toolbox.unique(prefetch.texture);
        return ck && ck(prefetch);
    },
    structEdit: (x, y, ext, world, dom_id, cfg, ck) => {
        //1.处理不需要的block
        if(cfg && cfg.force){
            console.log(`Force to clean blocks here`);
        }
        
        //2.构建渲染器需要的数据
        const limit = self.cache.get(["setting", "limit"]);
        const fun_render = self.editBlock;
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

        //3.去重module和texture的id
        prefetch.module = Toolbox.unique(prefetch.module);
        prefetch.texture = Toolbox.unique(prefetch.texture);
        
        return ck && ck(prefetch);
    },

    structActive:(x, y, ext, world, dom_id, cfg, ck)=>{
        const s_chain=["block",dom_id,world,"edit","selected"];
        if(!self.cache.exsist(s_chain)) return ck && ck({error:"No selected adjuct to highlight."});

        const prefetch = { module: [], texture: [] };

        //1.调用std_active方法，计算组件需要显示的部分
        const selected = self.cache.get(s_chain);
        const raw_chain = ["block", dom_id, world, `${x}_${y}`, "std", selected.adjunct, selected.index];
        if(!self.cache.exsist(raw_chain)) return ck && ck({error:"Invalid adjunct to highlight."});
        const obj=self.cache.get(raw_chain);
        
        const va = self.getElevation(x, y, world, dom_id);
        const act=Framework[selected.adjunct].transform.std_active(obj, va);
        const edit=self.cache.get(["block", dom_id, world, "edit"]);
        if(act.helper && act.helper.length!==0){
            for (let i = 0; i < bk.helper.length; i++) {
                const row = bk.helper[i];
                if (row.material && row.material.texture) preload.texture.push(row.material.texture);
                if (row.module) preload.module.push(row.module);

                //1.2. 挂载到对应位置
                edit.helper.push(row);
            }
        }
        
        //2.create grid raw data
        edit.grid.raw={
            x:x,
            y:y,
            elevation:va,
            size:{
                x:obj.x,
                y:obj.y,
                z:obj.z},
            offset:{
                ox:obj.ox,
                oy:obj.oy,
                oz:obj.oz,
            },
            face:selected.face,
            side:self.getSide(),
        }

        return ck && ck(prefetch);
    },
    cleanBlocks: (arr, world, dom_id) => {
        const chain_std=["block",dom_id,world];
        const bks=self.cache.get(chain_std);
        for (let i = 0; i < arr.length; i++) {
            const row = arr[i];
            const key = `${row[0]}_${row[1]}`;
            console.log(`Clean block: ${key}`);
            delete bks[key];
        }
        return true;
    },

    backupBlock:(x,y,world,dom_id)=>{
        const key=`${x}_${y}`;   
        const chain=["modified",dom_id,world,key];
        if(!self.cache.exsist(chain)) self.cache.set(chain,{final:null,backup:null});
        const backup_data=self.cache.get(["block",dom_id,world,key,"raw"]);
        if(!backup_data || backup_data.error) return {error:`No [ ${x}, ${y} ] raw data to backup`};

        const backup=self.clone(backup_data);
        chain.push("backup");
        self.cache.set(chain,backup);
        return true;
    },

    //修改的入口，通过这里对raw数据进行修改，并标识是否要进行重构
    excute:(arr, dom_id, world, ck, failed) => {
        if(failed===undefined) failed=[];
        if (arr.length === 0) return ck && ck(failed);
        const task = arr.pop();
        console.log(JSON.stringify(task));

        //1.block task
        if(task.adjunct==="block" && task.act==="remove"){
            //1.1. remove function is special, need to isolate it.
            const bks=[]
            bks.push([task.param.x,task.param.y]);
            self.cleanBlocks(bks,world, dom_id);

            return self.excute(arr, dom_id, world, ck, failed);
        }

        //2.adjunct task;
        if(!Framework[task.adjunct] ||
            !Framework[task.adjunct].attribute ||
            !Framework[task.adjunct].attribute[task.act]
        ){  
            failed.push({error:`Todo task failed, raw: ${JSON.stringify(task)}`});
            return self.excute(arr, dom_id, world, ck, failed); 
        }
        const fun=Framework[task.adjunct].attribute[task.act];

        //2.1. get raw data of adjunct
        const key=`${task.x}_${task.y}`;
        const d_chain=["block",dom_id,world,key,"raw","data"];
        if(!self.cache.exsist(d_chain)){
            return self.excute(arr, dom_id, world, ck, failed);
        }

        //2.2. backup the old raw data.
        const backuped=self.backupBlock(task.x,task.y,world,dom_id);
        if(backuped!==true){

            return self.excute(arr, dom_id, world, ck, failed);
        }

        //2.3. get new raw data
        const block_raw=self.cache.get(d_chain);
        //console.log(block_raw);
        if(task.adjunct==="block"){

        }else{
            const raw_index=2;
            const raw=self.getRawByName(task.adjunct,block_raw[raw_index]);
            task.limit!==undefined?fun(task.param,raw,task.limit):fun(task.param,raw);
            //console.log(`New Data:`,raw);
            //block_raw[raw_index]=new_raw;
        }
        

        //3.remove related block
        self.cleanBlocks([[task.x,task.y]],world, dom_id);

        //4.save modified block
        const m_chain=["modified",dom_id,world];
        if(!self.cache.exsist(m_chain)) self.cache.set(m_chain,{});

        const mlist=self.cache.get(m_chain);

        return self.excute(arr, dom_id, world, ck, failed);
    },
    
}

//构建数据的不同模式
const worker = {
    edit: self.structEdit,          //构建edit需要的数据
    init: self.structEntire,        //构建完整的场景
    active:self.structActive,       //构建3D中active需要的部分
}

const Framework = {
    //basic init function, run this before any actions.
    init: () => {
        self.structCache();
        self.initWorkflow();
        self.initActive();
        window.requestAnimationFrame(self.fresh)
    },
    //挂载组件的处理方法
    component: self.component,
    cache: self.cache,
    queue: self.queue,
    setting: (k) => {
        if (k === undefined) return cache.setting;
        if (cache.setting[k] === undefined) return false;
        return cache.setting[k];
    },
    dump: (copy) => {
        if (!copy) return console.log(cache);
        return console.log(self.clone(cache));
    },

    struct: (mode,range,cfg,ck) => {
        const {x, y, ext,world, container} = range;
        if(worker[mode]===undefined) return ck && ck({error:"Invalid struct mode"});
        worker[mode](x, y, ext,world, container,cfg,ck);
    },

    //main entry for update, any change then call this function
    update: (dom_id, world) => {

        //1.处理todo的内容
        const tasks = self.cache.get(["task", dom_id, world]);
        if (!tasks.error && tasks.length !== 0) {
            console.log(`Todo list:`, tasks);
            self.excute(tasks, dom_id, world, (done) => {
                
                //self.structEntire();
            });
        }
    },

    loop: () => {
        //console.log(`Here to animate and update all action.`);
        //1.获取到对应的scene
        const current_chain = ["active", "current"];
        if (!self.cache.exsist(current_chain)) return false;

        const dom_id = self.cache.get(current_chain);
        const active = self.getActive(dom_id);

        //2.整理 cache.block.id.world.animate 下的数据，进行分类
        const world = self.cache.get(["active", "world"]);

        const ans = self.getAnimateQueue(world, dom_id);
        const map = self.getAnimateMap(world, dom_id);         

        //3.运行对应的animate方法，把scene当作参数传入
        // `x_y_adj_index` --> ThreeObject[]
        for (let i = 0; i < ans.length; i++) {
            const row = ans[i];
            const name = row.adjunct;
            if (!Framework[name] || !Framework[name].hooks || !Framework[name].hooks.animate) continue;
            const key = `${row.x}_${row.y}_${name}_${row.index}`;
            if (map[key] === undefined) continue;

            Framework[name].hooks.animate(map[key]);      //给定threeObject的列表，处理动画效果
        }

        //4.帧同步的队列执行
        const list = self.getLoopQueue(world, dom_id);
        if (!list.error) {
            for (let i = 0; i < list.length; i++) {
                if (list[i].fun) list[i].fun();
            }
        }

        //4.刷新场景
        //FIXME,这里以后要处理成调用指定的渲染器里的方法
        active.render.render(active.scene, active.camera);
    },
}

export default Framework;