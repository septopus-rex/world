/**
 * Adjunct - water
 *
 * @fileoverview
 *  1. water component
 *  2. can go cross in
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"water",
    category:"adjunct",
    desc:"Water adjunct, used to create special landscape.",
    version:"1.0.0",
}

const config={
    
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        def:(data)=>{
            definition=data;
        },
    }
}

const adj_water={
    hooks:self.hooks,
}

export default adj_water;