/**
 * Component Sample
 *
 * @fileoverview
 *  1. struct of adjunct
 *
 * @author Fuu
 * @date 2025-04-25
 */

const reg = {
    name: "NAME",        //Name of adjunct
    category: 'adjunct', //category of adjunct
    desc: "Sample adjunct.",     //Desription of adjunct
    version: "1.0.0",            //Version
}

const config = {

}
const self = {

}

let definition = null;       //cache adjunct definition here.

const hooks = {
    reg: () => {
        return reg;
    },
    init: () => {          //create cache by return result {chain:[PATH_OF_CACHE],value:VALUE} 
        // return{
        //     chain:["env","player"],
        //     value:{}
        // };
    },

    def: (data) => {
        definition = data;
    },

    //`cfg` to support more complex animation. Rewrite the parameters for animation.
    animate: (meshes, cfg) => {

    },
};
const attribute = {
    add: (p, raw) => { },
    remove: (p, raw) => { },
    set: (p, raw, limit) => { },
    combine: (p, row) => { },
};
const transform = {
    raw_std: (arr, cvt) => {
        // return STD[]
    },
    std_raw: (arr, cvt) => {
        // return RAW[]
    },
    std_3d: (arr, va) => {
        // return 3D_STD[]
    },
    std_acitve: (std, va) => {
        // return 3D_STD[]
    },
    std_box: (std) => {
        // return STD
    },
};

const menu = {

}
const task = {
    hide:()=>{

    },
    show:()=>{

    },
    router: [
        { method:"hide", gameonly:true},
        { method:"show", gameonly:true},
    ],
}
const events = {}

const adj_sample = {
    hooks: hooks,
    transform: transform,
    attribute: attribute,
    menu: menu,
    task: task,
    events: events,
}

export default adj_sample;