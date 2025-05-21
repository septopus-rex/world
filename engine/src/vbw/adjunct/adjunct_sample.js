/* 
*  Module block, single block
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1.
*/

const reg={
    name:"box",        //组件名称
    category:'adjunct',     //组件分类
    short:"a0",         //key的缩写，用于减少链上数据
    desc:"Sample adjunct.",
    version:"1.0.0",
}

const config={
    default:[],
    definition:{
        2025:[
            ['x','y','z'],
            ['ox','oy','oz'],
            ['rx','ry','rz'],
            'texture_id',
            ['rpx','rpy'],
        ],
    }
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            // return{
            //     chain:["env","player"],
            //     value:{
            //     }
            // };
        },
    },
    transform:{
        //链上数据转换成std的中间体
        //return [objs, preload]
        raw_std:(arr,cvt)=>{

        },

        std_raw:(arr,cvt)=>{

        },

        std_box:(obj)=>{

        },

        //std中间体，转换成3D需要的object
        std_3d:(arr,va)=>{

        },

        //std中间体，转换成2D需要的数据
        std_2d:(arr,face)=>{

        },

        //3D高亮时候，需要的3D的object
        acitve_3d:()=>{

        },

        //2D高亮时候，需要的2D的object
        active_2d:()=>{

        },
    },
};

export default {
    hooks:self.hooks,
    transform:self.transform,
}
