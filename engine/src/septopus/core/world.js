/* 
*  Septopus World Entry, group functions here.
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1. 
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
    //controller:"con_observe",
};

const self={
    register:()=>{
        const regKey=CONFIG.hooks.register;
        const initKey=CONFIG.hooks.initialize;
        //console.log(regs);
        for(let cat in regs){
            const coms=regs[cat];
            for(let i=0;i<coms.length;i++){
                const component=coms[i];
                if(component.hooks===undefined) continue;

                //1.load VBW parts to Framework
                if(component.hooks[regKey]!==undefined){
                    const cfg=component.hooks[regKey]();
                    const result=VBW.component.reg(cfg,component);
                    if(result.error!==undefined) UI.show("toast",result.error,{type:"error"});
                }   

                //2.init the parts component
                if(component.hooks[initKey]!==undefined){
                    const res=component.hooks[initKey]();
                    if(!res.chain || !res.value){
                        //console.log(component);
                        UI.show("toast",`Invalid init data from "${cat}" component.`,{type:"error"});
                    } 
                    VBW.cache.set(res.chain,res.value);
                }
            }
        }
    },
    //构建需要的dom,都放在container下
    struct:(container)=>{
        if(VBW.block===undefined) return UI.show("toast",`No more component.`,{type:"error"});
        //0.设备检测
        const dt=VBW.detect.check(container);

        //1.1.构建3D需要的dom
        const dom_render=VBW[config.render].construct(dt.width,dt.height,container);

        //1.2.构建controller需要的dom;
        const dom_controller=VBW[config.controller].construct();

        //2.构建所有需要的dom
        const target=document.getElementById(container);
        //2.1.清理所有的dom
        
        //2.2.增加需要的dom;
        target.appendChild(dom_render);
        target.appendChild(dom_controller);

        return true;
    },
    save:(dom_id,world,map,world_info)=>{
        const fun=VBW.cache.set;

        //1.处理world的数据;
        const w_chain=["env","world"];
        world_info.index=world;
        const wd=self.formatWorld(world_info);
        fun(w_chain,wd);

        //1.1.设置modified的位置
        const m_chain=["task",dom_id,world];
        fun(m_chain,[]);
        
        //2.处理blockd的raw数据保存
        let failed=false;
        for(let k in map){
            const chain=["block",dom_id,world,k,"raw"];
            const res=fun(chain,map[k]);
            if(res!==true && res.error){
                UI.show("toast",res.error,{type:"error"})
                failed=true;
            }else{
                //设置recover数据
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

    updatePlayer:(user,id)=>{
        //1.设置player的位置
        VBW.cache.set(["env","player","location"],user);
        //VBW.cache.set(["env","player","world"],user.world);

        //2.设置相机的位置
        const cam_chain=["active","containers",id,"camera"];
        const cam =  VBW.cache.get(cam_chain);
        const side = self.getSide();
        const cvt = self.getConvert();
        cam.position.set(
            cam.position.x+(user.block[0]-1)*side[0]+user.position[0]*cvt,
            cam.position.y+(user.block[1]-1)*side[1]+user.position[1]*cvt,
            user.position[2]*cvt
        );
        cam.rotation.set(...user.rotation);
    },

    fetchModules:(arr,ck)=>{
        // if(failed===undefined) failed=[];
        // if(arr.length===0) return ck && ck(failed);
        // const id = arr.pop();

        const failed=[];
        //1.从IPFS获取到资源
        API.module(arr,(map)=>{
            for(let id in map){
                const chain=["resource","module",id];
                VBW.cache.set(chain,map[id]);
            }

            return ck && ck(failed);
        })
        
    },
    fetchTextures:(arr,ck)=>{
        const failed=[];
        API.texture(arr,(map)=>{
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

    rebuild:(mode,range,cfg,dom_id,ck)=>{
        VBW.struct(mode,range,cfg,(pre)=>{
            UI.show("toast",`Struct all components, ready to show.`);
            //3.1.3D物体构建完毕，可以计算用户的位置了
            //self.updatePlayer(start,dom_id);
            //3.2.获取网络的资源，用于构建3D。以后这部分可以使用服务进行加速
            self.prefetch(pre.texture,pre.module,(failed)=>{                            
                UI.show("toast",`Fetch texture and module successful.`);

                if(failed.module.length!==0) UI.show("toast",`Failed to frefetch module ${JSON.stringify(failed.module)}`,{type:"error"});
                if(failed.texture.length!==0) UI.show("toast",`Failed to frefetch module ${JSON.stringify(failed.texture)}`,{type:"error"});

                //5.加载渲染器和控制器
                VBW[config.render].show(dom_id);
                return ck && ck();
            });
        });
    },
}   

const World={
    init:async ()=>{
        //1.注册所有的组件
        self.register();
        UI.show("toast",`Virtual block world running env done.`,{});
        VBW.cache.dump();
        return true;
    },

    /* VBW系统的入口，正常运行这个即可
     * @param	id          string		//container dom id
     * @param   [cfg]       object      //配置部分
     * */
    first:(dom_id,ck,cfg)=>{
        UI.show("toast",`Start to struct world.`);
        //0.设置当前的活动窗口
        const current_chain=["active","current"];
        VBW.cache.set(current_chain,dom_id);

        //1.获取到player的具体信息
        if(!self.struct(dom_id)) return  UI.show("toast",`Failed to struct html dom for running.`,{type:"error"});

        VBW.player.start(dom_id,(start)=>{
            UI.show("toast",`Player start at ${JSON.stringify(start.block)} of world[${start.world}]. raw:${JSON.stringify(start)}`);
            VBW.api.world(start.world,(wd)=>{
                UI.show("toast",`Data load from network successful.`);

                //2.保存好所有的数据;
                const index=start.world;
                const [x,y]=start.block;
                const ext=!start.extend?1:start.extend;
                const limit=wd.size;
                VBW.api.view(x,y,ext,index,(list)=>{

                    UI.show("toast",`Save data successful.`);
                    const failed = self.save(dom_id,index,list,wd);
                    if(failed) return UI.show("toast",`Failed to set cache, internal error, abort.`,{type:"error"});
                    
                    self.updatePlayer(start,dom_id);
                    //3.解析所有block数据到std
                    const range={x:x,y:y,ext:ext,world:index,container:dom_id};
                    const mode="init";
                    self.rebuild(mode,range,cfg,dom_id,()=>{
                       
                        VBW[config.controller].start(dom_id);
                        return ck && ck(true);
                    });
                },limit);
            });
        });
    },

    stop:(dom_id)=>{
        //window.cancelAnimationFrame(run.request);
    },
    start:(dom_id)=>{
        //window.cancelAnimationFrame(run.request);
    },

    //修改活着更新之后，重新刷新内容的入口
    fresh:(dom_id)=>{
        //1.处理todo的任务，准备重构的原始数据

        //2.重新加载threeObject
        const modified=[2025,512]
        VBW[config.render].show(dom_id,modified);
    },

    //对block设置成edit状态
    edit:(dom_id,world,x,y,ck)=>{
    
        //1.构建edit的临时数据结构
        const chain=["block",dom_id,world,"edit"];
        VBW.cache.set(chain,{
            x:x,y:y,world:world,
            border:[],          //block的边框的threeObject
            raycast:[],         //取出所有[x,y]的threeObject供检测
            helper:[],          //所有的helper
            grid:{
                raw:null,       //grid raw parameters,
                line:[],        //格栅的线的threeObject
                point:[],       //格栅定位点的threeObject
            },
            selected:{          //被选中的物品
                adjunct:"",     //选中组件名称
                index:0,        //选中的组件序列号
                face:"",        //选中的3D物体的面
            },      
        });

        //2.生成threeObject
        const range={x:x,y:y,ext:0,world:world,container:dom_id};
        const mode="edit";
        self.rebuild(mode,range,{},dom_id,()=>{
            return ck && ck(true);
        });
    },

    //切换回非编辑模式
    normal:(dom_id,world)=>{
        //0.删除edit数据，用于自动回收
        const chain=["block",dom_id,world];
        const cur=VBW.cache.get(chain);
        delete cur.edit;
    },

    select:(dom_id,world,x,y,name,index,face,ck)=>{
        //1. set selected adjunct
        const chain=["block",dom_id,world,"edit","selected"];
        const target=VBW.cache.get(chain);
        target.adjunct=name;
        target.index=index;
        target.face=face;

        //2. fresh 
        const range={x:x,y:y,ext:0,world:world,container:dom_id};
        const mode="active";
        self.rebuild(mode,range,{},dom_id,()=>{
            return ck && ck(true);
        });
    },  

    //Edit entry,
    modify:(tasks,dom_id,world,x,y,ck)=>{
        console.log(tasks,dom_id,world,x,y);
    },
}

export default World;