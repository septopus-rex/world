/**
 * Adjunct - light
 *
 * @fileoverview
 *  1. light for improving render result
 *  2. support off/on in the furtuer
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"light",
    category:"basic",
    short:"b3",
    desc:"",
    version:"1.0.0",
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        }
    }
}

const basic_light={
    hooks:self.hooks,
}

export default basic_light;