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
    dialog:{
        close:"dialog_close",
        form:"form_close",
    }
}
const replace={} 
const doms={
    pop:{
        events:{
            show:null,
            close:null,
        },
    },
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
    form:{
        events:{
            save:null,
            close:null,
        },
    },
}

const inputs={
    number:(val,key,placeholder)=>{
        return `<input type="number" value="${val}" id="${key}" placeholder="${placeholder}">`;
    },
    integer:(val,key,placeholder)=>{
        return `<input type="number" value="${val}" id="${key}" placeholder="${placeholder}">`;
    },
    string:(val,key,placeholder)=>{
        return `<input type="text" value="${val}" id="${key}" placeholder="${placeholder}">`;
    },
    boolean:(val,key,placeholder)=>{

    },
    select:(val,key,placeholder)=>{

    },
    text:(val,key,placeholder)=>{
        return `<input type="text" value="${val}" id="${key}" placeholder="${placeholder}">`;
    },
};

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
    hide:(type)=>{
        const id=`${config.prefix}${type}`;
        const container=document.getElementById(id);
        container.hidden = true;
    },
    domMenu:(arr,name)=>{
        let ctx=`<ul class="buttons">`;
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            ctx+=`<li id="${name}_${i}">${row.label}</li>`;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(ctx, 'text/html');
        
        return doc.body.firstChild;
    },
    bindActions:(arr,name)=>{
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            const id=`${name}_${i}`;
            const el=document.getElementById(id);
            el.addEventListener("click",(ev)=>{
                ev.stopPropagation();
                if(row.action) row.action(ev);
                self.hide("pop");
            });
        }
    },
    getForm:(arr)=>{
        let ctx='<div>';
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            if(!row.type || !inputs[row.type]){
                console.error(`Error input: ${JSON.stringify(row)}`)
                continue;
            }
            const input=inputs[row.type](row.value,row.key,row.placeholder);
            ctx+=`<div class="row">
                    <small id="${row.key}_info">${row.desc}</small>
                </div>
                <div class="row">
                    ${input}
                </div>`;
        }
        ctx+='</div>';
        return ctx;
    },
}; 

const router={
    form:(arr,cfg)=>{
        //1. create DOM
        const ctx=self.getForm(arr);
        const id=`${config.prefix}form`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "form"`);
        el.innerHTML="";
        const data=`
            <div class="title">${cfg.title}</div>
            <svg class="close" id="${config.dialog.form}" viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <hr />
            <div class="body">
                ${ctx}
            </div>
            <div class="foot">
                <button class="left">Recover</button>
                <button class="right">Save</button>
            </div>`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');

        el.appendChild(doc.body); 
        el.style.display="block";
        el.hidden=false;

        //2. basic binding
        const close=document.getElementById(config.dialog.form);
        close.addEventListener("click",(ev)=>{
            el.style.display="none";
            el.hidden=true;
        });

        //3. binding input check
    },
    dialog:(ctx,cfg)=>{
        const id=`${config.prefix}dialog`;

        const el=document.getElementById(id);
        el.innerHTML="";
        const data=`<div class="title">${ctx.title}</div>
            <svg class="close" id="${config.dialog.close}" viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <hr />
            <div class="body">${ctx.content}</div>`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');

        el.appendChild(doc.body); 
        el.style.display="block";
        el.hidden=false;

        const close=document.getElementById(config.dialog.close);
        close.addEventListener("click",(ev)=>{
            el.style.display="none";
            el.hidden=true;
        });

        if(cfg.auto) cfg.auto();
    },
    toast:(ctx,cfg)=>{
        const msg=`[UI.toast]:`+ctx;
        if(cfg && cfg.type==="error") return console.error(msg);
        const id=`${config.prefix}toast`;

        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "toast"`);

        el.textContent = ctx;
        el.hidden = false;
    },
    menu:(arr,cfg)=>{
        const id=`${config.prefix}menu`;
        const name="menu";
        const dom=self.domMenu(arr,name);

        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "menu"`);

        el.appendChild(dom);
        self.bindActions(arr,name);
    },
    pop:(arr,cfg)=>{
        const id=`${config.prefix}pop`;
        const name="pop";
        const dom=self.domMenu(arr,name);

        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "pop"`);

        el.innerHTML="";
        el.appendChild(dom);
        el.style.top=`${cfg.offset[0]}px`;
        el.style.left=`${cfg.offset[1]}px`;
        el.hidden=false;
        self.bindActions(arr,name);
    },
    compass:(val,cfg)=>{
        const id=`${config.prefix}compass`;

        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "compass"`);

        el.innerHTML="";
        //SVG pointer
        const pointer=`<svg viewBox="0 0 100 100" width="100%" height="100%"  class="pointer">
                <g transform="rotate(${val}, 50, 50)">
                    
                    <polygon points="50,10 45,50 55,50" fill="red" />
                    <!-- <polygon points="50,90 45,50 55,50" fill="gray" /> -->
                    <circle cx="50%" cy="50%" r="2%" fill="black" />
                </g>
            </svg>`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(pointer, 'text/html');
        el.appendChild(doc.body.firstChild);    
    },
    status:(val,cfg)=>{
        const id=`${config.prefix}status`;

        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "status"`);

        el.textContent = val;
    },
    
};

const UI={
    init:async (id)=>{
        const done=self.struct(id);
        if(done!==true && done.error) return done;
        UI.show("compass",0);
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
        self.hide(type);
    },
    
    //bind UI event
    //not React way, pure JS way to deal with UI component
    bind:(type,name,event)=>{

    },
}

export default UI;