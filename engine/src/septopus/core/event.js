/**
 * Core - event
 *
 * @fileoverview
*  1. event management, trigger support
 *
 * @author Fuu
 * @date 2025-06-18
 */

import VBW  from "./framework";

const reg={
    name:"event",          //register key name
    category:"system",      //component category
    desc:"Septopus event system, 3D world events.",
    version:"1.0.0",
}

const config={
    hold:{
        block:20000,
        trigger:5000,
    },
    beside:{
        stop:0.5,
        block:1,
        trigger:1,
    },
}

//saving all bind functions, run when trigger
const events={
    system:{            //system events
        init:null,
        off:null,
        restart:null,
    },
    block:{
        in:null,
        out:null,
        hold:null,
    },
    adjunct:{
        in:null,
        out:null,
        hold:null,
        touch:null,
    },
    stop:{
        beside:null,
        under:null,
    },
    trigger:{           //trigger events
        in:{},
        out:null,
        hold:null,
        on:null,
        beside:null,
        under:null,
    },
}

const runtime={
    player:null,        //player detail
    active:null,        //active instance
    block:null,
    trigger:null,
    stop:null,
    system:{
        init:false,
    },
}

const monitor={
    block:{
        in:()=>{

        },
        out:()=>{

        }
    }
}

const self={
    hooks:{
        reg: () => {
            //console.log(`event component here.`);
            return reg;
        },
        init: () => {
            return {
                chain: ["env", "event"],
                value: {},
            };
        },
    },
    empty:(obj)=>{
        if(obj===null) return true;
        for(let k in obj) return false;
        return true;
    },
    //function put on queue of frame sync
    checker:()=>{
        //console.log(`Event check.`);
        //1. check player position

        //2. check whether trigger event on
    },
}

const vbw_event = {
    hooks: self.hooks,

    //print support events list.
    list:()=>{
        const result={};
        for(let cat in events){
            if(!result[cat]) result[cat]=[];
            for(let evt in events[cat]) result[cat].push(evt);
        }
        return result;
    },

    /**
     *  
     * @param   {string}    cat      - event cat
     * @param   {string}    event    - special event
     * @param   {string}    name     - binding name
     * @param   {function}  fun      - binding function
     * 
     * */
    on:(cat,event,name,fun)=>{
        //console.log(name,fun,cfg);
        //const type=!cfg.type?"object":cfg.type;
        if(!events[cat]) return {error:"Invalid event type"};
        if(!events[cat][event]) return {error:"Invalid special event"};
        events[cat][event][name]=fun;
        
    },

    off:(cat,event,name)=>{
        if(!events[cat]) return {error:"Invalid event type"};
        if(!events[cat][event]) return {error:"Invalid special event"};
        delete events[cat][event][name];
    },

    trigger:(cat,event,param)=>{
        console.log(cat,event,param);
        if(!events[cat]) return {error:"Invalid event type"};
        if(self.empty(events[cat][event])) return {error:"Invalid special event"};

        //1. event monitor
        if(monitor[cat] && monitor[cat][event]){
            monitor[cat][event](param);
        }

        //2. binding functions running
        for(let name in events[cat][event]){
            const fun=events[cat][event][name]
            fun(param);
            
        }
    },

    // exsist:(cat,event,name)=>{
    //     if(!events[cat]) return {error:"Invalid event type"};
    //     if(!events[cat][event]) return {error:"Invalid special event"};
    //     if(![cat][event][name]) return false;
    //     return true;
    // },

    //check event whether loaded.
    // exsist:(name,x,y,world,dom_id)=>{
    //     const key=`${world}_${x}_${y}_${name}`;
    //     if(cache[key]===undefined) return false;
    //     return true;
    // },

    start:(world,dom_id)=>{
        //1. set frame sync function
        const frame_chain = ["block", dom_id, world, "loop"];
        const queue = VBW.cache.get(frame_chain);
        queue.push({ name: "event_checker", fun: self.checker});

        //2. get the env for checking
        if(runtime.player===null) runtime.player=VBW.cache.get(["env", "player"]);
        if(runtime.active===null) runtime.active=VBW.cache.get(["active"]);

        //console.log(self.empty(events.trigger.in));
        //console.log(self.empty(events.trigger.out));
    },
}
export default vbw_event;