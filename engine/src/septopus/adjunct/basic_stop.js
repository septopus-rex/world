/**
 * Basic component - Stop
 *
 * @fileoverview
 *  1. Stop use from move in.
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"stop",
    category:"basic",
    short:"b4",
    desc:"Special component to avoid move forward.",
    version:"1.0.0",
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
    },
    attribute:{

    },
    transform:{

    },
}

const basic_stop={
    hooks:self.hooks,
    transform:self.transform,  
    attribute:self.attribute,
}

export default basic_stop;