/**
 * Plugin - QR
 *
 * @fileoverview
 *  1.show block owner QR, or donation QR.
 *
 * @author Fuu
 * @date 2025-04-29
 */

const reg={
    name:"qr", 
    type:"plugin",
    short:"e2",
};

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

const plug_qr={
    hooks:self.hooks,
    transform:self.transform,
    attribute:attribute,
}

export default plug_qr;