/* 
*  Septopus World Sky
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1.
*/

const reg={
    name:"time",        //组件名称
    category:'system',      //组件分类
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","time"],
                value:{
                    height:0,
                    year:0,
                    month:0,
                    day:0,
                    hour:0,
                }
            };
        },
    },
}

const vbw_time={
    hooks:self.hooks
}

export default vbw_time;