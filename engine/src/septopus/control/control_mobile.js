/* 
*  3D FPV controller for mobile
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-29
*  @functions
*  1. 
*/

const reg={
    name:"con_mobile",        //组件名称
    category:'controller',     //组件分类
}

const self={
    hooks:{
        reg:()=>{return reg},
    }
}

const control_mobile={
    hooks:self.hooks, 
}

export default control_mobile;