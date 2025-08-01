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
        cross:{},
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
        touch:{},
    },
    module:{
        parsed:{},
        failed:{},
    }
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
    randomName:(n)=>{
        const len=!n?12:n;
        let hash = 'event_';
        const hexChars = '0123456789abcdef';
        for (let i = 0; i < n; i++) {
            hash += hexChars[Math.floor(Math.random() * 16)];
        }
        return hash;
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
     * @param   {function}  fun      - binding function
     * @param   {object}    [obj]      - binding object, {x:2025,y:619,world:0,index:0,adjunct:"wall"}
     * 
     * */
    on:(cat,event,fun,obj)=>{
        if(!events[cat]) return {error:"Invalid event type"};
        if(!events[cat][event]) return {error:"Invalid special event"};
        
        if(obj===undefined){
            const name=self.randomName();
            events[cat][event][name]=fun;
            return true;
        }else{
            const name=self.getNameByObj(obj);
            if(name.error) return name;
            events[cat][event][name]=fun;
            return true;
        }
    },

    off:(cat,event,name)=>{
        if(!events[cat]) return {error:"Invalid event type"};
        if(!events[cat][event]) return {error:"Invalid special event"};
        delete events[cat][event][name];
    },

    /**
     *  
     * @param   {string}    cat      - event cat
     * @param   {string}    event    - special event
     * @param   {object}    param    - params from event
     * @param   {object}    [obj]    - binding object, {x:2025,y:619,world:0,index:0,adjunct:"wall"}
     * 
     * */
    trigger:(cat,event,param,obj)=>{
        //console.log(cat,event,param,obj)
        if(!events[cat]) return {error:"Invalid event type"};
        if(self.empty(events[cat][event])) return {error:"Invalid special event"};

        if(obj===undefined){
            //1. normal event, not 
            for(let name in events[cat][event]){
                events[cat][event][name](param)
            }
        }else{
            for(let name in events[cat][event]){
                const target=self.getNameByObj(obj);
                if(name===target){
                    const fun=events[cat][event][name]
                    fun(param);
                }
            }
        }
    },

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