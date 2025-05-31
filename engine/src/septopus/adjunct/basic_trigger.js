/**
 * Basic component - Trigger
 *
 * @fileoverview
 *  1. Trigger event in 3D env.
 *  2. Interact with 3D Objects.
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"trigger",
    category:"basic",
    short:0x00b8,         //key的缩写，用于减少链上数据
    desc:"Trigger to make the scene interactable, great component.",
    version:"1.0.0",
}


const self={
    hooks:{
        reg:()=>{
            return reg;
        }
    },
    attribute:{

    },
    transform:{

    },
}

const basic_trigger={
    hooks:self.hooks,
    transform:self.transform,  
    attribute:self.attribute,
}

export default basic_trigger;