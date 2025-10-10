/**
 * Render - 3D Render
 *
 * @fileoverview
 *  1. 3D render from `3D STD` data for observing
 *
 * @author Fuu
 * @date 2025-04-23
 */

import VBW from "../core/framework";

const reg={
    name:"rd_observe",
    type:'render',
    desc: "Ovserve renderer to show single block.",
    version:"1.0.0",
    events:["ready","done"],
}

const config={
    container:"observe_container",
    camera:{

    },
};

const env = {
    camera:null,
    block:[0,0],
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
    },

};

const renderer={
    hooks:self.hooks,
    construct:(width, height, dom_id, cfg)=>{

    },
    show:(container,blocks)=>{
        
        const dom_id= VBW.cache.get(["active","current"]);

        console.log(`Container ID`,container);
        console.log(`Dom ID`,dom_id);

    },
    clean:(dom_id, world, x, y)=>{

    },
}

export default renderer;