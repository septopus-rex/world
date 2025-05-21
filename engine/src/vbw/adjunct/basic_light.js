/* 
*  VBW lights support
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.
*/

const reg={
    name:"light",
    category:"basic",
    short:"b3",         //key的缩写，用于减少链上数据
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

    //from raw data on chain to standard action data
    decode:(arr)=>{

    },

    //
    render:(x,y,std)=>{

    },
}

export default basic_light;