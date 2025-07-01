/**
 * Render - 3D Render
 *
 * @fileoverview
 *  1. 3D render from `3D STD` data for observing
 *
 * @author Fuu
 * @date 2025-04-23
 */


const reg={
    name:"rd_observe",
    type:'render',
}

const config={
    
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
    }
};

const renderer={
    hooks:self.hooks,
    construct:(id)=>{

    },
    auto:(id)=>{

    },
}

export default renderer;