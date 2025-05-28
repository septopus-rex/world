/**
*  VBW application instance
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.group all functions;
*  2.single entry for running VBW;
*/

import Framework from "./core/framework";
import UI from "./io/io_ui";
import World from "./core/world";
import Toolbox from "./lib/toolbox";

const self={
    init:async (container,ck)=>{
        Framework.init();           //构建基础的cache
        const done = await UI.init(container);   //UI构建基础的dom
        if(done.error) return ck && ck(done);

        const great=await World.init();         //VBW的初始化，注册组件
        return ck && ck(great);
    },
}

export default {
    //replace the default console UI, to improve the UX
    UI:(ui)=>{

    },

    launch:(container,cfg,ck)=>{
        self.init(container,(done)=>{
            
            if(done!==true) return ck && ck(done);
            World.first(container,ck,cfg);

            /*********************************************************/
            /************************* Test code *********************/
            /*********************************************************/
            const wd_index=0;

            setTimeout(()=>{
                World.edit(container,wd_index,2025,500);
            },6000);
            

            // const fs=["x","y","z","-x","-y","-z"];
            // World.select(container,wd_index,2025,500,"wall",0,fs[Toolbox.rand(0,5)]);

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

            // setInterval(()=>{
            //     const fs=["x","y","z","-x","-y","-z"];
            //     World.select(container,wd_index,2025,500,"module",0,fs[Toolbox.rand(0,5)]);
            // },2000);
        });
    },
}