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
const config={
    prefix:"vbw_",
}
const replace={} 
const inputs={
    number:(val,cfg)=>{

    },
    string:(val,cfg)=>{

    },
    boolean:(val,cfg)=>{

    },
    select:(val,cfg)=>{

    },
    text:(val,cfg)=>{

    },
};           
const router={
    dialog:(ctx,cfg)=>{
        console.log(`[UI.dialog]:`+ctx);
    },
    toast:(ctx,cfg)=>{
        const msg=`[UI.toast]:`+ctx;
        if(cfg && cfg.type==="error") return console.error(msg);
        //console.log(msg);
        const id=`${config.prefix}toast`;
        const container=document.getElementById(id);
        container.textContent = ctx;
        container.hidden = false;
    },
    menu:(arr,cfg)=>{
        const id=`${config.prefix}menu`;
        const container=document.getElementById(id);
        container.textContent = `<ul><li>1</li><li>2</li></ul>`;
    },
    pop:(ctx,cfg)=>{

    },
    compass:(val,cfg)=>{
        const id=`${config.prefix}compass`;
        const container=document.getElementById(id);
    },
    status:(val,cfg)=>{
        const id=`${config.prefix}status`;
        const container=document.getElementById(id);
        container.textContent = val;
    },
    form:(arr,cfg)=>{

    },
    load:(ctx,cfg)=>{

    },
};

const doms={
    toast:{
        events:{},
    },
    dialog:{
        events:{
            close:null,
            show:null,
        },
    },
    menu:{
        events:{
            show:null,
            close:null,
        },
    },
    pop:{

    },
    compass:{       //compass for player
        events:{
            click:null,
        },
    },
    status:{        //3D status 
        events:{
            click:null,
        },
    },
}

const self={
    struct:(id)=>{
        const container=document.getElementById(id);
        if(container===null) return {error:"Invalid container to init system."}
        for(let type in doms){
            self.appendDom(type,doms[type],container);
        }
        return true;
    },
    // getCSS:(obj)=>{
    //     let str="";
    //     for(let k in obj) str+=`${k}:${obj[k]};`;
    //     return str;
    // },
    appendDom:(type,cfg,container)=>{
        const id=`${config.prefix}${type}`;
        const check=document.getElementById(id);
        if(check===null){
            //const css=self.getCSS(cfg.css);
            const str=`<div id="${id}" class="${type}"></div>`;

            const parser = new DOMParser();
            const doc = parser.parseFromString(str, 'text/html');
            container.appendChild(doc.body.firstChild);
        }
    },
};

const UI={
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
    //bind UI event
    //not React way, pure JS way to deal with UI component
    bind:(type,name,event)=>{

    },
}

export default UI;