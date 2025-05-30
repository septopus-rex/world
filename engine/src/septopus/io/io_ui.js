/**
 * IO - UI components
 *
 * @fileoverview
 *  1. basic UI components, can be rewritten 
 *
 * @author Fuu
 * @date 2025-04-23
 */

import Toolbox from "../lib/toolbox";

//UI replacement. Rewrite the output UI here.
const replace={

}            
const router={
    dialog:(ctx,cfg)=>{
        console.log(`[UI.dialog]:`+ctx);
    },
    toast:(ctx,cfg)=>{
        const msg=`[UI.toast]:`+ctx;
        if(cfg && cfg.type==="error") return console.error(msg);
        
        return console.log(msg);
    },
    load:(ctx,cfg)=>{

    },
    menu:(ctx,cfg)=>{

    },
    pop:(ctx,cfg)=>{

    },
    compass:(val,cfg)=>{

    },
    /******************************************/
    /*************** Form group ***************/
    /******************************************/
    form:(arr,cfg)=>{

    },
    number:(val,cfg)=>{

    },
    string:(val,cfg)=>{

    },
    boolean:(val,cfg)=>{

    },
    select:(val,cfg)=>{

    },
};

const self={
    struct:(id)=>{
        const container=document.getElementById(id);
        if(container===null) return {error:"Invalid container to init system."}
        const doms={
            toast:{
                "index":99,
                "text-align":"center",
            },
            dialog:{},
            menu:{},
            compass:{},
        };

        for(let type in doms){
            self.appendDom(type,doms[type],container);
        }
        //console.log(container);

        return true;
    },
    getCSS:(obj)=>{
        let str="";
        for(let k in obj) str+=`${k}:${obj[k]};`;
        return str;
    },
    appendDom:(type,cfg,container)=>{
        const id=`vbw_${type}`;
        const check=document.getElementById(id);
        if(check===null){
            //const css=self.getCSS(cfg);
            const css="";
            const str=`<div id=${id} style="${css}"></div>`;
            const parser = new DOMParser();
            const doc = parser.parseFromString(str, 'text/html');
            container.appendChild(doc.body.firstChild);
        }
    },
};

const UI={
    //TODO,增加toast和dialog部分来显示信息
    init:async (id)=>{
        const done=self.struct(id);
        if(done!==true && done.error) return done;

        UI.show("toast",`UI ready.`);
        return true;
    },
    
    //重写UI的方法
    set:(ui)=>{
        const failed=[];
        for(let k in ui){
            if(router[k]===undefined ||
                !["object","function"].includes(Toolbox.type(ui[k]))
            ){
                failed.push(k);
                continue;
            }
            replace[k]=ui[k];
        }
        if(failed.length!==0) return failed;
        return true;
    },
    show:(type,ctx,cfg)=>{
        if(!router[type]) return console.error(`There is no UI component called "${type}", please check system.`);
        if(replace[type]!==undefined) return replace[type](ctx,cfg);
        return router[type](ctx,cfg);
    },
}

export default UI;