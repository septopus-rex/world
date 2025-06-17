/**
 * IO - UI components
 *
 * @fileoverview
 *  1. basic UI components, can be rewritten 
 *  2. form to set parameters of objects.
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
    },
    form:{
        close:"form_close",
        save:"form_save",
        recover:"form_recover",
    }
}
const replace={} 
const doms={
    toast:{
        events:{},
    },
    pop:{
        events:{
            show:null,
            close:null,
        },
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
    sidebar:{
        events:{

        },
    }
}

const inputs={
    number:(val,key,placeholder,prefix)=>{
        return `<input type="number" value="${val}" id="${!prefix?"":(prefix+"_")}${key}" placeholder="${placeholder}">`;
    },
    integer:(val,key,placeholder,prefix)=>{
        return `<input type="number" value="${val}" id="${!prefix?"":(prefix+"_")}${key}" placeholder="${placeholder}">`;
    },
    string:(val,key,placeholder,prefix)=>{
        return `<input type="text" value="${val}" id="${!prefix?"":(prefix+"_")}${key}" placeholder="${placeholder}">`;
    },
    boolean:(val,key,placeholder,prefix)=>{

    },
    select:(val,key,placeholder,prefix)=>{
        let ctx=`<select id="${!prefix?"":(prefix+"_")}${key}">`;
        //console.log(val,key,placeholder,prefix);
        for(let i=0;i<val.length;i++){
            ctx+=`<option value="${val[i]}">${val[i]}</option>`;
        }
        ctx+=`</select>`;
        return ctx
    },
    text:(val,key,placeholder,prefix)=>{
        return `<input type="text" value="${val}" id="${!prefix?"":(prefix+"_")}${key}" placeholder="${placeholder}">`;
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
        container.style.display="none";
    },
    domMenu:(arr,name)=>{
        let ctx=`<ul class="buttons">`;
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            ctx+=`<li id="${name}_${i}">${row.label}</li>`;
        }
        const doc=self.getDom(ctx);
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
    setErrorInfo:(key,info,type)=>{
        const id=`${key}_info`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`Invalid dom to show error message.`);
        el.innerHTML=info;

        switch (type) {
            case "error":
                    el.style.color="#FF0000";
                break;

            case "info":
                
                break;
        
            default:
                break;
        }
    },
    getDom:(data)=>{
        const parser = new DOMParser();
        return  parser.parseFromString(data, 'text/html');
    },
    getInputs:(arr,prefix)=>{
        let ctx='<div>';
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            if(!row.type || !inputs[row.type]){
                console.error(`Error input: ${JSON.stringify(row)}`)
                continue;
            }
            const input=inputs[row.type](row.value,row.key,row.desc,prefix);
            ctx+=`<div class="row">
                <span class="pr-1">${row.label}</span>${input}
            </div>`;
        }
        ctx+='</div>';
        return ctx;
    },
    getGroups:(arr,prefix)=>{
        let txt="";
        for(let i=0;i<arr.length;i++){
            const group=arr[i];
            const ctx=self.getInputs(group.inputs,prefix);
            txt+=`<div>
                <strong>${group.title}</strong>
                ${ctx}
                <hr class="sub"/>
            </div>`
        }
        return txt;
    },
}; 

const router={
    sidebar:(arr,cfg)=>{
        //1.create dom;
        const id=`${config.prefix}sidebar`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "form"`);
        el.innerHTML="";

        const title=`<div class="title">${cfg.title}</div><hr/>`;
        const body=self.getGroups(arr,cfg.prefix);
        const dom=self.getDom(title+body);
        
        el.appendChild(dom.body);
        el.style.display="block";

        //2.bind events to avoid click go cross;
        el.addEventListener("click",(ev)=>{
            self.hide("pop");
            ev.preventDefault();
            ev.stopPropagation();
        });

        //3.bind events;
        for(let i=0;i<arr.length;i++){
            const group=arr[i];
            if(!group.inputs) continue;
            for(let j=0;j<group.inputs.length;j++){
                const row=group.inputs[j];
                const single=document.getElementById(`${cfg.prefix}_${row.key}`);
                ((single,row,cfg)=>{
                    single.addEventListener("change",(ev)=>{
                        single.disabled=true;   //disable input until done;
                        const cvt=cfg.convert;
                        const val=row.valid(ev.target.value,cvt);

                        if(!val){
                            single.style.borderColor="#FF0000";
                            single.value="";
                            single.disabled=false;
                            return false;
                        }

                        const res={};
                        res[row.key]=val;
                        if(cfg.events && cfg.events.change){
                            cfg.events.change(res);
                        };
                        single.disabled=false;
                    });
                })(single,row,cfg);
            }
        }
    },
    form:(arr,cfg)=>{
        //1. create DOM
        const ctx=self.getForm(arr);
        const id=`${config.prefix}form`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "form"`);
        el.innerHTML="";
        const data=`
            <div class="title">${cfg.title}</div>
            <svg class="close" id="${config.form.close}" viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <hr />
            <div class="body">
                ${ctx}
            </div>
            <div class="foot">
                <button class="left" id="${config.form.recover}">Recover</button>
                <button class="right" id="${config.form.save}">Save</button>
            </div>`;
        const doc=self.getDom(data);
        el.appendChild(doc.body); 
        el.style.display="block";
        el.hidden=false;

        const result={};

        //2. function binding
        //2.1 basic function
        const close=document.getElementById(config.form.close);
        close.addEventListener("click",(ev)=>{
            el.style.display="none";
            el.hidden=true;
        });

        //2.2 buttons function
        const save=document.getElementById(config.form.save);
        save.addEventListener("click",(ev)=>{
            console.log(`save button`);
            if(!cfg || !cfg.events || !cfg.events.save) return console.error("Saving event function missed.");
            cfg.events.save({hello:"world"});
        });

        const recover=document.getElementById(config.form.recover);
        recover.addEventListener("click",(ev)=>{
            console.log(`recover button`);
            //el.style.display="none";
            //el.hidden=true;
        });

        //2.3 binding input check
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            const single=document.getElementById(row.key);
            if(single===null) continue;
            single.addEventListener("change",(ev)=>{
                ((key)=>{
                    //console.log(key);
                    const res=row.valid(ev.target.value);
                    if(res!==true){
                        self.setErrorInfo(key,res,"error");
                    }
                })(row.key);
            });
        }
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
        const doc=self.getDom(data);
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
        el.style.display="block";
        self.bindActions(arr,name);
    },
    compass:(val,cfg)=>{
        const id=`${config.prefix}compass`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "compass"`);

        //1. set DOM
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

        //TODO, need to manage events to avoid multi bind.
        //2. bind events
        if(doms.compass.events.click!==null){
            el.removeEventListener("click",doms.compass.events.click);
        }

        if(cfg && cfg.events && cfg.events.click){
            doms.compass.events.click=cfg.events.click;
            el.addEventListener("click",doms.compass.events.click)
        }
    },
    status:(val,cfg)=>{
        const id=`${config.prefix}status`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "status"`);

        //1. set dom
        el.textContent = val;

        //2. bind events
        if(doms.status.events.click!==null){
            el.removeEventListener("click",doms.status.events.click);
        }

        if(cfg && cfg.events && cfg.events.click){
            doms.status.events.click=cfg.events.click;
            el.addEventListener("click",doms.status.events.click)
        }
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
        if(Array.isArray(type)){
            for(let i=0;i<type.length;i++){
                const row=type[i];
                if(!router[row]){
                    console.error(`No UI component called "${row}" to hide, please check system.`);
                    continue;
                }
                self.hide(row);
            }
        }else{
            if(!router[type]) return console.error(`No UI component called "${type}" to hide, please check system.`);
            self.hide(type);
        }
    },
    
    //bind UI event
    //not React way, pure JS way to deal with UI component
    bind:(type,name,event)=>{

    },

    format:(type,param)=>{
        
    },
}

export default UI;