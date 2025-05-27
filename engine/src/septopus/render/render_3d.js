/* 
*  3D Render
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.
*/

import VBW from "../core/framework";
import ThreeObject from "../three/entry";
import UI from "../io/io_ui";
import Toolbox from "../lib/toolbox";

const reg={
    name:"rd_three",
    type:'render',
    desc:"three.js renderer. Create three.js 3D objects here."
}

const config={
    fov:50,
    color:0xff0000,
}

const self={
    hooks:{
        reg:()=>{return reg},
    },
    getCameraStatus:()=>{
        const chain=["env","player"];
        const player=VBW.cache.get(chain);

        return {position:player.position,rotation:player.rotation};
    },
    getConvert:()=>{
        return VBW.cache.get(["env","world","accuracy"]);
    },
    getSide:()=>{
        return VBW.cache.get(["env","world","side"]);
    },
    freshBlock:(x,y,world,scene)=>{

    },

    parseTexture:(arr,world,dom_id,ck)=>{
        const failed=[]
        const set=VBW.cache.set;
        const get=VBW.cache.get;
        for(let i=0;i<arr.length;i++){
            const index=arr[i];
            const chain=["block",dom_id,world,"texture",index];

            //1.看下资源是不是在
            const s_chain=["resource","texture",index];
            const tx=get(s_chain);
            if(tx.error){
                failed.push(index);
                set(chain,{error:"No resource to parse."});
                continue;
            } 

            //2.生成three的object，挂载到对应位置
            const dt=ThreeObject.get("texture","basic",{image:tx.image,repeat:tx.repeat});
            if(dt.error){
                failed.push(index);
                set(chain,{error:"Failed to create 3D object."});
                continue;
            }
            set(chain,dt);
        }
        return ck && ck(failed);
    },

    //TODO,将module资源转换成渲染器可用的3D模型
    parseModule:(arr,world,dom_id,ck)=>{
        const failed=[]
        const set=VBW.cache.set;
        for(let i=0;i<arr.length;i++){
            const index=arr[i];
            const s_chain=["resource","texture",index];
            const chain=["block",dom_id,world,"module",index];
            const dt={mock:"parsed 3D module."};
            set(chain,dt);
        }

        return ck && ck(failed);
    },
    parse:(texture,module,world,dom_id,ck)=>{
        const failed={module:[],texture:[]};
        self.parseTexture(texture,world,dom_id,(tx_failed)=>{
            failed.texture=tx_failed;
            self.parseModule(module,world,dom_id,(md_failed)=>{
                failed.module=md_failed;
                return ck && ck(failed);
            });
        });
    },

    //从构建好的three的组件定义，转换成渲染器能处理的对象，用于创建threeObject并放入scene
    singleBlock:(x,y,world,dt)=>{
        const result={object:[],module:[],texture:[],animate:[]};
        for(let name in dt){
            const list=dt[name];
            for(let i=0;i<list.length;i++){
                const row=list[i];

                //1.筛选出材质的信息
                if(row.material &&  row.material.texture){
                    if(!result.texture.includes(row.material.texture)){
                        result.texture.push(row.material.texture);
                    } 
                }

                //2.筛选出模型的信息
                if(row.module){
                    if(!result.module.includes(row.module)){
                        result.module.push(row.module);
                    } 
                }

                //3.分离出动画的信息
                if(row.animate!==undefined){
                    result.animate.push({
                        x:x,y:y,world:world,index:row.index,
                        adjunct:name,effect:row.animate
                    });
                }

                //4.创建three的object的标准转换数据
                const obj3={
                    x:x,y:y,adjunct:name,
                    geometry:{
                        type:row.type,
                        params:row.params,
                    },
                }
                if(row.material!==undefined) obj3.material =row.material
                if(row.index!==undefined) obj3.index=row.index;
                if(row.module!==undefined) obj3.module=row.module;
                if(row.animate!==undefined) obj3.animate=row.animate;
                result.object.push(obj3);
            }
        }

        return result;
    },

    checkMaterial:(cfg,world,id)=>{
        if(cfg.texture){
            const chain=["block",id,world,"texture",cfg.texture];
            const dt=VBW.cache.get(chain);
            if(dt!==undefined && !dt.error){
                return {type:"meshphong",params:{texture:dt}};
            }
        }

        if(cfg.color){
            return {type:"meshbasic",params:{color:cfg.color}};
        }

        return {type:"",params:{color:config.color}};
    },

    getThree:(single,world,id,side)=>{
        //console.log(JSON.stringify(single));
        const arr=[];
        if(single.geometry && single.material){
            const { geometry }=single;
            const { rotation,position }=geometry.params;
            //console.log(single.material);
            const material=self.checkMaterial(single.material,world,id);

            //1.设置mesh的位置
            position[0]+=(single.x-1)*side[0];
            position[1]+=(single.y-1)*side[1];
            const res=ThreeObject.mesh(geometry,material,position,rotation);

            //2.处理生成的材质
            //TODO,这里需要对材质也进行复用,减少内存占用

            const mesh=res.mesh;
            //2.设置mesh的useData用于检索
            const data={
                x:single.x,
                y:single.y,
                name:single.adjunct
            }
            if(single.index!==undefined) data.index=single.index;
            mesh.userData=data;

            arr.push(mesh);
        }   
        
        //TODO,这里实现加载模型到scene里
        if(single.module){
            //console.log(`Load module.`);
        }

        return arr;
    },
    //从构建好的three的组件定义，转换成渲染器能处理的对象，用于创建threeObject并放入scene
    singleEdit:(world,dom_id)=>{
        const edit_chain=["block",dom_id,world,"edit"];
        const dt=VBW.cache.get(edit_chain);
        console.log(dt);
    },
    loadBasic:(scene,dom_id)=>{
        const sun=ThreeObject.get("light","sun",{colorSky:0xfffff,colorGround:0xeeeee,intensity:1});
        const player=VBW.cache.get(["env","player"]);
        const [x,y]=player.location.block;
        const side=self.getSide();
        const cvt=self.getConvert();
        sun.position.set(
            x*side[0],
            y*side[1],
            20*cvt,
        )
        scene.add(sun);
    },

    //FIXME, player can go out of editing block, this can effect the active block
    //!important,因为在编辑状态下，player会走出编辑的block，定位的时候不能用player的数据
    loadEdit:(scene,dom_id)=>{
        //const player=VBW.cache.get(["env","player"]);
        const world=VBW.cache.get(["active","world"]);
        const chain=["block",dom_id, world,"edit"];
        if(!VBW.cache.exsist(chain)){
            return  UI.show("toast",`No edit data to render.`,{type:"error"});
        }
        const edit=VBW.cache.get(chain);
        //console.log(edit);
        
        //1.对应的helper
        let objs=[];
        if(edit.selected.adjunct){
            if(edit.helper.length!==0){
                objs=objs.concat(edit.helper);
            }
        }

        //2.加载边框
        objs=objs.concat(edit.border);
        const data=self.singleBlock(
            edit.x,
            edit.y,
            world,
            { editor:objs }
        );
        const side=self.getSide();
        for(let i=0;i<data.object.length;i++){
            const single=data.object[i];
            const ms=self.getThree(single,world,dom_id,side);
            for(let j=0;j<ms.length;j++){
                if(ms[j].error){
                    UI.show("toast",ms[j].error,{type:"error"});
                    continue;
                } 
                scene.add(ms[j]);
            }
        }

        //3.加载边框
        if(edit.grid.raw!==null){
            const params=Toolbox.clone(edit.grid.raw);
            params.density={
                offsetX:1000,
                offsetY:1000,
                limitZ:12000,
            }
            const gs=ThreeObject.get("extend","grid",params);
            edit.grid.line=gs;

            gs.position[0]+=(edit.x-1)*side[0];
            gs.position[1]+=(edit.y-1)*side[1];
            scene.add(gs);
        }

        
    },
    loadBlocks:(scene,dom_id)=>{
        const player_chain=["env","player"];
        const player=VBW.cache.get(player_chain);
        const limit=VBW.setting("limit");
        const active=VBW.cache.get(["active"]);

        //1.根据block的数据，分离出texture和module，分别进行加载
        const ext=player.location.extend;
        const [x,y]=player.location.block;
        const world=active.world;

        let mds=[],txs=[],objs=[],ans=[];
        for(let i=-ext;i<ext+1;i++){
            for(let j=-ext;j<ext+1;j++){
                const cx=x+i,cy=y+j
                if(cx<1 || cy<1) continue;
                if(cx>limit[0] || cy>limit[1]) continue;

                const data_chain=["block",dom_id,world,`${cx}_${cy}`,"three"];
                const tdata=VBW.cache.get(data_chain);
                const data=self.singleBlock(cx,cy,world,tdata);
                if(data.texture.length!==0) txs=txs.concat(data.texture);
                if(data.module.length!==0) mds=mds.concat(data.module);
                objs=objs.concat(data.object);
                ans=ans.concat(data.animate);
            }
        }

        //2.准备renderer需要的材质和模型（将资源实例化成renderer可使用的）
        self.parse(txs,mds,world,dom_id,(failed)=>{
            //console.log(failed);
            UI.show("toast",`Farse resource for rendering.`);
            
            //3.创建所有的ThreeObject，并加入到scene
            const exsist=VBW.cache.exsist;
            for(let i=0;i<objs.length;i++){

                //3.1.创建对应的three object,并设置three object的基础参数，符合[x,y]的数据
                const single=objs[i];
                //console.log(JSON.stringify(single));
                const side=self.getSide();
                const ms=self.getThree(single,world,dom_id,side);
                
                //3.2.如果有animate的话，建立`x_y_adj_index` --> ThreeObject[]的关系
                if(single.animate!==undefined){
                    const key=`${single.x}_${single.y}_${single.adjunct}_${single.index}`;
                    const chain=["block",dom_id,world,"animate"];
                    if(!VBW.cache.exsist(chain)) VBW.cache.set(chain,{});
                    const map=VBW.cache.get(chain);
                    if(map[key]===undefined) map[key]=[];
                    for(let i=0;i<ms.length;i++){
                        if(ms[i].error) continue;
                        map[key].push(ms[i]);
                    }
                }

                //3.4.添加到scene里进行处理
                for(let i=0;i<ms.length;i++){
                    if(ms[i].error){
                        UI.show("toast",ms[i].error,{type:"error"});
                        continue;
                    } 
                    scene.add(ms[i]);
                }
            }

            //4.2.添加到动画队列里
            const ani_chain=["block",dom_id,world,"queue"];
            VBW.cache.set(ani_chain,ans);
        });
    },
};

export default {
    hooks:self.hooks,
    //构建需要的组件
    construct:(width,height,id)=>{
        const chain=["active","containers",id];
        if(!VBW.cache.exsist(chain)){
            const scene=ThreeObject.get("basic","scene",{});
            const render=ThreeObject.get("basic","render",{width:width,height:height});
            const cfg={width:width,height:height,fov:50,near:0.1,far:1000000};
            const camera=ThreeObject.get("basic","camera",cfg);
            VBW.cache.set(chain,{render:render,camera:camera,scene:scene});
        }
        const dt=VBW.cache.get(chain);
        return dt.render.domElement;
    },

    /**  renderer的渲染方法
     * @param	id          string		//container dom id
     * @param   [block]     array       //需要刷新的block的坐标[ x,y,world ]
     * @param	[force]     bool		//是否强制刷新scene
     * */
    show:(dom_id,block,force)=>{
        const chain=["active","containers",dom_id];
        if(!VBW.cache.exsist(chain))return UI.show(`Construct the renderer before rendering.`,{type:"error"});
        //if(!map[id]) 
        const data=VBW.cache.get(chain);
        const {render,scene,camera} = data;

        const info=render.info.render;
        const first=info.frame===0?true:false;  //检查渲染器的帧数，确认第一次运行

        //1.清除指定的block数据，用于刷新场景
        if(block!==undefined){
            console.log(`Fresh target block`);
            //const [x,y,world]=block;
            //self.freshBlock(x,y,world,scene);
            //1.3.尝试添加Edit部分的组件
            //self.loadEdit(scene,dom_id);
        }

        //2.强制清除所有的数据
        if(force){

        }

        if(first || force){
            //1.加载不同的3D内容
            //1.1加载基础的3D组件(灯光、天空、气候等)
            self.loadBasic(scene,dom_id);

            //1.2.加载需要的3D组件（按需处理)
            self.loadBlocks(scene,dom_id);

            //1.3.尝试添加Edit部分的组件
            self.loadEdit(scene,dom_id);

            //2.渲染放在了loop里进行,动画的支持也在loop里
            render.setAnimationLoop(VBW.loop);
        }
    },
}