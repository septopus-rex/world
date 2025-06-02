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
const self={
    struct:(id)=>{
        const el=document.getElementById(id);
        if(el===null) return {error:"Invalid container to init system."}
        for(let type in doms){
            self.appendDom(type,doms[type],el);
        }
        return true;
    },
    appendDom:(type,cfg,el)=>{
        const id=`${config.prefix}${type}`;
        const check=document.getElementById(id);
        if(check===null){
            //const css=self.getCSS(cfg.css);
            const str=`<div id="${id}" class="${type}"></div>`;

            const parser = new DOMParser();
            const doc = parser.parseFromString(str, 'text/html');
            el.appendChild(doc.body.firstChild);
        }
    },
    domMenu:(arr)=>{
        let ctx=`<ul class="buttons">`;
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            ctx+=`<li>${row.label}</li>`;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(ctx, 'text/html');
        
        return doc.body.firstChild;
    },
};

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
        const el=document.getElementById(id);
        el.textContent = ctx;
        el.hidden = false;
    },
    menu:(arr,cfg)=>{
        console.log(arr);
        const id=`${config.prefix}menu`;
        const dom=self.domMenu(arr);
        const el=document.getElementById(id);
        el.appendChild(dom);
    },
    pop:(arr,cfg)=>{
        console.log(arr,cfg);
        const id=`${config.prefix}pop`;
        const dom=self.domMenu(arr);

        const el=document.getElementById(id);
        el.innerHTML="";
        el.appendChild(dom);
        //el.style.position = 'absolute';
        el.style.top=`${cfg.offset[0]}px`;
        el.style.left=`${cfg.offset[1]}px`;
        el.hidden=false;
    },
    compass:(val,cfg)=>{
        const id=`${config.prefix}compass`;
        const el=document.getElementById(id);
    },
    status:(val,cfg)=>{
        const id=`${config.prefix}status`;
        const el=document.getElementById(id);
        el.textContent = val;
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
        events:{
            show:null,
            close:null,
        },
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

const UI={
    init:async (id)=>{
        const done=self.struct(id);
        if(done!==true && done.error) return done;

        UI.show("toast",`UI ready.`);
        return true;
    },
    
    //rewrite UI method, for UX 
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

    hide:(type)=>{
        if(!router[type]) return console.error(`No UI component called "${type}" to hide, please check system.`);
        const id=`${config.prefix}${type}`;
        const container=document.getElementById(id);
        container.hidden = true;
    },
    //bind UI event
    //not React way, pure JS way to deal with UI component
    bind:(type,name,event)=>{

    },
}

export default UI;