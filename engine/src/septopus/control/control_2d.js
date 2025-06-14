/**
 * 2D controller for 2D map
 *
 * @fileoverview
 *  1. screen interaction support
 *  2. 
 *
 * @author Fuu
 * @date 2025-04-25
 */

const reg={
    name:"con_two",
    category:'controller',
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
    start: (dom_id) => {
        console.log(`Binding actions to 2D map of ${dom_id}`);
    },
}

export default control_2d;