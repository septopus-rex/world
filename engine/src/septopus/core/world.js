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
import CONFIG from "./config";

import VBW  from "./framework";

import vbw_sky from "./sky";
import vbw_time from "./time";
import vbw_weather from "./weather";
import vbw_block from "./block";
import vbw_detect from "./detect";
import vbw_player from "./player";
import vbw_movement from "./movement";
import vbw_event from "./event";
import API from "../io/api";

import render_3d from "../render/render_3d";
import render_2d from "../render/render_2d";
import render_observe from "../render/render_observe";

import control_fpv from "../control/control_fpv";
import control_2d from "../control/control_2d";
import control_mobile from "../control/control_mobile";
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

const regs={
    core:[
        vbw_detect,
        vbw_sky,
        vbw_time,
        vbw_weather,
        vbw_block,
        vbw_player,
        vbw_movement,
        vbw_event,
        API,
    ],
    render:[
        render_3d,
        render_2d,
        render_observe,
    ],
    controller:[
        control_fpv,
        control_mobile,
        control_2d,
        control_observe,
    ],
    adjunct:[
        basic_stop,
        basic_trigger,
        basic_light,
        basic_box,
        basic_module,
        adj_wall,
        adj_water,
    ],
    plugin:[plug_link],
    
};

const def={
    event:{
        ticktock:{
            desc:"Interval to calc time for VBW, blockchain height normally.",
            params:[],
        },
        update:{
            desc:"Block data updated, link to contract event normally",
            params:[],
        },
    },
    agent:{
        onWeatherChange:{

        },
    }
}

const config={
    render:"rd_three",
    controller:"con_first",
    debug:true,
    queue:{
        block:"block_loading",
        resource:"resource_loading",
    }
};

const self={
    /**
     * world component register management
     * !important, group components here, can load dynamic in the furture.
     * @functions
     * 1. reg all components and init
     * @returns void
     */
    register:()=>{
        const regKey=CONFIG.hooks.register;
        const initKey=CONFIG.hooks.initialize;
        //console.log(regs);
        for(let cat in regs){
            const coms=regs[cat];
            for(let i=0;i<coms.length;i++){
                const component=coms[i];
                if(component.hooks===undefined) continue;

                //1.load Septopus World components to Framework
                if(component.hooks[regKey]!==undefined){
                    const cfg=component.hooks[regKey]();
                    const result=VBW.component.reg(cfg,component);
                    if(result.error!==undefined) UI.show("toast",result.error,{type:"error"});
                }

                //2.init the parts component
                //console.log(cat);
                if(component.hooks[initKey]!==undefined){
                    const res=component.hooks[initKey]();
                    if(!res || !res.chain || !res.value){
                        UI.show("toast",`Invalid init data from "${cat}" category component.`,{type:"error"});
                    }else{
                        VBW.cache.set(res.chain,res.value);
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
     * @param {string}  container - container DOM id
     * @return {boolean}
     */
    struct:(container)=>{
        if(VBW.block===undefined) return UI.show("toast",`No more component.`,{type:"error"});

        //0.device detect
        const dt=VBW.detect.check(container);
        const dev_chain=["block",container,"basic"];
        VBW.cache.set(dev_chain,dt);

        //1.1.struct dom for render
        const dom_render=VBW[config.render].construct(dt.width,dt.height,container);

        //1.2.struct dom for controller
        const dom_controller=VBW[config.controller].construct();

        //2.construct the DOM
        const target=document.getElementById(container);

        //FIXME, need to clean all DOM to avoid new screen of system
        //2.1.clean DOM already exsist
        
        //2.2.add new DOM needed
        target.appendChild(dom_render);
        target.appendChild(dom_controller);

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
     * @return {boolean}    - wether saved successful
     */
    save:(dom_id,world,map,world_info)=>{
        const fun=VBW.cache.set;

        //1.save the world data;
        if(world_info!==undefined){
            const w_chain=["env","world"];
            if(!VBW.cache.exsist(w_chain)){
                world_info.index=world;
                const wd=self.formatWorld(world_info);
                fun(w_chain,wd);        
            }
        }
        
        //1.1.set `modified` cache key
        const m_chain=["task",dom_id,world];
        if(!VBW.cache.exsist(m_chain)){
            fun(m_chain,[]);
        }
        
        //2.deal withe the block raw data
        let failed=false;
        for(let k in map){
            const chain=["block",dom_id,world,k,"raw"];
            const res=fun(chain,map[k]);
            if(res!==true && res.error){
                UI.show("toast",res.error,{type:"error"})
                failed=true;
            }else{

                //set recover data
                const recover_chain=["block",dom_id,world,k,"recover"];
                const dt=fun(recover_chain,Toolbox.clone(map[k]));
                if(dt!==true && dt.error){
                    UI.show("toast",dt.error,{type:"error"});
                }
            }
        }
        return failed;
    },

    formatWorld:(wd)=>{
        console.log("format world....",JSON.stringify(wd.side));
        wd.side=[
            wd.side[0]*wd.accuracy,
            wd.side[1]*wd.accuracy,
        ];
        return wd;
    },
    getConvert:()=>{
        return VBW.cache.get(["env","world","accuracy"]);
    },
    getSide:()=>{
        return VBW.cache.get(["env","world","side"]);
    },

    syncPlayer:(user,id)=>{
        //1.set location of player;
        VBW.cache.set(["env","player","location"],user);
        //2.set camera as player view.
        const cam_chain=["active","containers",id,"camera"];
        const cam =  VBW.cache.get(cam_chain);
        const side = self.getSide();
        const cvt = self.getConvert();
        const pos=[
            cam.position.x+(user.block[0]-1)*side[0]+user.position[0]*cvt,
            cam.position.y+(user.block[1]-1)*side[1]+user.position[1]*cvt,
            user.position[2]*cvt
        ]
        cam.position.set(pos[0],pos[2],-pos[1]);
        cam.rotation.set(...user.rotation);
    },

    fetchModules:(arr,ck)=>{
        if(!VBW.datasource || !VBW.datasource.module){
            return {eror:"No datasource method for module loading."};
        } 
        const failed=[];
        //1.get data from IPFS
        VBW.datasource.module(arr,(map)=>{
            for(let id in map){
                const chain=["resource","module",id];
                VBW.cache.set(chain,map[id]);
            }

            return ck && ck(failed);
        })
        
    },
    fetchTextures:(arr,ck)=>{
        if(!VBW.datasource || !VBW.datasource.texture){
            return {eror:"No datasource method for texture loading."};
        } 
        const failed=[];
        VBW.datasource.texture(arr,(map)=>{
            for(let id in map){
                const chain=["resource","texture",id];
                VBW.cache.set(chain,map[id]);
            }
            return ck && ck(failed);
        });
    },
    prefetch:(txs,mds,ck)=>{
        const failed={module:[],texture:[]};
        self.fetchTextures(txs,(tx_failed)=>{
            failed.texture=tx_failed;
            self.fetchModules(mds,(md_failed)=>{
                failed.module=md_failed;
                return ck && ck(failed);
            });
        });
    },

    checkBlock:()=>{
        //1. get the block loading queue.
        const name=config.queue.block;
        const queue=VBW.queue.get(name);
        if(queue.error) return false;
        if(queue.length===0) return false;

        //2. check the first wether loaded
        const todo=queue[0];
        //console.log(JSON.stringify(todo));
        const world=todo.world;
        const dom_id=todo.container;
        const chain=["block",dom_id,world,todo.key,"raw"];
        const dt=VBW.cache.get(chain);
        if(dt.error) return false;

        //3. if loaded, deal with the restruct and get the resource list
        if(!dt.loading){
            //console.log(`Restruct the whole system here.`);

            //3.1. add the resource to loading queue.
            const arr=todo.key.split("_");
            const x=parseInt(arr[0]),y=parseInt(arr[1]);
            const range={x:x,y:y,world:world,container:dom_id};
            VBW.prepair(range,(pre)=>{
                self.loadingResourceQueue(pre,x,y,world,dom_id);
                VBW[config.render].show(dom_id,[x,y,world]);
            },{});
            queue.shift();
        }
    },
    
    checkResource:()=>{
        const name=config.queue.resource;
        const queue=VBW.queue.get(name);
        if(queue.error) return false;
        if(queue.length===0) return false;

        const todo=queue[0];
        const {x,y,world,container,preload}=todo;
        if(self.checkLoaded(preload.texture,preload.module)){
            //console.log(`---- Rerender [ ${x}, ${y} ]`);
            queue.shift();

            //rebuild 3D data then render
            const range={x:x,y:y,world:world,container:container};
            VBW.prepair(range,(pre)=>{
                VBW[config.render].show(container,[x,y,world]);
            },{});
        }
    },

    checkLoaded:(txs,mds)=>{
        const exsist=VBW.cache.exsist;
        for(let i=0;i<txs.length;i++){
            const id=txs[i];
            const chain=["resource","texture",id];
            if(!exsist(chain)) return false;
        }

        for(let i=0;i<mds.length;i++){
            const id=mds[i];
            const chain=["resource","module",id];
            if(!exsist(chain)) return false;
        }

        return true;
    },
    loadingResourceQueue:(pre,x,y,world,dom_id)=>{
        //1. set resource queue;
        const name=config.queue.resource;
        const push=VBW.queue.push;
        push(name,{
            x:x,
            y:y,
            world:world,
            container:dom_id,
            preload:pre,
        });

        //2. start to load resource
        self.prefetch(pre.texture,pre.module,(failed)=>{

        });
        return true;
    },
    loadingBlockQueue:(map,dom_id)=>{
        const name=config.queue.block;
        const push=VBW.queue.push;
        for(let key in map){
            push(name,{
                key:key,
                world:map[key].world,
                container:dom_id,
            });
        }
        return true;
    },
    //menu of layout, basic action
    layout:()=>{
        const dom_id="three_demo";
        const world=0;
        const menus=[
            {label:"Buy",icon:"", action:async ()=>{
                console.log(`Buy button clicked.`);
                const res=await VBW.datasource.contract.call("buy",[2000,1290,0]);
                console.log(res);
            }},
            {label:"Edit",icon:"",action:()=>{
                const bk=VBW.cache.get(["env","player","location","block"]);
                if(bk.error) return UI.show("toast",bk.error,{type:"error"});
                World.edit(dom_id,world,bk[0],bk[1]);
            }},

            {label:"Normal",icon:"",action:()=>{
                World.normal(dom_id,world,(done)=>{
                    console.log(done);
                });
            }},

            //UI.dialog Sample
            {label:"Detail",icon:"",action:()=>{
                const ctx={
                    title:"Hello",
                    content:"This a dailog to show more details.",
                }
                UI.show("dialog",ctx,{position:"center"});
            }},

            {label:"Mint",icon:"",action:async ()=>{
               const res=await VBW.datasource.contract.call("mint",[2000,1290,0]);
               console.log(res);
            }},

            //UI.form Sample
            {label:"World",icon:"",action:()=>{
                const inputs=[
                    {
                        type:"string",
                        key:"desc",
                        value:"",
                        desc:"Description of this Septopus Worlod",
                        placeholder:"200 max",
                        valid:(val)=>{
                            if(!val) return "Invalid description.";
                            if(val.length>200) return "200 bytes max";
                            return true;
                        }
                    },
                    {
                        type:"integer",
                        key:"index",
                        value:1,
                        desc:"World index on chain",
                        placeholder:"Index of world",
                        valid:(val)=>{
                            console.log(val);
                            if(val!==2) return "Invalid World Index, please check."
                            return true;
                        }
                    },
                ];
                const cfg={
                    title:"World Setting",
                    buttons:{save:true,recover:false},
                    events:{
                        save:(obj)=>{
                            console.log(obj);
                        },
                        close:()=>{

                        },
                    }
                }
                UI.show("form",inputs,cfg);
            }}
        ];
        const cfg_menu={}

        UI.show("menu",menus,cfg_menu);
    },
    autoBind:()=>{
        API.bind("height","getSlot",(data)=>{
            VBW.time.calc(data);
            VBW.weather.calc(data);
        });
    },
}   

const World={
    /**
     * Septopus World system initalization
     * @return {boolean} - wether init successful
     * */
    init:async (cfg)=>{
        //1.register all components;
        self.register();
        UI.show("toast",`Septopus World running env done.`,{});
        if(config.debug) VBW.cache.dump();   //dump when debug
        return true;
    },

    /**
     * Stop render, needed in UI mode
     * @param	{string}    dom_id		- container DOM id
     * @void
     * */
    stop:(dom_id)=>{
        const {render }=VBW.cache.get(["active","containers",dom_id]);
        render.setAnimationLoop(null)
    },

    /**
     * start render, needed in UI mode
     * @param	{string}    dom_id		- container DOM id
     * @void
     * */
    start:(dom_id)=>{
        const {render }=VBW.cache.get(["active","containers",dom_id]);
        render.setAnimationLoop(VBW.loop)
    },


    /**
     * Septopus World entry, start from 0 to start the 3D world
     * @param	{string}    id		- container DOM id
     * @param   {function}  ck      - callback when loaded
     * @param   {object}    [cfg]   - {contract:methods,fullscreen:false}, config setting
     * @return {boolean} - wether load successful
     * */
    first:(dom_id,ck,cfg)=>{
        UI.show("toast",`Start to struct world.`);
        //0.set current active dom_id
        const current_chain=["active","current"];
        VBW.cache.set(current_chain,dom_id);

        //0.1. set UI layout
        self.layout();

        //0.2. start listener.
        self.autoBind();
        
        //0.3. set contract requests.
        if(cfg && cfg.contract && VBW.datasource && VBW.datasource.contract){
            VBW.datasource.contract.set(cfg.contract);
        }

        //1.get the player status
        if(!self.struct(dom_id)) return  UI.show("toast",`Failed to struct html dom for running.`,{type:"error"});
        console.log("Framework:",VBW)
        if(!VBW.datasource) return UI.show("toast",`No datasource for the next step.`,{type:"error"});
        VBW.player.start(dom_id,(start)=>{
            UI.show("toast",`Player start at ${JSON.stringify(start.block)} of world[${start.world}]. raw:${JSON.stringify(start)}`);
            const world=start.world;
            VBW.event.start(world,dom_id);
            VBW.datasource.world(start.world,(wd)=>{
                UI.show("toast",`World data load from network successful.`);
                //1.2. set `block checker` and `resource check`.
                const chain = ["block", dom_id, world, "loop"];
                const queue = VBW.cache.get(chain);
                queue.push({ name: "block_checker", fun:self.checkBlock});
                queue.push({ name: "resource_checker", fun:self.checkResource});

                //2.get blocks data;
                const index=start.world;
                const [x,y]=start.block;
                const ext=!start.extend?1:start.extend;
                const limit=wd.size;
                VBW.datasource.view(x,y,ext,index,(map)=>{
                    //console.log(map);
                    if(map.loaded!==undefined){
                        if(!map.loaded){
                            //2.1. add loading queue
                            delete map.loaded;
                            self.loadingBlockQueue(map,dom_id);
                            UI.show("toast",`Loading data, show block holder.`);
                            const failed = self.save(dom_id,index,map,wd);
                            if(failed) return UI.show("toast",`Failed to set cache, internal error, abort.`,{type:"error"});
            
                            const range={x:x,y:y,ext:ext,world:index,container:dom_id};

                            //2.2. struct holder
                            VBW.load(range,cfg,(pre)=>{
                                UI.show("toast",`Struct all components, ready to show.`);
                                self.syncPlayer(start,dom_id);  //set the camera as player here, need the render is ready
                                self.prefetch(pre.texture,pre.module,(failed)=>{  

                                    UI.show("toast",`Fetch texture and module successful.`);

                                    //2.3.bind controller and show
                                    VBW[config.controller].start(dom_id);
                                    VBW[config.render].show(dom_id);
                                    return ck && ck(true);
                                });
                            });
                        }else{
                            delete map.loaded;
                            UI.show("toast",`Load block data successful.`);
                            const failed = self.save(dom_id,index,map,wd);
                            if(failed) return UI.show("toast",`Failed to set cache, internal error, abort.`,{type:"error"});
                        }
                    }
                },limit);
            });
        });
    },

    /**
     * Load block[x,y]
    */
    load:(dom_id,world,x,y)=>{
        const chain=["block",dom_id,world,`${x}_${y}`];
        if(VBW.cache.exsist(chain)){
            VBW[config.render].show(dom_id,[x,y,world]);
            return true;
        }

        const ext=0;
        const limit=[4096,4096];
        //const limit = VBW.cache.get(["setting", "limit"]);

        //check wether exsist first.
        VBW.datasource.view(x,y,ext,world,(map)=>{
            //console.log(map);
            if(map.loaded!==undefined){
                if(!map.loaded){
                    delete map.loaded;
                    self.loadingBlockQueue(map,dom_id);
                    const failed = self.save(dom_id,world,map);
                    if(failed) return UI.show("toast",`Failed to set cache, internal error, abort.`,{type:"error"});
                    const range={x:x,y:y,ext:ext,world:world,container:dom_id};

                    VBW.load(range,{},(pre)=>{
                        self.prefetch(pre.texture,pre.module,(failed)=>{
                            VBW[config.render].show(dom_id);
                        });
                    })

                }else{
                    delete map.loaded;
                    const failed = self.save(dom_id,world,map);
                    if(failed) return UI.show("toast",`Failed to set cache, internal error, abort.`,{type:"error"});    
                }
            }
        },limit);
    },

    /**
     * clean the target block[x,y] in render
    */
    unload:(dom_id,world,x,y)=>{
        VBW[config.render].clean(dom_id,world,x,y);
    },

    /**
     * set block to edit mode
     * @param	{string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {number}    x       - coordination X
     * @param   {number}    y       - coordination y
     * @param   {function}  ck      - callback function
     * @callback - wether done callback
     * @param {boolean} result
     * */
    edit:(dom_id,world,x,y,ck)=>{
        //1.create edit temp data
        const chain=["block",dom_id,world,"edit"];
        VBW.cache.set(chain,{
            x:x,y:y,world:world,
            border:[],          //threeObject of block border
            //raycast:[],       //threeObjects need to check selection status
            stop:[],            //stop to show
            helper:[],          //helper of all object
            grid:{
                raw:null,       //grid raw parameters,
                line:[],        //
                points:[],      //location points here
            },
            selected:{          //selection information
                adjunct:"",     //selected adjunct
                index:0,        //selected adjunct index
                face:"",        //selected adjunct face ["x","y","z","-x","-y","-z"]
            },
            objects:{           //objects in scene, easy for cleaning from scene
                stop:null,
                helper:null,
                grid:null,
            }    
        });

        //2.create three objects
        const target={x:x,y:y,world:world,container:dom_id}
        const mode="edit";
        //console.log(`Switch to edit mode.`);
        VBW.mode(mode,target,(pre)=>{
            if(pre.error){
                UI.show("toast",pre.error,{type:"error"});
                return ck && ck(false);
            }
            self.prefetch(pre.texture,pre.module,(failed)=>{
                VBW[config.render].show(dom_id,[x,y,world]);
                return ck && ck(true);
            });
        });
    },

    /**
     * set block back to normal mode
     * @param	{string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {function}  ck      - callback function
     * @callback - wether done callback
     * @param {boolean} result
     * */
    normal:(dom_id,world,ck)=>{
        //0.check edit mode
        const chain=["block",dom_id,world,"edit"];
        const cur=VBW.cache.get(chain);
        if(cur.error) return ck && ck(cur);

        //1.remove edit data
        const x=cur.x,y=cur.y;
        const target={x:x,y:y,world:world,container:dom_id}

        const mode="normal";
        VBW.mode(mode,target,()=>{
            VBW[config.render].show(dom_id,[x,y,world]);
        });
        
        return ck && ck(true);
    },

    /**
     * select single adjunct in a editing block
     * @param	{string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {number}    x       - coordination X
     * @param   {number}    y       - coordination y
     * @param	{string}    name    - selected adjunct name
     * @param   {number}    index   - selected adjunct index
     * @param   {number}    face    - selected adjunct face in ["x","y","z","-x","-y","-z"]
     * @param   {function}  ck      - callback function
     * @callback - wether done callback
     * @param {boolean} result
     * */
    select:(dom_id,world,x,y,name,index,face,ck)=>{
        //1. set selected adjunct
        const chain=["block",dom_id,world,"edit","selected"];
        const selected=VBW.cache.get(chain);
        selected.adjunct=name;
        selected.index=index;
        selected.face=face;

        //2. fresh 
        const target={x:x,y:y,world:world,container:dom_id}
        const cfg={selected:true};
        VBW.mode("edit",target,(pre)=>{
            if(pre.error){
                UI.show("toast",pre.error,{type:"error"});
                return ck && ck(false);
            }
            VBW[config.render].show(dom_id,[x,y,world]);
            return ck && ck(true);
        },cfg);
    },  

    /**
     * excute modify tasks entry
     * @param	{object[]}  tasks   - modify tasks need to do
     * @param	{string}    dom_id  - container DOM id
     * @param   {number}    world   - world index
     * @param   {function}  ck      - callback function
     * @callback - wether done callback
     * @param {boolean} result
     * */
    modify:(tasks,dom_id,world,ck)=>{
        const chain = ["block", dom_id,world, "edit"];
        const active = VBW.cache.get(chain);
        const x=active.x,y=active.y;

        const queue=VBW.cache.get(["task", dom_id, world]);
        for(let i=0;i<tasks.length;i++){
            const task=tasks[i];
            task.x=x;
            task.y=y;
            queue.push(task);
        }
        VBW.update(dom_id, world);
        
        const target={x:x,y:y,world:world,container:dom_id}
        VBW.prepair(target,(pre)=>{
            console.log(pre);
            VBW[config.render].show(dom_id,[x,y,world]);
            return ck && ck(true);
        });
        
    },
}

export default World;