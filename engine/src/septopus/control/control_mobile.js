/**
 * 3D FPV controller for mobile
 *
 * @fileoverview
 *  1. screen interaction support
 *  2. control panel support
 *
 * @author Fuu
 * @date 2025-04-25
 */

const reg={
    name:"con_mobile",
    category:'controller',
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