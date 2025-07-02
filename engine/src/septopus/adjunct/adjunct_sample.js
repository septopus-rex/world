/**
 * Component Sample
 *
 * @fileoverview
 *  1. struct of adjunct
 *
 * @author Fuu
 * @date 2025-04-25
 */

const reg={
    name:"NAME",        //Name of adjunct
    category:'adjunct', //category of adjunct
    desc:"Sample adjunct.",     //Desription of adjunct
    version:"1.0.0",            //Version
}

const config={

}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{          //create cache by return result {chain:[PATH_OF_CACHE],value:VALUE} 
            // return{
            //     chain:["env","player"],
            //     value:{}
            // };
        },

        //`cfg` to support more complex animation. Rewrite the parameters for animation.
        animate:(meshes,cfg)=>{

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
};

const adj_sample={
    hooks:self.hooks,
    transform:self.transform,
    attribute:self.attribute,
}

export default adj_sample;
