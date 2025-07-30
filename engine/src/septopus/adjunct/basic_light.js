/**
 * Adjunct - light
 *
 * @fileoverview
 *  1. light for improving render result
 *  2. support off/on in the furtuer
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"light",
    category:"basic",
    desc:"",
    version:"1.0.0",
}

let definition=null;
const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        def:(data)=>{
            definition=data;
        },
    },
    attribute:{
        add:(p,raw) => {},
        remove: (p,raw) => {},
        set:(p,raw,limit)=>{},
        combine: (p,row) => {},
    },
    transform:{
        raw_std:(arr,cvt)=>{
            // return STD[]
        },
        std_raw:(arr,cvt)=>{
            // return RAW[]
        },
        std_3d:(arr,va)=>{
            // return 3D_STD[]
        },
        std_acitve:(std, va)=>{
            // return 3D_STD[]
        },
        std_box:(std)=>{
            // return STD
        },
    },
}

const basic_light={
    hooks:self.hooks,
    transform:self.transform,
    attribute:self.attribute,
}

export default basic_light;