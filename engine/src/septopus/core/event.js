/**
 * Core - event
 *
 * @fileoverview
 *  1. event management, trigger support
 *  2. event checking in frame sync function
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
        init:{},
        launch:{},
        off:{},
        restart:{},
    },
    player:{
        fall:{},
        death:{},
        start:{},
    },
    block:{
        in:{},
        out:{},
        hold:{},
        stop:{},
        loaded:{},
    },
    adjunct:{
        in:{},
        out:{},
        hold:{},
        touch:{},
    },
    stop:{
        on:{},
        leave:{},
        beside:{},
        under:{},
    },
    trigger:{           //trigger events
        in:{},
        out:{},
        hold:{},
        on:{},
        beside:{},
        under:{},
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
    },
    stop:{
        beside:()=>{

        },
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
    // abandon, leave to special component to trigger event
    checker:()=>{
        //console.log(`Event check.`);
        //1. check player position

        //2. check whether trigger event on
    },

    getNameByObj:(obj)=>{
        if(typeof obj === 'string' || obj instanceof String) return obj;
        if(!obj.x || !obj.y || !obj.adjunct || obj.index===undefined) return {erro:"Invalid event object."}
        return `${obj.x}_${obj.y}_${!obj.world?0:obj.world}_${obj.adjunct}_${obj.index}`;
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
     * @param   {object}    obj      - binding object, {x:2025,y:619,world:0,index:0,adjunct:"wall"}
     * @param   {function}  fun      - binding function
     * 
     * */
    on:(cat,event,obj,fun)=>{
        //console.log(cat,event,obj,fun);
        //const type=!cfg.type?"object":cfg.type;
        if(!events[cat]) return {error:"Invalid event type"};
        //console.log(events[cat])
        if(!events[cat][event]) return {error:"Invalid special event"};
        const name=self.getNameByObj(obj);

        //console.log(name)

        if(name.error) return name;
        events[cat][event][name]=fun;
        return true;
    },

    off:(cat,event,name)=>{
        if(!events[cat]) return {error:"Invalid event type"};
        if(!events[cat][event]) return {error:"Invalid special event"};
        delete events[cat][event][name];
    },

    trigger:(cat,event,param)=>{

        //console.log(cat,event,param);
        
        if(!events[cat]) return {error:"Invalid event type"};
        if(self.empty(events[cat][event])) return {error:"Invalid special event"};

        for(let name in events[cat][event]){
            //1. confirm the sepcial trigger object
            const target=self.getNameByObj(param);
            //console.log(name,target);
            if(name===target){

                const fun=events[cat][event][name]
                fun(param);

                //2 event monitor
                if(monitor[cat] && monitor[cat][event]){
                    monitor[cat][event](param);
                }
            }
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
        // const frame_chain = ["block", dom_id, world, "loop"];
        // const queue = VBW.cache.get(frame_chain);
        // queue.push({ name: "event_checker", fun: self.checker});

        //2. get the env for checking
        if(runtime.player===null) runtime.player=VBW.cache.get(["env", "player"]);
        if(runtime.active===null) runtime.active=VBW.cache.get(["active"]);

        //console.log(self.empty(events.trigger.in));
        //console.log(self.empty(events.trigger.out));
    },
}
export default vbw_event;