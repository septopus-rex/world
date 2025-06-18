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
}


const runtime={
    system:{            //system events
        load:{},
        block:{},
    },
    object:{            //object events
        
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

    //function put on queue of frame sync
    checker:()=>{
        console.log(`Event check.`);
    },
}

const vbw_event = {
    hooks: self.hooks,

    //cfg: {type:"",container:""}
    on:(name,fun,cfg)=>{
        const type=!cfg.type?"object":cfg.type;
        if(!runtime[type]) return {error:"Invalid event type"};
    },

    start:(world,dom_id)=>{
        const frame_chain = ["block", dom_id, world, "loop"];
        const queue = VBW.cache.get(frame_chain);
        queue.push({ name: "event_checker", fun: self.checker});
    },
}
export default vbw_event;