/* 
*  Basic components, stop to avoid walking in.
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.create stop
*/

const reg={
    name:"stop",
    category:"basic",
    short:"b4",         //key的缩写，用于减少链上数据
    desc:"Special box to avoid move forward.",
    version:"1.0.0",
}



const self={
    hooks:{
        reg:()=>{
            return reg;
        }
    }
}

const basic_stop={
    hooks:self.hooks,
}

export default basic_stop;