/* 
*  VBW sky
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1.
*/

const reg={
    name:"wealth",       //组件名称
    category:'system',      //组件分类
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","weather"],
                value:{
                    hash:"",
                    depth:"",
                }
            };
        },
    },
}

const vbw_weather={
    hooks:self.hooks,
}

export default vbw_weather;