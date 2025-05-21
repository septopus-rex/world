/* 
*  VBW world entry
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1. 
*/

const reg={
    name:"con_two",        //组件名称
    category:'controller',     //组件分类
    desc:"",
    version:"1.0.0",
}

const self={
    hooks:{
        reg:()=>{return reg},
    }
}

const control_2d={
    hooks:self.hooks, 
}

export default control_2d;