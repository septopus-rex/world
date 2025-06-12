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

const def={
    "INDEX_OF_SIZE":            0,
    "INDEX_OF_POSITION":        1,
    "INDEX_OF_ROTATION":        2,
    "TRIGGER_SHAPE_OPTION":     3,      //["box","ball","more"]
    "TRIGGER_OPTION":           4,      //[""]
    "ACTION_GROUP":             5, 
    "CONTRACT_ID_ON_CHAIN":     6,
    "RUN_ONE_TIME":             7,
};

const reg={
    name:"trigger",
    category:"basic",
    short:0x00b8,
    desc:"Trigger of engine, for building games.",
    version:"1.0.0",
}

//trigger control target
//1. adjuncts;                  //including objects, lights and more
//2. player, or player basic parameters;
//3. system env;

const config={
    default: [[1.5, 0.2, 0.5], [1, 0.3, 0], [0, 0, 0], 1, 2, [ "ACTION_0", "ACTION_1"] , 4, 0],
    action:[["CONDITIONS_TO_START"],["ACTIONS_TODO"],["CONDITIONS_TO_ABORD"],["ACTIONS_RECOVER"]],
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