/**
*  VBW application instance
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.group all functions;
*  2.single entry for running VBW;
*/

import VBW from "./core/framework";
import UI from "./io/io_ui";
import World from "./core/world";
import "./css/common.css";

const self={
    init:async (container,cfg,ck)=>{
        VBW.init();       
        const done = await UI.init(container);
        if(done.error) return ck && ck(done);

        const great = await World.init();

        self.autoSize(container,cfg);

        return ck && ck(great);
    },

    autoSize:(container,cfg)=>{
        //1.set size by parameters.
        if(cfg && cfg.size){
            return self.setDomSize(container,cfg.size[0],cfg.size[1]);
        }

        //2.check wether mobile
        const device=VBW.cache.get(["env","device"]);
        //console.log(device);
        if(device.mobile){
            return self.setDomSize(container,device.screen.width,device.screen.height);
        }

        const body = document.body;
        const style = getComputedStyle(body);
        const fix = style.marginLeft+style.marginRight;
        const min=700;
        return self.setDomSize(container,device.screen.width-fix,min);
    },
    setDomSize:(container,width,height)=>{
        console.log(container,width,height);
        const el=document.getElementById(container);
        el.style.width=`${width}px`;
        el.style.height=`${height}px`;
    },
}

export default {
    //replace the default console UI, to improve the UX
    UI:(ui)=>{

    },

    launch:(container,cfg,ck)=>{
        self.init(container,cfg,(done)=>{
            if(done!==true) return ck && ck(done);
            World.first(container,ck,cfg);

            /*********************************************************/
            /************************* Test code *********************/
            /*********************************************************/
            const wd_index=0;

            setTimeout(()=>{

                /*********** Mode Switch Demo ***********/
                // World.edit(container,wd_index,2025,501);
                // setTimeout(()=>{
                //     const fs=["x","y","z","-x","-y","-z"];

                //     World.select(container,wd_index,2025,501,"wall",0,fs[Toolbox.rand(0,5)]);
                //     setTimeout(()=>{
                //         World.normal(container,wd_index)
                //     },3000);
                // },3000);

                /*********** Adjunct Modification Demo ***********/
                // World.edit(container,wd_index,2025,502);
                // setTimeout(()=>{
                //     const tasks=[
                //         {adjunct:"wall",action:"set",param:{z:8,index:0}}
                //     ]
                //     World.modify(tasks,container,wd_index,(done)=>{});
                // },1000);

                // World.stop(container);
                // setTimeout(()=>{
                //     World.start(container);
                // },3000);

            },5000);
            
            // const tasks=[
            //     {adjunct:"wall",action:"set",param:{x:1.2}},
            //     {adjunct:"wall",action:"add",param:{ox:3,oy:12}},
            //     {adjunct:"wall",action:"del",param:{id:1}},
            //     //{adjunct:"wall",action:"copy",param:{id:0,ox:6}},
            //     {adjunct:"module",action:"set",param:{id:0,oz:3}},
            // ]
            // World.modify(tasks,wd_index,2025,500,(done)=>{
            //     console.log(done);
            // });
        });
    },
}