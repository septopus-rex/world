/**
 * Core - block
 *
 * @fileoverview
*  1.block management
*  2.transform methods
 *
 * @author Fuu
 * @date 2025-04-23
 */


import Toolbox from "../lib/toolbox";
import VBW from "./framework";  //need to modify raw data, VBW import
import World from "./world";

const reg={
    name:"block",           //register key name
    category:"system",      //component category
}

const def={
    "BLOCK_ELEVACATION_INDEX":0,
    "BLOCK_ADJUNCTS_INDEX":1,
    "BLOCK_STATUS_INDEX":2,
}

const config={
    opacity:1,
    texture:1,          //ground texture ID
    color:0xeeeee,      //when no texture, ground color setting
    repeat:[10,10],     //texture repeat parameters
    active:{            //active ground cordon setting
        height: 0.5,    //cordon height
        // color:[
        //     0xff0000,       //red
        //     0x00ff00,       //green
        //     0x0000ff,       //blue
        //     0xffff00,       //yellow
        // ],
        color:{
            north:0xe11d48,     //red
            south:0x6b7280,     //black
            east:0x3b82f6,      //blue
            west:0x10b981,      //green
        }
    },
    default:[0.2,1,[]],
};

const funs={
    clean:(arr, world, dom_id)=>{
        const chain_std=["block",dom_id,world];
        const bks=VBW.cache.get(chain_std);
        for (let i = 0; i < arr.length; i++) {
            const row = arr[i];
            const key = `${row[0]}_${row[1]}`;
            console.log(`Clean block: ${key}`);
            delete bks[key];
        }
        return true;
    },
    backup:(x,y,world, dom_id)=>{
        const key=`${x}_${y}`;   
        const chain=["modified",dom_id,world,key];
        if(!VBW.cache.exsist(chain)) VBW.cache.set(chain,{final:null,backup:null});
        const backup_data=VBW.cache.get(["block",dom_id,world,key,"raw"]);
        if(!backup_data || backup_data.error) return {error:`No [ ${x}, ${y} ] raw data to backup`};

        const backup=Toolbox.clone(backup_data);
        chain.push("backup");
        VBW.cache.set(chain,backup);
        return true;
    },
    load:(x,y,world)=>{
        const ext=0;    //no extend, single block
        VBW.api.view(x,y,ext,world,(list)=>{

        });
    },
    unload:(x,y,world,dom_id)=>{

    },
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        animate:(mesh)=>{
            console.log(mesh);
        },
    },
    attribute:{
        load:(x,y,param,world, dom_id)=>{
            //console.log(`block load:`,x,y,param,world,dom_id);
            World.load(dom_id,world,x,y);
        },
        unload:(x,y,param,world, dom_id)=>{
            //console.log(`block unload:`,x,y,param,world,dom_id);
            World.unload(dom_id,world,x,y);
        },
        set:(x,y,param, world, dom_id)=>{
            console.log(`set block parameter:`,x,y,param,world,dom_id);
            //funs.clean();
        },
        backup:(x,y,param,world,dom_id)=>{
            console.log(`block backup:`,x,y,param,world, dom_id);
            return true;
        },
        recover:(x,y,param, world, dom_id)=>{

        },
    },
    transform:{
        //convert raw data to standard septopus world object format
        raw_std:(obj,cvt,side)=>{
            const [va,adjs,status]=obj;
            const s=side[0],hs=0.5*s;
			const data={
				x:s,y:s,z:va*cvt,
				ox:hs,oy:hs,oz:va*cvt*0.5,
                rx:0,ry:0,rz:0,
                status:status,
                material:{
                    texture:config.texture,
                    color:config.color,
                    repeat:config.repeat,
                },
			}
            return [data];
        },

        //convert standard object to 3D render object
        std_3d:(bks)=>{
            const arr=[];
            for(let i=0;i<bks.length;i++){
                const row=bks[i];
                arr.push({
                    type:"box",
                    params:{
                        size:[row.x,row.y,row.z],
                        position:[row.ox,row.oy,row.oz],
                        rotation:[row.rx,row.ry,row.rz],
                    },
                    material:row.material,
                });
            }
            return arr;
        },

        std_active:(std,va)=>{
             const ds = { stop: [], helper: [] };
             return ds;
        },

        //!important, active is struct from "std" to "3d"
        std_border:(obj,va,cvt)=>{
            //console.log(obj);
            const ds={stop:[],helper:[]};
            const cfg=config.active;
            const h=cfg.height*cvt;
            const row=obj[0];
            const cc=0.5*row.x;
            const oz=va+h*0.5;

            const arr=[];
            const w=0.02*cvt;
            arr.push({          //south
                type:"box",
                params:{
                    size:[row.x,w,h],
                    position:[cc,0,oz],
                    rotation:[0,0,0],
                },
                material:{
                    color:cfg.color.south,
                },
            });

            arr.push({      //east
                type:"box",
                params:{
                    size:[w,row.y,h],
                    position:[cc+cc,cc,oz],
                    rotation:[0,0,0],
                },
                material:{
                    color:cfg.color.east,
                },
            });

            arr.push({          //north
                type:"box",
                params:{
                    size:[row.x,w,h],
                    position:[cc,cc+cc,oz],
                    rotation:[0,0,0],
                },
                material:{
                    color:cfg.color.north,
                },
            });

            arr.push({          //west
                type:"box",
                params:{
                    size:[w,row.y,h],
                    position:[0,cc,oz],
                    rotation:[0,0,0],
                },
                material:{
                    color:cfg.color.west,
                },
            });
            ds.helper=arr;
            return ds;
        },

        std_raw:(arr,cvt)=>{

        },

        std_box:(obj)=>{

        },

        std_2d:(arr,face)=>{

        },

        acitve_3d:()=>{

        },

        active_2d:()=>{

        },
    },
}

const vbw_block={
    format:()=>{
        return Toolbox.clone(config.default);
    },
    hooks:self.hooks,
    transform:self.transform,  
    attribute:self.attribute,
}

export default vbw_block;