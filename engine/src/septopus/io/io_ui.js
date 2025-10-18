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
            click:null,
        },
    },
    mode:{
        events:{
            click:null,
        },
    },
    fold:{
        events:{
            click:null,
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
    },
    countdown:{
        events:{
            click:null,
        },
    },
    controller:{
        events:{
            close:null,
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
        for(const vv of val){
            ctx+=`<option value="${vv}">${vv}</option>`;
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
    show:(type)=>{
        const id=`${config.prefix}${type}`;
        const container=document.getElementById(id);
        container.hidden = true;
        container.style.display="block";
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
                
                //set from to trigger event
                if(row.from){
                    //console.log(row.from,doms[row.from]);
                    if(doms[row.from] && doms[row.from].events && doms[row.from].events.click){
                        doms[row.from].events.click();
                    }
                }

                self.hideActive();
            });
        }
    },
    hideActive:()=>{
        self.hide("pop");
        self.hide("menu");
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

        //3.attatch events;
        if(cfg.events){
            for(let evt in cfg.events){
                if(doms.dialog.events[evt]===undefined) continue;
                doms.dialog.events[evt]=cfg.events;
            }
        } 
    },
    dialog:(ctx,cfg)=>{
        //1. create dom
        const id=`${config.prefix}dialog`;
        const el=document.getElementById(id);
        if(el.style.display==="block") return false;        //ignore duplicate request, only single dialog
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

        //2. auto run to support more function
        if(cfg && cfg.auto) cfg.auto();

        //3.attatch events;
        if(cfg && cfg.events){
            for(let evt in cfg.events){
                if(doms.dialog.events[evt]===undefined) continue;
                doms.dialog.events[evt]=cfg.events[evt];
            }
        } 

        //4.dialog events
        const close=document.getElementById(config.dialog.close);
        close.addEventListener("click",(ev)=>{
            el.style.display="none";
            el.hidden=true;
            if(doms.dialog.events.close) doms.dialog.events.close(ev);
            for(let k in doms.dialog.events)doms.dialog.events[k]=null;  //binding recover
        });
        
        //5. hide active UI components.
        self.hideActive();
    },
    toast:(ctx,cfg)=>{
        const msg=`[UI.toast]:`+ctx;
        console.log(msg);
        // if(cfg && cfg.type==="error") return console.error(msg);
        // const id=`${config.prefix}toast`;

        // const el=document.getElementById(id);
        // if(el===null) return console.error(`No container to show "toast"`);

        // el.textContent = ctx;
        // el.hidden = false;
    },
    fold:(ctx,cfg)=>{
        const id=`${config.prefix}fold`;
        const name="fold";
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "menu"`);
        const pointer=`<div id="${cfg.id}">${ctx[0]}</div>`;
        const doc = self.getDom(pointer);
        const dom = doc.body.firstChild;
        dom.expand=false;               //default to close

        //console.log(dom);
        el.appendChild(dom);
        if(cfg && cfg.auto) cfg.auto();
    },
    menu:(arr,cfg)=>{
        const id=`${config.prefix}menu`;
        const name="menu";
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "menu"`);
        
        el.innerHTML="";
        const dom=self.domMenu(arr,name);
        el.appendChild(dom);
        el.style.display="block";

        //3.attatch events;
        if(cfg.events){
            //console.log(cfg.events);
            for(let evt in cfg.events){
                //console.log(doms.menu.events,evt)
                if(doms.menu.events[evt]===undefined) continue;
                //console.log(evt);
                doms.menu.events[evt]=cfg.events[evt];
            }
        }

        for(let i=0;i<arr.length;i++) arr[i].from="menu";

        self.bindActions(arr,name);
    },
    
    pop:(arr,cfg)=>{
        const id=`${config.prefix}pop`;
        const name="pop";
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "pop"`);

        const dom=self.domMenu(arr,name);
        el.innerHTML="";
        el.appendChild(dom);
        el.style.top=`${cfg.offset[0]}px`;
        el.style.left=`${cfg.offset[1]}px`;
        el.style.display="block";
        self.bindActions(arr,name);
    },
    mode:(arr,cfg)=>{
        const id=`${config.prefix}mode`;
        const name="mode";
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "mode" buttons`);

        const dom=self.domMenu(arr,name);
        el.innerHTML="";
        el.appendChild(dom);

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
        const doc = self.getDom(pointer);
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
    countdown:(val,cfg)=>{
        const id=`${config.prefix}countdown`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "countdown"`);
        el.innerHTML="";
        
        const second=`<h1>${val}</h1>`;
        const doc = self.getDom(second);
        el.appendChild(doc.body.firstChild);
        el.style.display="block";
        el.hidden=false;

        const timer = setInterval(()=>{
            if(val===0){
                clearInterval(timer);
                el.style.display="none";
                el.hidden=true;
                if(cfg && cfg.callback) cfg.callback();
                return true;
            }
            val--;
            el.innerHTML="";
            const second=`<h1>${val}</h1>`;
            const doc = self.getDom(second);
            el.appendChild(doc.body.firstChild);
        },1000);
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
    controller:(val,cfg)=>{
        const id=`${config.prefix}controller`;
        const el=document.getElementById(id);
        if(el===null) return console.error(`No container to show "controller"`);

        const dom=self.getDom(`
            <div class="grid">
                <div class="direction" id="forward">↑</div>
            </div>
            <div class="half">
                <div class="direction" id="leftward">←</div>
            </div>
            <div class="half">
                <div class="direction" id="rightward">→</div>
            </div>
            <div class="grid">
                <div class="direction" id="backward">↓</div>
            </div>
        `);
        el.innerHTML="";
        el.appendChild(dom.body);
        el.style.display="grid";

        if(cfg && cfg.start && cfg.end){
            for(let key in cfg.start){
                const btn=document.getElementById(key);
                if(btn===null) return console.error(`Invalid key name "${key}"`);
                btn.addEventListener("touchstart",cfg.start[key]);
                btn.addEventListener("touchend",cfg.end[key]);
            }
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

    //UI update entry.
    update:(type,ctx,cfg)=>{

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

    /**
    * Trigger task, supply functions for trigger
    */
    task:()=>{
        return {
            dialog:(txt,title)=>{
                const ctx={
                    title:txt,
                    content:title,
                }
                router.dialog(ctx,{});
            },
            toast:router.toast,
            countdown:router.countdown,
            router: [
                { method:"dialog", gameonly:false},
                { method:"toast", gameonly:false},
                { method:"countdown", gameonly:true},
            ],
        }
    },
}

export default UI;