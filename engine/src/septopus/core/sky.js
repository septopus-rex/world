/* 
*  Septopus World Sky
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.
*/

const reg={
    name:"sky",       //组件名称
    category:'system',    //组件分类
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","sky"],
                value:{
                    source:"",
                    type:"",
                }
            };
        },
    },
    transform:{

    },
}

const vbw_sky={
    hooks:self.hooks,
    transform:self.transform,
}

export default vbw_sky;